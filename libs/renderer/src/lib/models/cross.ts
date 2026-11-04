import type { ModelBuilder } from './context';
import { box, doubleSided, rotateY } from './geometry';

/** Cross plants (saplings, flowers, grass): two diagonal double-sided planes. */
export const cross: ModelBuilder = (ctx) => {
  const tex = ctx.faces.side;
  const plane = doubleSided(
    box([0.8, 0, 8], [15.2, 16, 8], { south: { tex, uv: [0, 0, 16, 16] } }),
  );
  return [...rotateY(plane, 45), ...rotateY(plane, 135)];
};
