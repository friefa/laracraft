import type {
  BlockRegistry,
  BlockStateString,
  Box3,
  BuildDocument,
  Direction,
  Vec3,
} from '@laracraft/core-model';

/** Result of picking a voxel under the pointer. */
export interface VoxelPick {
  /** The block hit. */
  readonly pos: Vec3;
  /** Face of `pos` that was hit; `pos + DIRECTION_OFFSET[face]` is where a new block goes. */
  readonly face: Direction;
}

export interface HighlightGroup {
  readonly id: string;
  readonly positions: readonly Vec3[];
  /** 0xRRGGBB */
  readonly color: number;
  readonly style: 'outline' | 'fill';
}

export interface GhostBlock {
  readonly pos: Vec3;
  readonly state: BlockStateString;
}

export interface RendererOptions {
  readonly canvas: HTMLCanvasElement;
  readonly registry: BlockRegistry;
  /** URL of `assets/textures/atlas.json` (atlas.png is resolved relative to it). */
  readonly atlasUrl: string;
  /** Mesher worker factory; omitted → meshing on the main thread (tests, fallback). */
  readonly createWorker?: () => Worker;
}

/**
 * Lead-owned contract between the app/editor and the three.js scene.
 * Camera control (orbit/pan/zoom for touch and mouse) is internal to the renderer.
 * Input gestures that are *not* camera gestures (single tap/click) are reported
 * through `onTap` so the editor can act on them.
 */
export interface BuildRenderer {
  setDocument(doc: BuildDocument): void;
  /** Remesh chunks that changed since the last call (reads `volume.takeDirtyChunks()`). */
  update(): void;
  /** Show only blocks with y <= maxY (layer slider); null = all. */
  setLayerLimit(maxY: number | null): void;
  setHighlights(groups: readonly HighlightGroup[]): void;
  /** Semi-transparent preview blocks (paste preview, next instruction step). */
  setGhosts(blocks: readonly GhostBlock[]): void;
  setSelectionBox(box: Box3 | null): void;
  pick(clientX: number, clientY: number): VoxelPick | null;
  /** Register tap/click handler (fires only when the gesture was not a camera move). */
  onTap(handler: (pick: VoxelPick | null, event: PointerEvent) => void): () => void;
  /** Frame the camera on a box (default: whole build). */
  frame(box?: Box3): void;
  /** Rendering statistics for the debug overlay and performance tests. */
  stats(): { fps: number; drawCalls: number; triangles: number; chunks: number };
  dispose(): void;
}
