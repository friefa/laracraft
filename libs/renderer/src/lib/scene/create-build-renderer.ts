import type {
  BlockRegistry,
  BlockStateString,
  Box3,
  BuildDocument,
  RenderLayer,
} from '@laracraft/core-model';
import * as THREE from 'three';
import { createTextureLayers } from '../mesh/texture-layers';
import type { TextureLayers } from '../mesh/types';
import { buildModelGeometry } from '../models';
import type { BuildRenderer, GhostBlock, HighlightGroup, RendererOptions, VoxelPick } from './api';
import { sliceAtlas } from './atlas-slicing';
import { createBlockMaterial, geometryFromBuffers } from './block-material';
import { syncCamera } from './camera-sync';
import { ChunkMeshes } from './chunk-meshes';
import { ChunkScheduler, createWorkerBackend, type ChunkSink } from './chunk-scheduler';
import { GestureController, type PointerSample } from './gestures';
import {
  NO_INSETS,
  OrbitCamera,
  visibleRegion,
  type LookDirection,
  type ViewInsets,
} from './orbit-camera';
import { Overlays } from './overlays';
import { chunkBounds, lowestBlockY, pickVoxel } from './picking';
import { createTextureArray, loadAtlas } from './texture-array';

/** Options beyond the lead-owned `RendererOptions` contract (all optional). */
export interface ExtraRendererOptions {
  /** Clear colour 0xRRGGBB (default: light sky blue). */
  readonly background?: number;
  /** Opacity of ghost blocks (default 0.5). */
  readonly ghostOpacity?: number;
}

/** `BuildRenderer` plus additions of this implementation (reported as contract additions). */
export interface SceneBuildRenderer extends BuildRenderer {
  /** Camera view direction for placement rules (horizontal facing + pitch class). */
  lookDirection(): LookDirection;
  /**
   * Canvas edges covered by UI. The view centre moves into the uncovered part and
   * `frame()` fits the build there, so the build does not sit under (translucent) toolbars.
   */
  setViewInsets(insets: ViewInsets): void;
}

const DEFAULT_BACKGROUND = 0xa9cbe8;
const PICK_DISTANCE = 256;

/**
 * Creates the three.js build renderer. Resolves once the texture array is loaded.
 * Browser only (WebGL2, fetch, ResizeObserver).
 */
export async function createBuildRenderer(
  options: RendererOptions & ExtraRendererOptions,
): Promise<SceneBuildRenderer> {
  const { atlas, image } = await loadAtlas(options.atlasUrl);
  const textures = createTextureLayers(atlas);
  const textureArray = createTextureArray(sliceAtlas(atlas, image));
  return new ThreeBuildRenderer(options, textures, textureArray);
}

