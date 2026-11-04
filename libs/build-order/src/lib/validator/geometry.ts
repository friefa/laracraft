import {
  DIRECTION_OFFSET,
  type Direction,
  type HorizontalDirection,
  type Vec3,
} from '@laracraft/core-model';

/**
 * Continuous geometry for reachability and look-direction checks.
 * Block (x, y, z) occupies [x, x+1) × [y, y+1) × [z, z+1).
 */

/** Java standing eye height above the feet. */
export const EYE_HEIGHT = 1.62;

/** Tolerance for floating point comparisons against the reach limit. */
const EPS = 1e-9;

export interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const eyePosition = (standAt: Vec3): Point => ({
  x: standAt.x + 0.5,
  y: standAt.y + EYE_HEIGHT,
  z: standAt.z + 0.5,
});

/** Centre of `face` of the block at `pos`. */
export function faceCentre(pos: Vec3, face: Direction): Point {
  const o = DIRECTION_OFFSET[face];
  return { x: pos.x + 0.5 + o.x * 0.5, y: pos.y + 0.5 + o.y * 0.5, z: pos.z + 0.5 + o.z * 0.5 };
}

export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export const withinReach = (a: Point, b: Point, reach: number): boolean =>
  distance(a, b) <= reach + EPS;

/** True if the face's outward normal points towards the eye (the face is visible / clickable). */
export function faceVisibleFrom(eye: Point, pos: Vec3, face: Direction): boolean {
  const c = faceCentre(pos, face);
  const n = DIRECTION_OFFSET[face];
  return (eye.x - c.x) * n.x + (eye.y - c.y) * n.y + (eye.z - c.z) * n.z > EPS;
}

/** Java `getHorizontalDirection`: the yaw quadrant of a look vector. */
export function horizontalOf(dx: number, dz: number): HorizontalDirection {
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 'east' : 'west';
  return dz > 0 ? 'south' : 'north';
}

/** Java `nearestLookingDirection`: the dominant axis of a look vector. */
export function nearest3dOf(dx: number, dy: number, dz: number): Direction {
  if (Math.abs(dy) > Math.max(Math.abs(dx), Math.abs(dz))) return dy > 0 ? 'up' : 'down';
  return horizontalOf(dx, dz);
}

/** Sample offsets across a face (excluding the very edges). */
const SAMPLES = [-0.45, -0.35, -0.25, -0.15, -0.05, 0.05, 0.15, 0.25, 0.35, 0.45];

/**
 * Points on a face the player can aim at. For side faces `half` restricts the
 * points to the upper or lower half (stairs/slabs placed against a wall).
 */
export function* facePoints(pos: Vec3, face: Direction, half?: 'top' | 'bottom'): Generator<Point> {
  const c = faceCentre(pos, face);
  const vertical = face === 'up' || face === 'down';
  for (const a of SAMPLES) {
    for (const b of SAMPLES) {
      if (vertical) {
        yield { x: c.x + a, y: c.y, z: c.z + b };
        continue;
      }
      if (half === 'top' && b <= 0) continue;
      if (half === 'bottom' && b >= 0) continue;
      const alongX = face === 'north' || face === 'south';
      yield alongX ? { x: c.x + a, y: c.y + b, z: c.z } : { x: c.x, y: c.y + b, z: c.z + a };
    }
  }
}
