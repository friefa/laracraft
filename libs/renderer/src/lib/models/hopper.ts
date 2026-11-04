import { yRotation, type ModelBuilder } from './context';
import { box, rotateY, type P3, type Quad } from './geometry';

/** Hopper: open bowl (rim + floor), middle section and a spout down or to `facing`. */
export const hopper: ModelBuilder = (ctx) => {
  const outside = ctx.faces.side;
  const top = ctx.faces.up;
  const inside = ctx.pick('hopper_inside', outside);
  const part = (a: P3, b: P3, up = outside): Quad[] =>
    box(a, b, { up, down: outside, north: outside, south: outside, west: outside, east: outside });

  const quads: Quad[] = [
    // Rim: four walls, top faces carry the hopper_top ring.
    ...part([0, 10, 0], [16, 16, 2], top),
    ...part([0, 10, 14], [16, 16, 16], top),
    ...part([0, 10, 2], [2, 16, 14], top),
    ...part([14, 10, 2], [16, 16, 14], top),
    ...part([2, 10, 2], [14, 11, 14], inside),
    ...part([4, 4, 4], [12, 10, 12]),
  ];
  const facing = ctx.props['facing'] ?? 'down';
  if (facing === 'down') {
    quads.push(...part([6, 0, 6], [10, 4, 10]));
  } else {
    quads.push(...rotateY(part([6, 4, 0], [10, 8, 4]), yRotation('north', facing)));
  }
  return quads;
};
