import { intProp, yRotation, type ModelBuilder, type ModelContext } from './context';
import { box, rotateY, type P3, type Quad } from './geometry';
import { torchStick } from './torch';

/**
 * Repeater and comparator, built for `facing=south` like vanilla: `facing` points to the
 * input side (towards the player who placed it), the output is on the opposite (north) side.
 */

/** 2 px base plate: top texture from the registry, sides/bottom smooth stone. */
function plate(ctx: ModelContext, top: string): Quad[] {
  const stone = ctx.pick('smooth_stone');
  return box([0, 0, 0], [16, 2, 16], {
    up: top,
    down: stone,
    north: stone,
    south: stone,
    west: stone,
    east: stone,
  });
}

function redstoneTorch(ctx: ModelContext, lit: boolean, from: P3, height: number): Quad[] {
  const tex = lit ? ctx.pick('redstone_torch') : ctx.pick('redstone_torch_off', 'redstone_torch');
  return torchStick(tex, from, height);
}

/** Repeater: fixed output torch plus a delay torch (1–4 ticks) or a lock bar. */
export const repeater: ModelBuilder = (ctx) => {
  const powered = ctx.props['powered'] === 'true';
  const base = ctx.faces.up;
  const top = powered ? ctx.pick(`${base}_on`, base) : base;
  const delayZ = 6 + 2 * (intProp(ctx.props['delay'], 1, 4, 1) - 1);
  const quads = [...plate(ctx, top), ...redstoneTorch(ctx, powered, [7, 2, 2], 5)];
  if (ctx.props['locked'] === 'true') {
    const bar = ctx.pick('bedrock', 'smooth_stone');
    quads.push(
      ...box([2, 2, delayZ], [14, 4, delayZ + 2], {
        up: bar,
        north: bar,
        south: bar,
        west: bar,
        east: bar,
      }),
    );
  } else {
    quads.push(...redstoneTorch(ctx, powered, [7, 2, delayZ], 5));
  }
  return rotateY(quads, yRotation('south', ctx.props['facing']));
};

/** Comparator: two input torches (lit when powered) and a front torch (lit in subtract mode). */
export const comparator: ModelBuilder = (ctx) => {
  const powered = ctx.props['powered'] === 'true';
  const subtract = ctx.props['mode'] === 'subtract';
  const base = ctx.faces.up;
  const top = powered ? ctx.pick(`${base}_on`, base) : base;
  const quads = [
    ...plate(ctx, top),
    ...redstoneTorch(ctx, powered, [4, 2, 11], 5),
    ...redstoneTorch(ctx, powered, [10, 2, 11], 5),
    ...redstoneTorch(ctx, subtract, [7, 2, 2], subtract ? 4 : 3),
  ];
  return rotateY(quads, yRotation('south', ctx.props['facing']));
};
