import type { ModelBuilder } from './context';
import { connectedArms } from './fence';
import { lockedBox } from './geometry';

/** Walls: optional post (`up`) plus low (14 px) or tall (16 px) side pieces. */
export const wall: ModelBuilder = (ctx) => {
  const tex = ctx.faces;
  const anySide = ['north', 'east', 'south', 'west'].some((d) => {
    const v = ctx.props[d];
    return v === 'low' || v === 'tall';
  });
  // A wall without post and sides does not exist in-game; show the post rather than nothing.
  const hasPost = ctx.props['up'] !== 'false' || !anySide;
  const sides = connectedArms(
    ctx.props,
    (v) => v === 'low' || v === 'tall',
    (v) => lockedBox([5, 0, 0], [11, v === 'tall' ? 16 : 14, 8], tex, hasPost ? ['south'] : []),
  );
  const post = hasPost ? lockedBox([4, 0, 4], [12, 16, 12], tex) : [];
  return [...post, ...sides];
};
