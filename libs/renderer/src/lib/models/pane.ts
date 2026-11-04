import type { ModelBuilder } from './context';
import { connectedArms } from './fence';
import { box } from './geometry';

/** Glass panes and iron bars: post plus a thin arm per connected side. */
export const pane: ModelBuilder = (ctx) => {
  const glass = ctx.faces.side;
  const edge = ctx.faces.up;
  const post = box([7, 0, 7], [9, 16, 9], {
    up: { tex: edge, uv: [7, 7, 9, 9] },
    down: { tex: edge, uv: [7, 7, 9, 9] },
    north: { tex: glass, uvLock: true },
    south: { tex: glass, uvLock: true },
    west: { tex: glass, uvLock: true },
    east: { tex: glass, uvLock: true },
  });
  return [
    ...post,
    ...connectedArms(
      ctx.props,
      (v) => v === 'true',
      () =>
        box([7, 0, 0], [9, 16, 7], {
          up: { tex: edge, uv: [7, 0, 9, 7] },
          down: { tex: edge, uv: [7, 9, 9, 16] },
          north: { tex: edge, uv: [7, 0, 9, 16] },
          west: { tex: glass, uvLock: true },
          east: { tex: glass, uvLock: true },
        }),
    ),
  ];
};
