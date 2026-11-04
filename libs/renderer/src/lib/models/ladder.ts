import { yRotation, type ModelBuilder } from './context';
import { box, doubleSided, rotateY } from './geometry';

/** Ladder: a plane 0.8 px in front of the block it hangs on (built for `facing=north`). */
export const ladder: ModelBuilder = (ctx) => {
  const plane = box([0, 0, 15.2], [16, 16, 15.2], { north: ctx.faces.up });
  return rotateY(doubleSided(plane), yRotation('north', ctx.props['facing']));
};
