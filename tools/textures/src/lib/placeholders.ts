/**
 * Procedural "programmer art" placeholder textures (CC0-1.0, laracraft contributors).
 * Deliberately simple: flat colours + seeded noise + a few geometric patterns.
 * Output is fully deterministic (seed derived from the texture name).
 */
import { createImage, type RgbaImage } from './png';

type Rgb = readonly [number, number, number];
type Painter = (ctx: PaintContext) => void;

export const TILE = 16;

export interface PaintContext {
  rand: () => number;
  set: (x: number, y: number, c: Rgb, a?: number) => void;
  /** Base colour with +-amp random brightness variation. */
  noisy: (c: Rgb, amp: number) => Rgb;
}

/** FNV-1a 32-bit hash. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

const fill =
  (c: Rgb, amp: number): Painter =>
  ({ set, noisy }) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) set(x, y, noisy(c, amp));
  };

const STONE: Rgb = [125, 125, 125];
const DIRT: Rgb = [134, 96, 67];
const GRASS: Rgb = [94, 157, 52];
const PLANK: Rgb = [162, 130, 78];
const BARK: Rgb = [102, 81, 50];

const PAINTERS: Record<string, Painter> = {
  missing: ({ set }) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++)
        set(x, y, ((x >> 3) + (y >> 3)) % 2 === 0 ? [248, 0, 248] : [0, 0, 0]);
  },
  stone: fill(STONE, 14),
  dirt: fill(DIRT, 16),
  sand: fill([219, 207, 163], 10),
  gravel: fill([131, 127, 126], 30),
  white_wool: fill([233, 236, 236], 6),
  obsidian: fill([20, 18, 30], 10),
  grass_block_top: fill(GRASS, 18),
  grass_block_side: (ctx) => {
    fill(DIRT, 16)(ctx);
    for (let x = 0; x < TILE; x++) {
      const depth = 3 + Math.floor(ctx.rand() * 2);
      for (let y = 0; y < depth; y++) ctx.set(x, y, ctx.noisy(GRASS, 18));
    }
  },
  cobblestone: (ctx) => {
    // Irregular 4x4-ish cells with dark mortar lines.
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const shift = (y >> 2) % 2 === 0 ? 0 : 2;
        const mortar = y % 4 === 3 || (x + shift) % 5 === 4;
        ctx.set(x, y, mortar ? ctx.noisy([80, 80, 80], 8) : ctx.noisy(STONE, 20));
      }
  },
  stone_bricks: (ctx) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const shift = (y >> 3) % 2 === 0 ? 0 : 8;
        const mortar = y % 8 === 7 || (x + shift) % 16 === 15;
        ctx.set(x, y, mortar ? ctx.noisy([90, 90, 90], 6) : ctx.noisy(STONE, 10));
      }
  },
  oak_planks: (ctx) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const seam = y % 4 === 3 || (x + (y >> 2) * 5) % 16 === 0;
        ctx.set(x, y, seam ? ctx.noisy([110, 86, 50], 6) : ctx.noisy(PLANK, 8));
      }
  },
  oak_log: (ctx) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const groove = x % 4 === 0 && ctx.rand() > 0.3;
        ctx.set(x, y, ctx.noisy(groove ? [70, 55, 33] : BARK, 8));
      }
  },
  oak_log_top: (ctx) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const r = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        const c: Rgb = r > 6.5 ? BARK : Math.floor(r) % 2 === 0 ? PLANK : [140, 110, 64];
        ctx.set(x, y, ctx.noisy(c, 6));
      }
  },
  glass: ({ set }) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const edge = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1;
        const glint = x === y + 3 || x === y + 4;
        if (edge) set(x, y, [220, 240, 245], 255);
        else if (glint && x > 3 && x < 12) set(x, y, [255, 255, 255], 160);
        else set(x, y, [0, 0, 0], 0);
      }
  },
  redstone_block: (ctx) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const edge = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1;
        ctx.set(x, y, ctx.noisy(edge ? [120, 10, 5] : [175, 24, 10], 14));
      }
  },
  redstone_lamp: (ctx) => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const frame = x < 2 || y < 2 || x > 13 || y > 13 || x === y || x === TILE - 1 - y;
        ctx.set(x, y, ctx.noisy(frame ? [95, 60, 35] : [150, 90, 50], 10));
      }
  },
};

export const PLACEHOLDER_NAMES: readonly string[] = Object.keys(PAINTERS).sort();

export function renderPlaceholder(name: string): RgbaImage {
  const painter = PAINTERS[name];
  if (!painter) throw new Error(`no placeholder painter for "${name}"`);
  const img = createImage(TILE, TILE);
  const rand = prng(hash(name));
  const ctx: PaintContext = {
    rand,
    set: (x, y, c, a = 255) => {
      const i = (y * TILE + x) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = a;
    },
    noisy: (c, amp) => {
      const d = (rand() * 2 - 1) * amp;
      return [clamp(c[0] + d), clamp(c[1] + d), clamp(c[2] + d)];
    },
  };
  painter(ctx);
  return img;
}
