import type { Box3, Direction, Vec3 } from '@laracraft/core-model';
import type { VoxelPick } from './api';

/** Plain 3D vector (not necessarily integer). */
export interface XYZ {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PickRay {
  readonly origin: XYZ;
  /** Ray direction; normalised internally. */
  readonly direction: XYZ;
}

export interface VoxelPickOptions {
  /** Maximum number of blocks travelled through the build (default 256). */
  readonly maxDistance?: number;
  /** Layer limit: blocks above this Y are ignored. */
  readonly maxY?: number | null;
  /**
   * Inclusive block bounds of the build (may be coarse, e.g. chunk bounds). The ray is
   * clipped to it first, so a camera far away from the build still reaches it.
   */
  readonly bounds?: Box3 | null;
  /**
   * Y of the ground plane (block boundary). When the ray hits no block, a hit on this plane
   * returns the cell *below* it with face `up`, so `pos + up` is where the first block goes.
   * null/undefined disables the fallback.
   */
  readonly groundY?: number | null;
  /** Maximum ray length for the ground plane fallback (default 4096). */
  readonly maxGroundDistance?: number;
}

/** Face entered when stepping along an axis in positive / negative direction. */
const ENTER_FACE: readonly (readonly [Direction, Direction])[] = [
  ['west', 'east'],
  ['down', 'up'],
  ['north', 'south'],
];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Slab test against [min, max]; returns [tNear, tFar, axis of tNear] or null. */
function clipRay(
  o: readonly number[],
  d: readonly number[],
  min: readonly number[],
  max: readonly number[],
): [number, number, number] | null {
  let tNear = -Infinity;
  let tFar = Infinity;
  let nearAxis = -1;
  for (let a = 0; a < 3; a++) {
    const oa = o[a] as number;
    const da = d[a] as number;
    const lo = min[a] as number;
    const hi = max[a] as number;
    if (Math.abs(da) < 1e-12) {
      if (oa < lo || oa > hi) return null;
      continue;
    }
    let t1 = (lo - oa) / da;
    let t2 = (hi - oa) / da;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tNear) {
      tNear = t1;
      nearAxis = a;
    }
    if (t2 < tFar) tFar = t2;
    if (tNear > tFar) return null;
  }
  if (tFar < 0) return null;
  return [tNear, tFar, nearAxis];
}

function makePick(
  cell: readonly number[],
  face: Direction,
  point: readonly number[],
  faceAxis: number,
): VoxelPick {
  const local = [0, 1, 2].map((a) => clamp01((point[a] as number) - (cell[a] as number)));
  // Snap the component along the face normal exactly onto the face.
  if (faceAxis >= 0) {
    const positive = face === 'east' || face === 'up' || face === 'south';
    local[faceAxis] = positive ? 1 : 0;
  }
  return {
    pos: { x: cell[0] as number, y: cell[1] as number, z: cell[2] as number },
    face,
    hit: { x: local[0] as number, y: local[1] as number, z: local[2] as number },
  };
}

/**
 * Voxel raycast (Amanatides & Woo DDA) against a block predicate. Returns the first solid
 * cell with the face the ray entered through and the hit point inside the cell, or the
 * ground plane fallback, or null. Pure; used by the renderer's `pick` and in tests.
 */
export function pickVoxel(
  ray: PickRay,
  isSolid: (x: number, y: number, z: number) => boolean,
  options: VoxelPickOptions = {},
): VoxelPick | null {
  const len = Math.hypot(ray.direction.x, ray.direction.y, ray.direction.z);
  if (!(len > 0) || !Number.isFinite(len)) return null;
  const o = [ray.origin.x, ray.origin.y, ray.origin.z];
  const d = [ray.direction.x / len, ray.direction.y / len, ray.direction.z / len];
  const maxDistance = options.maxDistance ?? 256;
  const maxY = options.maxY ?? null;
  const solid = (x: number, y: number, z: number): boolean =>
    (maxY === null || y <= maxY) && isSolid(x, y, z);

  let tStart = 0;
  let tEnd = maxDistance;
  let enterAxis = -1;
  let traverse = true;
  const bounds = options.bounds;
  if (bounds) {
    const hiY = maxY === null ? bounds.max.y : Math.min(bounds.max.y, maxY);
    const clip =
      hiY < bounds.min.y
        ? null
        : clipRay(
            o,
            d,
            [bounds.min.x, bounds.min.y, bounds.min.z],
            [bounds.max.x + 1, hiY + 1, bounds.max.z + 1],
          );
    if (!clip) traverse = false;
    else {
      if (clip[0] > 0) {
        tStart = clip[0];
        enterAxis = clip[2];
      }
      tEnd = Math.min(clip[1], tStart + maxDistance);
    }
  }

  if (traverse) {
    const hit = traverseDda(o, d, tStart, tEnd, enterAxis, solid);
    if (hit) return hit;
  }
  return groundFallback(o, d, options);
}

