import type { TintKind } from '../mesh/types';
import type { Rgb } from './geometry';

/** Hex 0xRRGGBB → sRGB fractions 0..1 (same values the chunk mesher uses). */
export function hexToRgb(hex: number): Rgb {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

export const TINT_GRASS = 0x91bd59;
export const TINT_FOLIAGE = 0x77ab2f;
export const TINT_WATER = 0x3f76e4;
export const TINT_REDSTONE_DARK = 0x4b0000;
export const TINT_REDSTONE_BRIGHT = 0xff3300;

/** Redstone dust colour for power 0..15 (linear blend dark → bright). */
export function redstoneTint(power: number): Rgb {
  const t = Math.min(15, Math.max(0, power)) / 15;
  const a = hexToRgb(TINT_REDSTONE_DARK);
  const b = hexToRgb(TINT_REDSTONE_BRIGHT);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Tint colour for a tint kind (`redstone` uses `power`). */
export function tintColor(kind: TintKind, power = 15): Rgb {
  switch (kind) {
    case 'none':
      return [1, 1, 1];
    case 'grass':
      return hexToRgb(TINT_GRASS);
    case 'foliage':
      return hexToRgb(TINT_FOLIAGE);
    case 'water':
      return hexToRgb(TINT_WATER);
    case 'redstone':
      return redstoneTint(power);
  }
}
