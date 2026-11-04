import type { ModelBuilder } from './context';
import { lockedBox } from './geometry';

/** Slabs: bottom, top or double (full cube). */
export const slab: ModelBuilder = (ctx) => {
  switch (ctx.props['type']) {
    case 'top':
      return lockedBox([0, 8, 0], [16, 16, 16], ctx.faces);
    case 'double':
      return lockedBox([0, 0, 0], [16, 16, 16], ctx.faces);
    default:
      return lockedBox([0, 0, 0], [16, 8, 16], ctx.faces);
  }
};
