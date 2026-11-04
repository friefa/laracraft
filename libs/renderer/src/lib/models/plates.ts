import type { ModelBuilder } from './context';
import { lockedBox } from './geometry';

/** Carpet: 1 px layer. */
export const carpet: ModelBuilder = (ctx) => lockedBox([0, 0, 0], [16, 1, 16], ctx.faces);

/** Pressure plates: 14×14 px, 1 px high (0.5 px when pressed). */
export const pressurePlate: ModelBuilder = (ctx) =>
  lockedBox([1, 0, 1], [15, ctx.props['powered'] === 'true' ? 0.5 : 1, 15], ctx.faces);

/** Daylight detector: 6 px slab; inverted detectors use `*_inverted_top` when available. */
export const daylightDetector: ModelBuilder = (ctx) => {
  const up =
    ctx.props['inverted'] === 'true'
      ? ctx.pick('daylight_detector_inverted_top', ctx.faces.up)
      : ctx.faces.up;
  return lockedBox([0, 0, 0], [16, 6, 16], { ...ctx.faces, up });
};
