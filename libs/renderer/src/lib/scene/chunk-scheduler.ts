import {
  chunkKey,
  type BlockRegistry,
  type BuildDocument,
  type ChunkCoord,
} from '@laracraft/core-model';
import { extractChunkInput } from '../mesh/extract';
import { resolvePaletteRenderInfo } from '../mesh/render-info';
import type {
  ChunkMeshOutput,
  MesherRequest,
  MesherResponse,
  PaletteRenderInfo,
  TextureLayers,
} from '../mesh/types';
import { createMesherHandler } from '../mesh/worker-handler';

/** Where meshing happens: the mesher worker or the same handler on the main thread. */
export interface MesherBackend {
  post(request: MesherRequest, transfer?: ArrayBuffer[]): void;
  dispose(): void;
}

/** Receives finished chunk meshes (the three.js layer, or a stub in tests). */
export interface ChunkSink {
  setChunk(key: string, output: ChunkMeshOutput): void;
  removeChunk(key: string): void;
  clear(): void;
}

/** Main-thread backend: answers synchronously from inside `post`. */
export function createMainThreadBackend(onResponse: (r: MesherResponse) => void): MesherBackend {
  const handle = createMesherHandler();
  return {
    post(request) {
      const reply = handle(request);
      if (reply) onResponse(reply.response);
    },
    dispose() {
      /* nothing to release */
    },
  };
}

/** Minimal Worker surface used by the worker backend. */
export interface WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
  terminate(): void;
}

export function createWorkerBackend(
  worker: WorkerLike,
  onResponse: (r: MesherResponse) => void,
  onError: (message: string) => void = () => undefined,
): MesherBackend {
  worker.onmessage = (event) => onResponse(event.data as MesherResponse);
  worker.onerror = (event) => onError(event.message);
  return {
    post(request, transfer = []) {
      worker.postMessage(request, transfer);
    },
    dispose() {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    },
  };
}

export const parseChunkKey = (key: string): ChunkCoord => {
  const [x, y, z] = key.split(',').map(Number);
  return { x: x ?? 0, y: y ?? 0, z: z ?? 0 };
};

const isEmptyOutput = (o: ChunkMeshOutput): boolean =>
  o.opaque.indices.length === 0 &&
  o.cutout.indices.length === 0 &&
  o.translucent.indices.length === 0 &&
  o.models.length === 0;

/**
 * Chunk bookkeeping between the document and the GPU layer: tracks dirty chunks, keeps the
 * mesher's palette in sync (append-only → full resend when it grew), coalesces requests
 * (at most one in flight per chunk; a chunk dirtied while in flight is re-meshed after the
 * answer arrives) and drops answers that belong to a previous document.
 */
export class ChunkScheduler {
  private doc: BuildDocument | null = null;
  private palette: readonly PaletteRenderInfo[] = [];
  private maxY: number | null = null;
  private nextId = 1;
  private readonly dirty = new Set<string>();
  private readonly inFlight = new Map<string, number>();
  private readonly keyById = new Map<number, string>();
  private readonly rerun = new Set<string>();
  private readonly shown = new Set<string>();
  private readonly backend: MesherBackend;

  constructor(
    private readonly registry: BlockRegistry,
    private readonly textures: TextureLayers,
    private readonly sink: ChunkSink,
    createBackend: (onResponse: (r: MesherResponse) => void) => MesherBackend = (cb) =>
      createMainThreadBackend(cb),
    private readonly onError: (message: string) => void = () => undefined,
  ) {
    this.backend = createBackend((r) => this.handleResponse(r));
  }

  /** Palette render info of the current document (index-aligned). */
  get paletteInfo(): readonly PaletteRenderInfo[] {
    return this.palette;
  }

  get layerLimit(): number | null {
    return this.maxY;
  }

  /** Chunks currently shown (non-empty meshes). */
  get chunkCount(): number {
    return this.shown.size;
  }

  /** Requests waiting for an answer. */
  get pending(): number {
    return this.inFlight.size;
  }

  setDocument(doc: BuildDocument | null): void {
    this.doc = doc;
    this.dirty.clear();
    this.inFlight.clear();
    this.keyById.clear();
    this.rerun.clear();
    this.shown.clear();
    this.sink.clear();
    this.palette = [];
    if (!doc) return;
    doc.volume.takeDirtyChunks(); // everything is rebuilt anyway
    for (const c of doc.volume.chunkList())
      this.dirty.add(chunkKey(c.coord.x, c.coord.y, c.coord.z));
  }

  setLayerLimit(maxY: number | null): void {
    if (maxY === this.maxY) return;
    this.maxY = maxY;
    this.markAllDirty();
  }

  /** Marks every shown or existing chunk for re-meshing. */
  markAllDirty(): void {
    for (const k of this.shown) this.dirty.add(k);
    if (this.doc) {
      for (const c of this.doc.volume.chunkList()) {
        this.dirty.add(chunkKey(c.coord.x, c.coord.y, c.coord.z));
      }
    }
  }

  /**
   * Collects dirty chunks from the document and requests meshes for them.
   * Returns the keys that were requested or removed in this call.
   */
  update(): string[] {
    const doc = this.doc;
    if (!doc) return [];
    for (const k of doc.volume.takeDirtyChunks()) this.dirty.add(k);
    if (this.dirty.size === 0) return [];
    this.syncPalette(doc);
    const keys = [...this.dirty];
    this.dirty.clear();
    for (const key of keys) {
      if (this.inFlight.has(key)) this.rerun.add(key);
      else this.request(key);
    }
    return keys;
  }

  handleResponse(r: MesherResponse): void {
    const key = this.keyById.get(r.id);
    if (key === undefined) return; // stale (previous document) or unknown
    this.keyById.delete(r.id);
    if (this.inFlight.get(key) === r.id) this.inFlight.delete(key);
    if (r.type === 'error') this.onError(`Meshing chunk ${key} failed: ${r.message}`);
    else if (isEmptyOutput(r.output)) this.remove(key);
    else {
      this.shown.add(key);
      this.sink.setChunk(key, r.output);
    }
    if (this.rerun.delete(key)) this.request(key);
  }

  dispose(): void {
    this.setDocument(null);
    this.backend.dispose();
  }

  private remove(key: string): void {
    if (this.shown.delete(key)) this.sink.removeChunk(key);
  }

  private syncPalette(doc: BuildDocument): void {
    const size = doc.palette.size;
    if (size === this.palette.length) return;
    const entries = doc.palette.entries();
    // New array identity on every change: the mesher caches prepared palettes per array.
    this.palette = [
      ...this.palette,
      ...resolvePaletteRenderInfo(this.registry, entries.slice(this.palette.length, size)),
    ];
    this.backend.post({ type: 'init', palette: this.palette, textures: this.textures });
  }

  private request(key: string): void {
    const doc = this.doc;
    if (!doc) return;
    const coord = parseChunkKey(key);
    if (!doc.volume.getChunk(coord)) {
      this.remove(key);
      return;
    }
    const input = extractChunkInput(doc.volume, coord, this.maxY ?? undefined);
    const id = this.nextId++;
    this.inFlight.set(key, id);
    this.keyById.set(id, key);
    this.backend.post({ type: 'mesh', id, input }, [input.data.buffer as ArrayBuffer]);
  }
}
