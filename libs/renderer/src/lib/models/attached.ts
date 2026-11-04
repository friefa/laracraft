import { yRotation, type ModelBuilder } from './context';
import { lockedBox, rotateX, rotateY, uniformTex, type Quad } from './geometry';
import { torchStick } from './torch';

/**
 * Orients a model built in the "floor frame" (lying on the floor, `facing=north`) for a
 * `face` (`floor | wall | ceiling`) and `facing` property pair (buttons, levers).
 * Wall: the floor becomes the wall behind (south for `facing=north`), floor-north points down.
 * Ceiling: turned upside down about the X axis.
 */
export function orientAttached(
  quads: readonly Quad[],
  face: string | undefined,
  facing: string | undefined,
): Quad[] {
  const rot = yRotation('north', facing);
  if (face === 'wall') return rotateY(rotateX(quads, -90), rot);
  if (face === 'ceiling') return rotateY(rotateX(quads, 180), rot);
  return rotateY(quads, rot);
}

/** Buttons: 6×4 px, 2 px deep (1 px when pressed). */
export const button: ModelBuilder = (ctx) => {
  const depth = ctx.props['powered'] === 'true' ? 1 : 2;
  const quads = lockedBox([5, 0, 6], [11, depth, 10], ctx.faces);
  return orientAttached(
    quads.map((q) => ({ ...q, uvLock: false })),
    ctx.props['face'],
    ctx.props['facing'],
  );
};

/**
 * Lever: cobblestone base plus a handle tilted 45°. Off: the handle leans away from
 * `facing` (up on walls), on: towards it (down on walls).
 */
export const lever: ModelBuilder = (ctx) => {
  const base = lockedBox([5, 0, 4], [11, 3, 12], uniformTex(ctx.pick('cobblestone'))).map((q) => ({
    ...q,
    uvLock: false,
  }));
  const tilt = ctx.props['powered'] === 'true' ? -45 : 45;
  const handle = rotateX(torchStick(ctx.faces.up, [7, 1, 7]), tilt, [8, 1, 8]);
  return orientAttached([...base, ...handle], ctx.props['face'], ctx.props['facing']);
};
