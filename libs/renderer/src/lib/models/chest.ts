import { yRotation, type ModelBuilder } from './context';
import { box, lockedBox, rotateY, uniformTex } from './geometry';

/**
 * Chest: 14×14×14 px box with a latch on the front (`facing`). Double chests (`type` left/right)
 * extend to the block edge towards their other half (Java: left → clockwise of `facing`).
 */
export const chest: ModelBuilder = (ctx) => {
  const tex = ctx.pick(ctx.faces.up);
  const type = ctx.props['type'];
  const x1 = type === 'right' ? 0 : 1;
  const x2 = type === 'left' ? 16 : 15;
  const body = lockedBox([x1, 0, 1], [x2, 14, 15], uniformTex(tex)).map((q) => ({
    ...q,
    uvLock: false,
  }));
  const latch = box([7, 7, 0], [9, 11, 1], {
    up: tex,
    down: tex,
    north: tex,
    west: tex,
    east: tex,
  });
  return rotateY([...body, ...latch], yRotation('north', ctx.props['facing']));
};
