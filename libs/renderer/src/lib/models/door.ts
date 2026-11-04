import { yRotation, type ModelBuilder } from './context';
import { box, rotateY, type UvRect } from './geometry';

/**
 * Doors (one model per half). Built for `facing=east` closed: a 3 px panel on the west
 * edge (Java `EAST_AABB`). Opening swings the panel about the hinge: hinge `left` ends on
 * the north edge, `right` on the south edge (then rotated for `facing`). The right-hinge
 * texture is mirrored like in vanilla.
 */
export const door: ModelBuilder = (ctx) => {
  const tex = ctx.props['half'] === 'upper' ? ctx.faces.up : ctx.faces.down;
  const right = ctx.props['hinge'] === 'right';
  const front: UvRect = right ? [16, 0, 0, 16] : [0, 0, 16, 16];
  const back: UvRect = right ? [0, 0, 16, 16] : [16, 0, 0, 16];
  const closed = box([0, 0, 0], [3, 16, 16], {
    east: { tex, uv: front },
    west: { tex, uv: back },
    north: { tex, uv: [0, 0, 3, 16] },
    south: { tex, uv: [13, 0, 16, 16] },
    up: { tex, uv: [13, 0, 16, 16], rotation: 90 },
    down: { tex, uv: [13, 0, 16, 16], rotation: 90 },
  });
  const swing = ctx.props['open'] === 'true' ? (right ? 270 : 90) : 0;
  return rotateY(rotateY(closed, swing), yRotation('east', ctx.props['facing']));
};
