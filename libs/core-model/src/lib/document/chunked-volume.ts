import type { Box3, Vec3 } from '../math/vec3';
import { AIR_INDEX, type PaletteIndex } from './palette';

export const CHUNK_SIZE = 16;
const SHIFT = 4;
const MASK = CHUNK_SIZE - 1;
const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;

/** Chunk coordinate (block coordinate >> 4). */
export type ChunkCoord = Vec3;

/**
 * Allowed world coordinate range per axis: [-WORLD_LIMIT, WORLD_LIMIT).
 * Keeps all bit operations (`>>`, `&`, `<<`) inside int32 with a wide margin.
 * Minecraft's own world border is ±30 000 000, which fits.
 */
export const WORLD_LIMIT = 2 ** 25;

export const isValidCoordinate = (v: number): boolean =>
  Number.isInteger(v) && v >= -WORLD_LIMIT && v < WORLD_LIMIT;

function assertCoordinates(x: number, y: number, z: number): void {
  if (!isValidCoordinate(x) || !isValidCoordinate(y) || !isValidCoordinate(z)) {
    throw new RangeError(`Invalid block coordinate (${x}, ${y}, ${z})`);
  }
}

export const chunkKey = (cx: number, cy: number, cz: number): string => `${cx},${cy},${cz}`;

/** Local index inside a chunk: x + z*16 + y*256 (YZX order, like Sponge schematics). */
export const localIndex = (lx: number, ly: number, lz: number): number =>
  lx | (lz << SHIFT) | (ly << (SHIFT * 2));

export interface Chunk {
  readonly coord: ChunkCoord;
  /** Palette indices in YZX order, length 4096. Treat as read-only outside the volume. */
  readonly data: Uint16Array;
  /** Number of non-air blocks. */
  readonly count: number;
}

interface MutableChunk {
  coord: ChunkCoord;
  data: Uint16Array;
  count: number;
}

/**
 * Sparse, unbounded voxel storage in 16³ chunks. Chunks are the unit for
 * renderer meshing and dirty tracking. Empty chunks are released.
 * Coordinates may be negative.
 */
export class ChunkedVolume {
  private readonly chunks = new Map<string, MutableChunk>();
  private readonly dirty = new Set<string>();
  // One-entry lookup cache: sequential access (YZX scans, fills) hits the same chunk.
  private cacheX = NaN;
  private cacheY = NaN;
  private cacheZ = NaN;
  private cacheChunk: MutableChunk | undefined;

  private lookup(cx: number, cy: number, cz: number): MutableChunk | undefined {
    if (cx === this.cacheX && cy === this.cacheY && cz === this.cacheZ) return this.cacheChunk;
    const chunk = this.chunks.get(chunkKey(cx, cy, cz));
    this.cacheX = cx;
    this.cacheY = cy;
    this.cacheZ = cz;
    this.cacheChunk = chunk;
    return chunk;
  }

  private invalidateCache(): void {
    this.cacheX = this.cacheY = this.cacheZ = NaN;
    this.cacheChunk = undefined;
  }

