import type { Box3 } from '@laracraft/core-model';
import type { Pos, Region } from './types';

/** Normalised inclusive box of a region (corners in any order). */
export function regionBox(region: Region): Box3 {
  const { from: a, to: b } = region;
  return {
    min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
    max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) },
  };
}

export const boxVolume = (b: Box3): number =>
  (b.max.x - b.min.x + 1) * (b.max.y - b.min.y + 1) * (b.max.z - b.min.z + 1);

export function boxIntersectionVolume(a: Box3, b: Box3): number {
  const dx = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) + 1;
  const dy = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y) + 1;
  const dz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z) + 1;
  return dx > 0 && dy > 0 && dz > 0 ? dx * dy * dz : 0;
}

export const boxContains = (b: Box3, p: Pos): boolean =>
  p.x >= b.min.x &&
  p.x <= b.max.x &&
  p.y >= b.min.y &&
  p.y <= b.max.y &&
  p.z >= b.min.z &&
  p.z <= b.max.z;

/** Iterates the cells of a box in Y, Z, X order (deterministic). */
export function* boxCells(b: Box3): Generator<Pos> {
  for (let y = b.min.y; y <= b.max.y; y++) {
    for (let z = b.min.z; z <= b.max.z; z++) {
      for (let x = b.min.x; x <= b.max.x; x++) yield { x, y, z };
    }
  }
}

/** 3D Bresenham line from `a` to `b`, both inclusive; `max(|d|) + 1` cells. */
export function bresenham3d(a: Pos, b: Pos): Pos[] {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const dz = Math.abs(b.z - a.z);
  const sx = Math.sign(b.x - a.x);
  const sy = Math.sign(b.y - a.y);
  const sz = Math.sign(b.z - a.z);
  let { x, y, z } = a;
  const out: Pos[] = [{ x, y, z }];
  if (dx >= dy && dx >= dz) {
    let e1 = 2 * dy - dx;
    let e2 = 2 * dz - dx;
    for (let i = 0; i < dx; i++) {
      x += sx;
      if (e1 > 0) {
        y += sy;
        e1 -= 2 * dx;
      }
      if (e2 > 0) {
        z += sz;
        e2 -= 2 * dx;
      }
      e1 += 2 * dy;
      e2 += 2 * dz;
      out.push({ x, y, z });
    }
  } else if (dy >= dx && dy >= dz) {
    let e1 = 2 * dx - dy;
    let e2 = 2 * dz - dy;
    for (let i = 0; i < dy; i++) {
      y += sy;
      if (e1 > 0) {
        x += sx;
        e1 -= 2 * dy;
      }
      if (e2 > 0) {
        z += sz;
        e2 -= 2 * dy;
      }
      e1 += 2 * dx;
      e2 += 2 * dz;
      out.push({ x, y, z });
    }
  } else {
    let e1 = 2 * dy - dz;
    let e2 = 2 * dx - dz;
    for (let i = 0; i < dz; i++) {
      z += sz;
      if (e1 > 0) {
        y += sy;
        e1 -= 2 * dz;
      }
      if (e2 > 0) {
        x += sx;
        e2 -= 2 * dz;
      }
      e1 += 2 * dy;
      e2 += 2 * dx;
      out.push({ x, y, z });
    }
  }
  return out;
}

/** Local (lx, lz) of a box with X size `sx` and Z size `sz` after clockwise quarter turns. */
export function rotateLocal(
  lx: number,
  lz: number,
  sx: number,
  sz: number,
  turns: 1 | 2 | 3,
): { x: number; z: number } {
  switch (turns) {
    case 1:
      return { x: sz - 1 - lz, z: lx };
    case 2:
      return { x: sx - 1 - lx, z: sz - 1 - lz };
    case 3:
      return { x: lz, z: sx - 1 - lx };
  }
}

/** Target box of an in-place rotation: anchored at `b.min`, X and Z sizes swapped for odd turns. */
export function rotatedBox(b: Box3, turns: 1 | 2 | 3): Box3 {
  const sx = b.max.x - b.min.x + 1;
  const sz = b.max.z - b.min.z + 1;
  const [nx, nz] = turns === 2 ? [sx, sz] : [sz, sx];
  return { min: b.min, max: { x: b.min.x + nx - 1, y: b.max.y, z: b.min.z + nz - 1 } };
}
