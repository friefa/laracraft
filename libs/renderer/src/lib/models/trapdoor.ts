import { yRotation, type ModelBuilder } from './context';
import { box, rotateY } from './geometry';

/**
 * Trapdoors, built for `facing=north`: 3 px plate at the bottom or top, or standing on the
 * south edge when open (Java `NORTH_OPEN_AABB`).
 */
export const trapdoor: ModelBuilder = (ctx) => {
  const tex = ctx.faces.up;
  const all = { up: tex, down: tex, north: tex, south: tex, west: tex, east: tex };
  const plate =
    ctx.props['open'] === 'true'
      ? box([0, 0, 13], [16, 16, 16], all)
      : ctx.props['half'] === 'top'
        ? box([0, 13, 0], [16, 16, 16], all)
        : box([0, 0, 0], [16, 3, 16], all);
  return rotateY(plate, yRotation('north', ctx.props['facing']));
};
