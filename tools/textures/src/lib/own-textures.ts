/**
 * laracraft's own drawings for gaps and style breaks in Pixel Perfection Legacy
 * (ADR-0003, pack `laracraft_own`). Output is fully deterministic.
 *
 * License: CC BY-SA 4.0. The drawings are new, but they are adapted to Pixel
 * Perfection Legacy: the colours are sampled from its `oak_planks`, `iron_block`,
 * `observer_side` and `observer_front` textures, and `observer_front` keeps the
 * stone frame of PPL's `observer_side` pixel for pixel (read from disk at generation
 * time). Hence they are credited to laracraft contributors and the PPL authors.
 *
 * Chest layout: the chest model is a 14×14×14 px box at x/z 1..15, y 0..14 that uses
 * Minecraft's auto-UV, so the visible part of a side texture is columns 1..14 and rows
 * 2..15, of the top texture columns 1..14 and rows 1..14. Unused border pixels repeat
 * their neighbour (keeps mipmaps clean). Double chest halves (`type` left/right) are
 * 15 px wide and use `<name>_left` / `<name>_right`, which are slices of one 30 px wide
 * drawing, so the halves join without a frame at the seam and share one latch.
 */
import { createImage, type RgbaImage } from './png';
import { hash, prng, TILE } from './placeholders';

type Rgb = readonly [number, number, number];
/** A drawing of `w × h` pixels, row-major. */
type Canvas = Rgb[][];

const hex = (v: number): Rgb => [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];

// Oak palette sampled from PPL oak_planks, light to dark.
const OAK_LIGHT = hex(0x997252);
const OAK_1 = hex(0x8e694d);
const OAK_2 = hex(0x85634c);
const OAK_3 = hex(0x785a48);
const OAK_4 = hex(0x6f5446);
const OAK_SEAM = hex(0x665045);
const OAK_SEAM_DARK = hex(0x5e4b41);
const FRAME = hex(0x51423b);
const FRAME_DARK = hex(0x433630);
// Metal palette sampled from PPL iron_block, light to dark.
const IRON = [0xe5e4e0, 0xc9c7c1, 0xafaca5, 0x938e88, 0x847e77, 0x6b635e, 0x54514f].map(hex);

/** Grain tones, dark to light; `grain(…, light)` shifts towards the light end. */
const GRAIN: readonly Rgb[] = [OAK_3, OAK_2, OAK_2, OAK_1, OAK_1, OAK_LIGHT];

function canvas(w: number, h: number, c: Rgb = OAK_2): Canvas {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => c));
}

/** Horizontal wood grain: streaks of 2–6 px in oak tones, occasional dark knot. */
function grain(cv: Canvas, rows: readonly number[], rand: () => number, light = 0): void {
  const w = cv[0]?.length ?? 0;
  for (const y of rows) {
    let x = 0;
    while (x < w) {
      const len = 2 + Math.floor(rand() * 5);
      const pick = Math.floor(rand() * GRAIN.length);
      const tone = GRAIN[Math.max(0, Math.min(GRAIN.length - 1, pick + light))] as Rgb;
      for (let i = 0; i < len && x < w; i++, x++) (cv[y] as Rgb[])[x] = tone;
    }
    if (rand() < 0.35) (cv[y] as Rgb[])[Math.floor(rand() * w)] = OAK_4;
  }
}

function hline(cv: Canvas, y: number, x0: number, x1: number, c: Rgb | ((x: number) => Rgb)) {
  for (let x = x0; x <= x1; x++) (cv[y] as Rgb[])[x] = typeof c === 'function' ? c(x) : c;
}

function vline(cv: Canvas, x: number, y0: number, y1: number, c: Rgb) {
  for (let y = y0; y <= y1; y++) (cv[y] as Rgb[])[x] = c;
}

