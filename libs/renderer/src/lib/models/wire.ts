import { HORIZONTAL_DIRECTIONS, OPPOSITE, type HorizontalDirection } from '@laracraft/core-model';
import { intProp, yRotation, type ModelBuilder } from './context';
import { box, doubleSided, rotateY, type Quad, type Rgb } from './geometry';
import { redstoneTint } from './tint';

/** Heights (px) of the flat wire layers, staggered so overlapping quads do not z-fight. */
const Y_NS = 0.25;
const Y_EW = 0.3;
const Y_DOT = 0.35;
const WALL_INSET = 0.25;

/**
 * Redstone wire: flat quads (dot, one arm per connected side, a straight line through
 * when only one side is connected) plus a vertical strip on the wall for `up` sides.
 * Tinted by `power`. With a `redstone_dust_line0` texture the arms use it at full width;
 * otherwise a narrow strip cut from the centre of the dot texture stands in for the line.
 */
export const wire: ModelBuilder = (ctx) => {
  const tint: Rgb = redstoneTint(intProp(ctx.props['power'], 0, 15, 0));
  const dot = ctx.faces.up;
  const lineTex = ctx.has('redstone_dust_line0') ? 'redstone_dust_line0' : undefined;
  const opts = { tint };

  const connected = HORIZONTAL_DIRECTIONS.filter((d) => {
    const v = ctx.props[d];
    return v === 'side' || v === 'up';
  });
  const arms = new Set<HorizontalDirection>(connected);
  if (connected.length === 1)
    arms.add(OPPOSITE[connected[0] as HorizontalDirection] as HorizontalDirection);

  /** Arm from the north edge to the centre (rotated per side). */
  const arm = (y: number): Quad[] =>
    lineTex
      ? box([0, y, 0], [16, y, 8], { up: { tex: lineTex, uv: [0, 0, 16, 8] } }, opts)
      : box([6, y, 0], [10, y, 8], { up: { tex: dot, uv: [6, 6, 10, 10] } }, opts);
  /** Strip on the inside of the north wall, for `north=up`. */
  const climb = (): Quad[] =>
    doubleSided(
      lineTex
        ? box(
            [0, 0, WALL_INSET],
            [16, 16, WALL_INSET],
            { south: { tex: lineTex, uv: [0, 0, 16, 16] } },
            opts,
          )
        : box(
            [6, 0, WALL_INSET],
            [10, 16, WALL_INSET],
            { south: { tex: dot, uv: [6, 6, 10, 10] } },
            opts,
          ),
    );

  const quads: Quad[] = [];
  for (const d of arms) {
    const y = d === 'north' || d === 'south' ? Y_NS : Y_EW;
    quads.push(...rotateY(arm(y), yRotation('north', d)));
    if (ctx.props[d] === 'up') quads.push(...rotateY(climb(), yRotation('north', d)));
  }
  const straight =
    arms.size === 2 &&
    ((arms.has('north') && arms.has('south')) || (arms.has('east') && arms.has('west')));
  if (!straight) quads.push(...box([0, Y_DOT, 0], [16, Y_DOT, 16], { up: dot }, opts));
  return quads;
};