function traverseDda(
  o: readonly number[],
  d: readonly number[],
  tStart: number,
  tEnd: number,
  enterAxis: number,
  solid: (x: number, y: number, z: number) => boolean,
): VoxelPick | null {
  const start = [0, 1, 2].map((a) => (o[a] as number) + (d[a] as number) * tStart);
  // Nudge into the cell the ray is entering (start may lie exactly on a boundary).
  const cell = [0, 1, 2].map((a) => Math.floor((start[a] as number) + (d[a] as number) * 1e-7));
  const step = d.map((v) => (v > 0 ? 1 : v < 0 ? -1 : 0));
  const tDelta = d.map((v) => (v === 0 ? Infinity : Math.abs(1 / v)));
  const tMax = [0, 1, 2].map((a) => {
    const s = step[a] as number;
    if (s === 0) return Infinity;
    const boundary = (cell[a] as number) + (s > 0 ? 1 : 0);
    return (boundary - (o[a] as number)) / (d[a] as number);
  });

  const point = (t: number): number[] =>
    [0, 1, 2].map((a) => (o[a] as number) + (d[a] as number) * t);

  if (solid(cell[0] as number, cell[1] as number, cell[2] as number)) {
    let axis = enterAxis;
    if (axis < 0) {
      // Origin inside a block: report the face pointing back towards the viewer.
      axis = 0;
      for (let a = 1; a < 3; a++)
        if (Math.abs(d[a] as number) > Math.abs(d[axis] as number)) axis = a;
    }
    const pair = ENTER_FACE[axis] as readonly [Direction, Direction];
    const face = (step[axis] as number) >= 0 ? pair[0] : pair[1];
    return makePick(cell, face, point(tStart), enterAxis);
  }

  for (let guard = 0; guard < 4096; guard++) {
    let axis = 0;
    if ((tMax[1] as number) < (tMax[axis] as number)) axis = 1;
    if ((tMax[2] as number) < (tMax[axis] as number)) axis = 2;
    const t = tMax[axis] as number;
    if (t > tEnd) return null;
    cell[axis] = (cell[axis] as number) + (step[axis] as number);
    tMax[axis] = t + (tDelta[axis] as number);
    if (solid(cell[0] as number, cell[1] as number, cell[2] as number)) {
      const pair = ENTER_FACE[axis] as readonly [Direction, Direction];
      const face = (step[axis] as number) > 0 ? pair[0] : pair[1];
      return makePick(cell, face, point(t), axis);
    }
  }
  return null;
}

function groundFallback(
  o: readonly number[],
  d: readonly number[],
  options: VoxelPickOptions,
): VoxelPick | null {
  const groundY = options.groundY;
  if (groundY === null || groundY === undefined) return null;
  const oy = o[1] as number;
  const dy = d[1] as number;
  if (dy >= 0 || oy <= groundY) return null;
  const t = (groundY - oy) / dy;
  if (t > (options.maxGroundDistance ?? 4096)) return null;
  const hx = (o[0] as number) + (d[0] as number) * t;
  const hz = (o[2] as number) + (d[2] as number) * t;
  const cell = [Math.floor(hx), groundY - 1, Math.floor(hz)];
  return makePick(cell, 'up', [hx, groundY, hz], 1);
}

/** Coarse inclusive block bounds of a set of chunk coordinates (chunk size 16). */
export function chunkBounds(coords: Iterable<Vec3>, chunkSize = 16): Box3 | null {
  let min: { x: number; y: number; z: number } | null = null;
  let max: { x: number; y: number; z: number } | null = null;
  for (const c of coords) {
    if (!min || !max) {
      min = { ...c };
      max = { ...c };
      continue;
    }
    min.x = Math.min(min.x, c.x);
    min.y = Math.min(min.y, c.y);
    min.z = Math.min(min.z, c.z);
    max.x = Math.max(max.x, c.x);
    max.y = Math.max(max.y, c.y);
    max.z = Math.max(max.z, c.z);
  }
  if (!min || !max) return null;
  return {
    min: { x: min.x * chunkSize, y: min.y * chunkSize, z: min.z * chunkSize },
    max: {
      x: max.x * chunkSize + chunkSize - 1,
      y: max.y * chunkSize + chunkSize - 1,
      z: max.z * chunkSize + chunkSize - 1,
    },
  };
}

/** Minimal chunk view for {@link lowestBlockY} (matches `ChunkedVolume.chunkList()`). */
export interface ChunkListLike {
  chunkList(): readonly {
    readonly coord: Vec3;
    readonly data: Uint16Array;
    readonly count: number;
  }[];
}

/**
 * Lowest Y of any non-air block, or null when empty. Scans only the chunks of the lowest
 * chunk layer and stops at the first occupied row, so it is cheap enough per update.
 */
export function lowestBlockY(volume: ChunkListLike, chunkSize = 16): number | null {
  const chunks = volume.chunkList().filter((c) => c.count > 0);
  if (chunks.length === 0) return null;
  let minCy = Infinity;
  for (const c of chunks) minCy = Math.min(minCy, c.coord.y);
  const layerSize = chunkSize * chunkSize;
  let best = Infinity;
  for (const c of chunks) {
    if (c.coord.y !== minCy) continue;
    const d = c.data;
    for (let ly = 0; ly < chunkSize && minCy * chunkSize + ly < best; ly++) {
      const row = d.subarray(ly * layerSize, (ly + 1) * layerSize);
      if (row.some((v) => v !== 0)) {
        best = minCy * chunkSize + ly;
        break;
      }
    }
  }
  return Number.isFinite(best) ? best : null;
}