/** Dark outline on the given edges; corners one shade darker. */
function outline(cv: Canvas, edges: { left: boolean; right: boolean }): void {
  const h = cv.length;
  const w = cv[0]?.length ?? 0;
  hline(cv, 0, 0, w - 1, FRAME);
  hline(cv, h - 1, 0, w - 1, FRAME);
  if (edges.left) vline(cv, 0, 0, h - 1, FRAME);
  if (edges.right) vline(cv, w - 1, 0, h - 1, FRAME);
  // Second, softer frame column: the boards end in a darker corner post.
  for (let y = 1; y < h - 1; y++) {
    const post = (x: number) => {
      const c = (cv[y] as Rgb[])[x];
      (cv[y] as Rgb[])[x] = c === OAK_LIGHT || c === OAK_1 ? OAK_3 : OAK_SEAM;
    };
    if (edges.left) post(1);
    if (edges.right) post(w - 2);
  }
  for (const [x, y, on] of [
    [0, 0, edges.left],
    [0, h - 1, edges.left],
    [w - 1, 0, edges.right],
    [w - 1, h - 1, edges.right],
  ] as const) {
    if (on) (cv[y] as Rgb[])[x] = FRAME_DARK;
  }
}

/**
 * Chest side (front, back, west/east): 14 rows = y 14..0. Lid rows 1..4 with a lit
 * top edge, dark lid gap at row 5, base boards rows 6..12 with a seam, shaded bottom.
 */
function chestSide(w: number, seed: string, latchAt: number | null): Canvas {
  const rand = prng(hash(seed));
  const cv = canvas(w, 14);
  grain(cv, [1], rand, 2);
  grain(cv, [2, 3, 4], rand);
  hline(cv, 4, 0, w - 1, (x) => ((cv[4] as Rgb[])[x] === OAK_LIGHT ? OAK_2 : OAK_3));
  hline(cv, 5, 0, w - 1, FRAME_DARK);
  grain(cv, [6, 7, 8], rand, 1);
  hline(cv, 6, 0, w - 1, (x) => ((cv[6] as Rgb[])[x] === OAK_LIGHT ? OAK_2 : OAK_4));
  hline(cv, 9, 0, w - 1, () => (rand() < 0.25 ? OAK_SEAM_DARK : OAK_SEAM));
  grain(cv, [10, 11], rand);
  hline(cv, 12, 0, w - 1, (x) => (x % 5 === 2 ? OAK_SEAM : OAK_4));
  outline(cv, { left: true, right: true });
  if (latchAt !== null) {
    // 2×4 iron latch hanging from the lid over the gap (rows 3..6 = v 5..9), lit top-left.
    const latch: readonly (readonly [Rgb, Rgb])[] = [
      [IRON[0], IRON[1]],
      [IRON[1], IRON[2]],
      [IRON[2], IRON[6]],
      [IRON[4], IRON[5]],
    ] as (readonly [Rgb, Rgb])[];
    latch.forEach(([a, b], i) => {
      (cv[3 + i] as Rgb[])[latchAt] = a;
      (cv[3 + i] as Rgb[])[latchAt + 1] = b;
    });
    // Shadow of the latch on the base board.
    (cv[7] as Rgb[])[latchAt] = OAK_4;
    (cv[7] as Rgb[])[latchAt + 1] = OAK_4;
  }
  return cv;
}

/** Lid seen from above: 14 rows = z 1..15 (front at the top), boards along x. */
function chestTop(w: number, seed: string): Canvas {
  const rand = prng(hash(seed));
  const cv = canvas(w, 14);
  grain(cv, [1, 2, 3], rand, 1);
  hline(cv, 4, 0, w - 1, OAK_SEAM);
  grain(cv, [5, 6, 7, 8], rand);
  hline(cv, 9, 0, w - 1, OAK_SEAM);
  grain(cv, [10, 11, 12], rand);
  // Inner bevel: lit front edge, shaded back edge.
  hline(cv, 1, 1, w - 2, (x) => ((cv[1] as Rgb[])[x] === OAK_3 ? OAK_1 : OAK_LIGHT));
  hline(cv, 12, 1, w - 2, (x) => ((cv[12] as Rgb[])[x] === OAK_LIGHT ? OAK_2 : OAK_4));
  outline(cv, { left: true, right: true });
  return cv;
}

