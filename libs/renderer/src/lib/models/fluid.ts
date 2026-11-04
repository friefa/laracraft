import { intProp, type ModelBuilder } from './context';
import { lockedBox, WHITE } from './geometry';
import { tintColor } from './tint';

/**
 * Water and lava: a single box whose top is lowered by `level`
 * (source/falling: 14 px, flowing levels 1–7 drop towards 2 px). Water is tinted.
 */
export const fluid: ModelBuilder = (ctx) => {
  const level = intProp(ctx.props['level'], 0, 15, 0);
  const height = level === 0 || level >= 8 ? 14 : Math.max(2, (16 * (8 - level)) / 9);
  const tint = ctx.def.id === 'minecraft:water' ? tintColor('water') : WHITE;
  const { up, down, side } = ctx.faces;
  return lockedBox(
    [0, 0, 0],
    [16, height, 16],
    { up, down, north: side, south: side, west: side, east: side },
    [],
    tint,
  );
};
