import {
  CHUNK_SIZE as CHUNK_SIZE_IMPORT,
  type ChunkCoord,
  type ChunkedVolume,
} from '@laracraft/core-model';

import type { ChunkMeshInput } from './types';

// Local copy: imported bindings may compile to property accesses in hot loops.
const CHUNK_SIZE: number = CHUNK_SIZE_IMPORT;

/** Edge length of the padded chunk array (chunk + 1-block border on each side). */
export const PADDED_SIZE = CHUNK_SIZE + 2;
/** Padded index stride along Z. */
export const PADDED_STRIDE_Z = PADDED_SIZE;
/** Padded index stride along Y. */
export const PADDED_STRIDE_Y = PADDED_SIZE * PADDED_SIZE;
export const PADDED_VOLUME = PADDED_SIZE * PADDED_SIZE * PADDED_SIZE;

/** Padded index of chunk-local coordinates (each in -1..16). */
export const paddedIndex = (lx: number, ly: number, lz: number): number =>
  lx + 1 + (lz + 1) * PADDED_STRIDE_Z + (ly + 1) * PADDED_STRIDE_Y;

/** For neighbour offset -1/0/+1: [first local source coord, count, first padded dest coord]. */
const RANGES: readonly (readonly [number, number, number])[] = [
  [CHUNK_SIZE - 1, 1, 0],
  [0, CHUNK_SIZE, 1],
  [0, 1, CHUNK_SIZE + 1],
];

/**
 * Builds the 18³ padded YZX input for one chunk directly from the chunk data arrays
 * of the chunk and its 26 neighbours (missing chunks stay air).
 */
export function extractChunkInput(
  volume: ChunkedVolume,
  coord: ChunkCoord,
  maxY?: number,
): ChunkMeshInput {
  const data = new Uint16Array(PADDED_VOLUME);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = volume.getChunk({ x: coord.x + dx, y: coord.y + dy, z: coord.z + dz });
        if (!chunk) continue;
        const src = chunk.data;
        const [sx, nx, px] = RANGES[dx + 1] as readonly [number, number, number];
        const [sy, ny, py] = RANGES[dy + 1] as readonly [number, number, number];
        const [sz, nz, pz] = RANGES[dz + 1] as readonly [number, number, number];
        for (let y = 0; y < ny; y++) {
          for (let z = 0; z < nz; z++) {
            const from = sx + (sz + z) * CHUNK_SIZE + (sy + y) * CHUNK_SIZE * CHUNK_SIZE;
            const to = px + (pz + z) * PADDED_STRIDE_Z + (py + y) * PADDED_STRIDE_Y;
            if (nx === 1) data[to] = src[from] ?? 0;
            else data.set(src.subarray(from, from + nx), to);
          }
        }
      }
    }
  }
  return maxY === undefined ? { coord, data } : { coord, data, maxY };
}