/** Copies `cv` columns `srcX..` into a 16×16 tile at (dx, dy) and extrudes the rest. */
function toTile(cv: Canvas, srcX: number, dx: number, dy: number): RgbaImage {
  const img = createImage(TILE, TILE);
  const w = Math.min(TILE - dx, (cv[0]?.length ?? 0) - srcX);
  const h = Math.min(TILE - dy, cv.length);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const sx = srcX + Math.max(0, Math.min(w - 1, x - dx));
      const sy = Math.max(0, Math.min(h - 1, y - dy));
      const c = (cv[sy] as Rgb[])[sx] as Rgb;
      const i = (y * TILE + x) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  return img;
}

/**
 * Chest textures. `a` = the half whose visible columns are 1..15 (seam at column 15),
 * `b` = the half with columns 0..14 (seam at column 0). On the front (north, u = 16 − x)
 * that is right / left, on top, bottom and back (u = x) left / right.
 */
function chestFamily(
  base: string,
  draw: (w: number, seed: string, double: boolean) => Canvas,
  row0: number,
  frontLike: boolean,
): Record<string, () => RgbaImage> {
  const a = frontLike ? 'right' : 'left';
  const b = frontLike ? 'left' : 'right';
  const wide = () => draw(30, `${base}_double`, true);
  return {
    [base]: () => toTile(draw(14, base, false), 0, 1, row0),
    [`${base}_${a}`]: () => toTile(wide(), 0, 1, row0),
    [`${base}_${b}`]: () => toTile(wide(), 15, 0, row0),
  };
}

/** Loads a PPL texture by laracraft name (first 16×16 frame). */
export type TextureLoader = (name: string) => RgbaImage;

function observerFront(load: TextureLoader): RgbaImage {
  // Stone frame of PPL's observer_side (rows 0..2, 13..15; columns 0..1, 14..15).
  const side = load('observer_side');
  const img = createImage(TILE, TILE);
  img.data.set(side.data.subarray(0, TILE * TILE * 4));
  const set = (x: number, y: number, v: number) => {
    const i = (y * TILE + x) * 4;
    const [r, g, b] = hex(v);
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    img.data[i + 3] = 255;
  };
  // Recessed sensor plate (rows 3..12, columns 2..13): shadowed top/left, lit bottom/right.
  for (let y = 3; y <= 12; y++) {
    for (let x = 2; x <= 13; x++) {
      let c = y % 2 === 0 ? 0x333144 : 0x292b3a; // grille slats (PPL observer palette)
      if (y === 3 || x === 2) c = 0x1c1c1c;
      else if (y === 12 || x === 13) c = 0x594e47;
      set(x, y, c);
    }
  }
  // Rivets in the plate corners.
  for (const [x, y] of [
    [3, 4],
    [12, 4],
    [3, 11],
    [12, 11],
  ] as const) {
    set(x, y, 0x87807c);
  }
  // Sensor visor: dark housing with a red lens bar, brightest in the middle.
  for (let x = 4; x <= 11; x++) {
    set(x, 6, 0x111111);
    set(x, 9, x === 4 || x === 11 ? 0x232323 : 0x4d413a);
  }
  set(4, 7, 0x111111);
  set(4, 8, 0x111111);
  set(11, 7, 0x111111);
  set(11, 8, 0x111111);
  const lens = [0x5a1408, 0xbc2f0e, 0xcf320e, 0xe2471c, 0xe2471c, 0xcf320e];
  lens.forEach((c, i) => {
    set(5 + i, 7, c);
    set(5 + i, 8, i === 0 ? 0x381212 : (lens[Math.max(0, i - 1)] as number));
  });
  set(8, 7, 0xf08a5a); // glint
  return img;
}

const PAINTERS: Record<string, (load: TextureLoader) => RgbaImage> = {
  ...chestFamily('chest_front', (w, seed, double) => chestSide(w, seed, double ? 14 : 6), 2, true),
  ...chestFamily('chest_side', (w, seed) => chestSide(w, seed, null), 2, false),
  ...chestFamily('chest_top', (w, seed) => chestTop(w, seed), 1, false),
  observer_front: observerFront,
};

export const OWN_PACK = 'laracraft_own';
export const OWN_TEXTURE_NAMES: readonly string[] = Object.keys(PAINTERS).sort();

export function renderOwnTexture(name: string, load: TextureLoader): RgbaImage {
  const painter = PAINTERS[name];
  if (!painter) throw new Error(`no painter for own texture "${name}"`);
  return painter(load);
}