class ThreeBuildRenderer implements SceneBuildRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly registry: BlockRegistry;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  private readonly orbit = new OrbitCamera();
  private readonly materials: Record<RenderLayer | 'ghost', THREE.ShaderMaterial>;
  private readonly chunkMeshes: ChunkMeshes;
  private readonly scheduler: ChunkScheduler;
  private readonly overlays: Overlays;
  private readonly gestures: GestureController<PointerEvent>;
  private readonly modelGeometries = new Map<string, THREE.BufferGeometry>();
  private readonly tapHandlers = new Set<(pick: VoxelPick | null, event: PointerEvent) => void>();
  private readonly resizeObserver: ResizeObserver | null;
  private readonly cleanups: (() => void)[] = [];
  private doc: BuildDocument | null = null;
  private bounds: Box3 | null = null;
  private groundY = 0;
  private insets: ViewInsets = NO_INSETS;
  private rafId = 0;
  private frameRequested = false;
  private disposed = false;
  private readonly frameTimes: number[] = [];

  constructor(
    options: RendererOptions & ExtraRendererOptions,
    private readonly textures: TextureLayers,
    private readonly textureArray: THREE.DataArrayTexture,
  ) {
    this.canvas = options.canvas;
    this.registry = options.registry;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(options.background ?? DEFAULT_BACKGROUND);

    this.materials = {
      opaque: createBlockMaterial('opaque', textureArray),
      cutout: createBlockMaterial('cutout', textureArray),
      translucent: createBlockMaterial('translucent', textureArray),
      ghost: createBlockMaterial('ghost', textureArray, options.ghostOpacity ?? 0.5),
    };

    this.chunkMeshes = new ChunkMeshes(this.materials, (index) => {
      const info = this.scheduler.paletteInfo[index];
      if (!info) return null;
      return { geometry: this.modelGeometry(info.state), layer: info.layer };
    });
    const sink: ChunkSink = {
      setChunk: (key, output) => {
        this.chunkMeshes.setChunk(key, output);
        this.invalidate();
      },
      removeChunk: (key) => {
        this.chunkMeshes.removeChunk(key);
        this.invalidate();
      },
      clear: () => {
        this.chunkMeshes.clear();
        this.invalidate();
      },
    };
    const onError = (message: string): void => console.error(`[renderer] ${message}`);
    const createWorker = options.createWorker;
    this.scheduler = new ChunkScheduler(
      options.registry,
      textures,
      sink,
      createWorker ? (cb) => createWorkerBackend(createWorker(), cb, onError) : undefined,
      onError,
    );

    this.overlays = new Overlays(this.materials.ghost, (state) => this.modelGeometry(state));
    this.overlays.setGrid(0, null);
    this.scene.add(this.chunkMeshes.root, this.overlays.root);

    this.gestures = new GestureController<PointerEvent>({
      orbit: (dx, dy) => this.cameraChanged(() => this.orbit.orbit(dx, dy, this.viewHeight())),
      pan: (dx, dy) => this.cameraChanged(() => this.orbit.pan(dx, dy, this.viewHeight())),
      zoom: (f) => this.cameraChanged(() => this.orbit.zoom(f)),
      tap: (s) => this.emitTap(s.event),
    });
    this.bindInput();

    const container = this.canvas.parentElement ?? this.canvas;
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
    } else this.resizeObserver = null;
    this.resize();
  }

  // ---- BuildRenderer -------------------------------------------------------------------

  setDocument(doc: BuildDocument): void {
    this.doc = doc;
    this.scheduler.setDocument(doc);
    this.scheduler.update();
    this.refreshBounds();
    this.frame();
  }

  update(): void {
    if (this.scheduler.update().length > 0) this.refreshBounds();
    this.invalidate();
  }

  setLayerLimit(maxY: number | null): void {
    this.scheduler.setLayerLimit(maxY);
    this.scheduler.update();
    this.invalidate();
  }

  setHighlights(groups: readonly HighlightGroup[]): void {
    this.overlays.setHighlights(groups);
    this.invalidate();
  }

  setGhosts(blocks: readonly GhostBlock[]): void {
    this.overlays.setGhosts(blocks);
    this.invalidate();
  }

  setSelectionBox(box: Box3 | null): void {
    this.overlays.setSelectionBox(box);
    this.invalidate();
  }

  pick(clientX: number, clientY: number): VoxelPick | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.applyCamera();
    const ndc = new THREE.Vector3(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
      0.5,
    );
    const origin = this.camera.position.clone();
    const direction = ndc.unproject(this.camera).sub(origin);
    const volume = this.doc?.volume;
    return pickVoxel(
      { origin, direction },
      (x, y, z) => (volume ? volume.get(x, y, z) !== 0 : false),
      {
        maxDistance: PICK_DISTANCE,
        maxY: this.scheduler.layerLimit,
        bounds: this.bounds,
        groundY: this.groundY,
      },
    );
  }

  onTap(handler: (pick: VoxelPick | null, event: PointerEvent) => void): () => void {
    this.tapHandlers.add(handler);
    return () => this.tapHandlers.delete(handler);
  }

  frame(box?: Box3): void {
    const target = box ??
      this.doc?.volume.bounds() ?? {
        min: { x: -8, y: 0, z: -8 },
        max: { x: 7, y: 3, z: 7 },
      };
    this.cameraChanged(() => this.orbit.frame(target, this.aspect(), this.region()));
  }

  stats(): { fps: number; drawCalls: number; triangles: number; chunks: number } {
    const now = performance.now();
    this.pruneFrameTimes(now);
    const info = this.renderer.info.render;
    return {
      fps: this.frameTimes.length,
      drawCalls: info.calls,
      triangles: info.triangles,
      chunks: this.scheduler.chunkCount,
    };
  }

  lookDirection(): LookDirection {
    return this.orbit.lookDirection();
  }

  setViewInsets(insets: ViewInsets): void {
    const i = this.insets;
    if (
      i.top === insets.top &&
      i.right === insets.right &&
      i.bottom === insets.bottom &&
      i.left === insets.left
    ) {
      return;
    }
    this.insets = { ...insets };
    this.invalidate();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();
    for (const fn of this.cleanups) fn();
    this.tapHandlers.clear();
    this.scheduler.dispose();
    this.chunkMeshes.clear();
    this.overlays.dispose();
    for (const g of this.modelGeometries.values()) g.dispose();
    this.modelGeometries.clear();
    for (const m of Object.values(this.materials)) m.dispose();
    this.textureArray.dispose();
    this.renderer.dispose();
  }

  // ---- internals -----------------------------------------------------------------------

  private modelGeometry(state: BlockStateString | string): THREE.BufferGeometry {
    let g = this.modelGeometries.get(state);
    if (!g) {
      const buffers = buildModelGeometry(this.registry, state, this.textures);
      g = geometryFromBuffers(buffers);
      this.modelGeometries.set(state, g);
    }
    return g;
  }

  private refreshBounds(): void {
    const volume = this.doc?.volume;
    this.bounds = volume ? chunkBounds(volume.chunkList().map((c) => c.coord)) : null;
    this.groundY = volume ? (lowestBlockY(volume) ?? 0) : 0;
    this.overlays.setGrid(this.groundY, this.bounds);
  }

  private emitTap(event: PointerEvent): void {
    if (this.tapHandlers.size === 0) return;
    const pick = this.pick(event.clientX, event.clientY);
    for (const h of [...this.tapHandlers]) h(pick, event);
  }

  private region() {
    return visibleRegion(this.viewWidth(), this.viewHeight(), this.insets);
  }

  private viewWidth(): number {
    return this.canvas.clientWidth || this.canvas.width || 1;
  }

  private viewHeight(): number {
    return this.canvas.clientHeight || this.canvas.height || 1;
  }

  private aspect(): number {
    return this.viewWidth() / this.viewHeight();
  }

  private cameraChanged(fn: () => void): void {
    fn();
    this.invalidate();
  }

  private applyCamera(): void {
    syncCamera(this.camera, this.orbit, this.viewWidth(), this.viewHeight(), this.insets);
  }

  private resize(): void {
    if (this.disposed) return;
    const container = this.canvas.parentElement;
    const w = Math.max(1, Math.round(container?.clientWidth ?? this.canvas.clientWidth));
    const h = Math.max(1, Math.round(container?.clientHeight ?? this.canvas.clientHeight));
    this.renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    this.renderer.setSize(w, h, container !== null);
    this.invalidate();
  }

  private invalidate(): void {
    if (this.frameRequested || this.disposed) return;
    this.frameRequested = true;
    this.rafId = requestAnimationFrame((now) => this.renderFrame(now));
  }

  private renderFrame(now: number): void {
    this.frameRequested = false;
    if (this.disposed) return;
    this.applyCamera();
    this.renderer.render(this.scene, this.camera);
    this.frameTimes.push(now);
    this.pruneFrameTimes(now);
  }

  private pruneFrameTimes(now: number): void {
    while (this.frameTimes.length > 0 && now - (this.frameTimes[0] as number) > 1000) {
      this.frameTimes.shift();
    }
  }

  private bindInput(): void {
    const c = this.canvas;
    c.style.touchAction = 'none';
    const sample = (e: PointerEvent): PointerSample<PointerEvent> => ({
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      t: e.timeStamp,
      button: e.button,
      pointerType: e.pointerType,
      event: e,
    });
    const listen = <K extends keyof HTMLElementEventMap>(
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ): void => {
      c.addEventListener(type, fn, opts);
      this.cleanups.push(() => c.removeEventListener(type, fn, opts));
    };
    listen('pointerdown', (e) => {
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
      this.gestures.down(sample(e));
    });
    listen('pointermove', (e) => this.gestures.move(sample(e)));
    listen('pointerup', (e) => this.gestures.up(sample(e)));
    listen('pointercancel', (e) => this.gestures.cancel(sample(e)));
    listen(
      'wheel',
      (e) => {
        e.preventDefault();
        const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.viewHeight() : 1;
        this.gestures.wheel(e.deltaY * scale);
      },
      { passive: false },
    );
    listen('contextmenu', (e) => e.preventDefault());
  }
}
