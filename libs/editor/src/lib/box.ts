import { type Box3, type Vec3, boxSize } from '@laracraft/core-model';

/** Box spanning two corners in any order. */
export function boxFromCorners(a: Vec3, b: Vec3): Box3 {
  return {
    min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
    max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) },
  };
}

/** Same box with `min <= max` on every axis. */
export const normalizeBox = (box: Box3): Box3 => boxFromCorners(box.min, box.max);

/** Smallest box containing `box` and `pos`. */
export const extendBox = (box: Box3, pos: Vec3): Box3 =>
  boxFromCorners(
    { x: Math.min(box.min.x, pos.x), y: Math.min(box.min.y, pos.y), z: Math.min(box.min.z, pos.z) },
    { x: Math.max(box.max.x, pos.x), y: Math.max(box.max.y, pos.y), z: Math.max(box.max.z, pos.z) },
  );

/** Number of cells in a box. */
export function boxVolume(box: Box3): number {
  const s = boxSize(normalizeBox(box));
  return s.x * s.y * s.z;
}

/** Iterates all cells (x fastest, then z, then y). */
export function* boxCells(box: Box3): Generator<Vec3> {
  const b = normalizeBox(box);
  for (let y = b.min.y; y <= b.max.y; y++) {
    for (let z = b.min.z; z <= b.max.z; z++) {
      for (let x = b.min.x; x <= b.max.x; x++) yield { x, y, z };
    }
  }
}