  /** Returns the palette index at a position; air outside the world range. Throws on non-integers. */
  get(x: number, y: number, z: number): PaletteIndex {
    if (!isValidCoordinate(x) || !isValidCoordinate(y) || !isValidCoordinate(z)) {
      if (Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z)) return AIR_INDEX;
      throw new RangeError(`Invalid block coordinate (${x}, ${y}, ${z})`);
    }
    const chunk = this.lookup(x >> SHIFT, y >> SHIFT, z >> SHIFT);
    if (!chunk) return AIR_INDEX;
    return chunk.data[localIndex(x & MASK, y & MASK, z & MASK)] ?? AIR_INDEX;
  }

  /** Sets a block and returns the previous palette index. Throws outside the world range. */
  set(x: number, y: number, z: number, index: PaletteIndex): PaletteIndex {
    assertCoordinates(x, y, z);
    const cx = x >> SHIFT;
    const cy = y >> SHIFT;
    const cz = z >> SHIFT;
    const key = chunkKey(cx, cy, cz);
    let chunk = this.lookup(cx, cy, cz);
    if (!chunk) {
      if (index === AIR_INDEX) return AIR_INDEX;
      chunk = { coord: { x: cx, y: cy, z: cz }, data: new Uint16Array(CHUNK_VOLUME), count: 0 };
      this.chunks.set(key, chunk);
      this.invalidateCache();
    }
    const li = localIndex(x & MASK, y & MASK, z & MASK);
    const previous = chunk.data[li] ?? AIR_INDEX;
    if (previous === index) return previous;
    chunk.data[li] = index;
    if (previous === AIR_INDEX) chunk.count++;
    else if (index === AIR_INDEX) chunk.count--;
    this.markDirty(key, x & MASK, y & MASK, z & MASK, cx, cy, cz);
    if (chunk.count === 0) {
      this.chunks.delete(key);
      this.invalidateCache();
    }
    return previous;
  }

  /** Total number of non-air blocks. */
  get blockCount(): number {
    let n = 0;
    for (const c of this.chunks.values()) n += c.count;
    return n;
  }

  chunkList(): readonly Chunk[] {
    return [...this.chunks.values()];
  }

  getChunk(coord: ChunkCoord): Chunk | undefined {
    return this.chunks.get(chunkKey(coord.x, coord.y, coord.z));
  }

  /** Tight bounding box of all non-air blocks, or undefined when empty. */
  bounds(): Box3 | undefined {
    let min: { x: number; y: number; z: number } | undefined;
    let max: { x: number; y: number; z: number } | undefined;
    this.forEachBlock((x, y, z) => {
      if (!min || !max) {
        min = { x, y, z };
        max = { x, y, z };
        return;
      }
      if (x < min.x) min.x = x;
      if (y < min.y) min.y = y;
      if (z < min.z) min.z = z;
      if (x > max.x) max.x = x;
      if (y > max.y) max.y = y;
      if (z > max.z) max.z = z;
    });
    return min && max ? { min, max } : undefined;
  }

  /** Iterates all non-air blocks (order: chunk insertion order, then YZX). */
  forEachBlock(fn: (x: number, y: number, z: number, index: PaletteIndex) => void): void {
    for (const chunk of this.chunks.values()) {
      const bx = chunk.coord.x << SHIFT;
      const by = chunk.coord.y << SHIFT;
      const bz = chunk.coord.z << SHIFT;
      const d = chunk.data;
      for (let i = 0; i < CHUNK_VOLUME; i++) {
        const v = d[i] as number;
        if (v === AIR_INDEX) continue;
        fn(bx + (i & MASK), by + (i >> (SHIFT * 2)), bz + ((i >> SHIFT) & MASK), v);
      }
    }
  }

  /** Returns and clears the set of chunk keys changed since the last call (renderer remeshing). */
  takeDirtyChunks(): string[] {
    const keys = [...this.dirty];
    this.dirty.clear();
    return keys;
  }

  clear(): void {
    for (const key of this.chunks.keys()) this.dirty.add(key);
    this.chunks.clear();
    this.invalidateCache();
  }

  private markDirty(
    key: string,
    lx: number,
    ly: number,
    lz: number,
    cx: number,
    cy: number,
    cz: number,
  ): void {
    this.dirty.add(key);
    // Faces on chunk borders affect neighbour meshes (face culling).
    if (lx === 0) this.dirty.add(chunkKey(cx - 1, cy, cz));
    if (lx === MASK) this.dirty.add(chunkKey(cx + 1, cy, cz));
    if (ly === 0) this.dirty.add(chunkKey(cx, cy - 1, cz));
    if (ly === MASK) this.dirty.add(chunkKey(cx, cy + 1, cz));
    if (lz === 0) this.dirty.add(chunkKey(cx, cy, cz - 1));
    if (lz === MASK) this.dirty.add(chunkKey(cx, cy, cz + 1));
  }
}
