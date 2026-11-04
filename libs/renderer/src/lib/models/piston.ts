import { direction, type ModelBuilder } from './context';
import { box, rotateX, rotateY, type Quad } from './geometry';
import type { Direction } from '@laracraft/core-model';

/**
 * Pistons are built pointing up (`facing=up`): side textures then have their top row at
 * the front, like vanilla. {@link orientFromUp} turns them to any of the six facings.
 */
export function orientFromUp(quads: readonly Quad[], facing: Direction): Quad[] {
  switch (facing) {
    case 'up':
      return [...quads];
    case 'down':
      return rotateX(quads, 180);
    case 'north':
      return rotateX(quads, -90);
    case 'south':
      return rotateX(quads, 90);
    case 'east':
      return rotateY(rotateX(quads, -90), 90);
    case 'west':
      return rotateY(rotateX(quads, -90), 270);
  }
}

/**
 * Piston / sticky piston base. Registry faces: `north` = front, `south` = back, `side`.
 * Extended: the base shrinks to 12 px and shows `piston_inner` (or the back texture).
 */
export const piston: ModelBuilder = (ctx) => {
  const { north: front, south: back, side } = ctx.faces;
  const extended = ctx.props['extended'] === 'true';
  const h = extended ? 12 : 16;
  const quads = box([0, 0, 0], [16, h, 16], {
    up: extended ? ctx.pick('piston_inner', back) : front,
    down: back,
    north: side,
    south: side,
    west: side,
    east: side,
  });
  return orientFromUp(quads, direction(ctx.props['facing']));
};

/**
 * Piston head: 4 px plate plus the arm. The arm is clipped at the block edge (vanilla lets
 * it reach 4 px into the base; `short` is irrelevant then).
 */
export const pistonHead: ModelBuilder = (ctx) => {
  const { north: front, side } = ctx.faces;
  const face = ctx.props['type'] === 'sticky' ? ctx.pick('piston_top_sticky', front) : front;
  const armSide = { tex: side, uv: [4, 0, 16, 4] as const, rotation: 90 as const };
  const quads = [
    ...box([0, 12, 0], [16, 16, 16], {
      up: face,
      down: front,
      north: side,
      south: side,
      west: side,
      east: side,
    }),
    ...box([6, 0, 6], [10, 12, 10], {
      north: armSide,
      south: armSide,
      west: armSide,
      east: armSide,
    }),
  ];
  return orientFromUp(quads, direction(ctx.props['facing']));
};
