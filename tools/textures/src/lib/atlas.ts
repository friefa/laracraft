import { createImage, type RgbaImage } from './png';

export interface AtlasInput extends RgbaImage {
  name: string;
}

/** Placement of one texture inside the atlas. Pixel rect excludes the padding. */
export interface AtlasRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Normalized UVs, origin top-left of the image (v grows downwards). */
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /** Number of vertically stacked animation frames (h / w); 1 for static textures. */
  frames: number;
}

export interface AtlasLayout {
  width: number;
  height: number;
  padding: number;
  rects: Record<string, AtlasRect>;
}

export interface AtlasOptions {
  /** Pixels of edge extrusion around every texture (default 2). */
  padding?: number;
  /** Largest allowed edge length (default 4096, safe for WebGL2 on mobile). */
  maxSize?: number;
}

export const nextPow2 = (n: number): number => {
  let p = 1;
  while (p < n) p *= 2;
  return p;
};

interface Placement {
  name: string;
  cellX: number;
  cellY: number;
}

/** Shelf-pack cells into a strip of the given width; returns placements and used height. */
function shelfPack(
  items: readonly { name: string; cw: number; ch: number }[],
  width: number,
): { placements: Placement[]; usedHeight: number } {
  const placements: Placement[] = [];
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const it of items) {
    if (x + it.cw > width) {
      y += shelf;
      x = 0;
      shelf = 0;
    }
    placements.push({ name: it.name, cellX: x, cellY: y });
    x += it.cw;
    shelf = Math.max(shelf, it.ch);
  }
  return { placements, usedHeight: y + shelf };
}

/** Compute a deterministic power-of-two layout (no pixel work). */
export function layoutAtlas(
  inputs: readonly { name: string; width: number; height: number }[],
  options: AtlasOptions = {},
): AtlasLayout {
  const padding = options.padding ?? 2;
  const maxSize = options.maxSize ?? 4096;
  if (inputs.length === 0) throw new Error('atlas: no textures selected');
  const names = new Set<string>();
  for (const i of inputs) {
    if (names.has(i.name)) throw new Error(`atlas: duplicate texture name "${i.name}"`);
    names.add(i.name);
  }

  const items = inputs
    .map((i) => ({
      name: i.name,
      w: i.width,
      h: i.height,
      cw: i.width + 2 * padding,
      ch: i.height + 2 * padding,
    }))
    .sort((a, b) => b.ch - a.ch || b.cw - a.cw || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const area = items.reduce((s, i) => s + i.cw * i.ch, 0);
  const widest = items.reduce((m, i) => Math.max(m, i.cw), 0);
  let width = nextPow2(Math.max(widest, Math.ceil(Math.sqrt(area))));
  for (;;) {
    if (width > maxSize) throw new Error(`atlas: textures do not fit into ${maxSize}x${maxSize}`);
    const { placements, usedHeight } = shelfPack(items, width);
    const height = nextPow2(usedHeight);
    if (height > width) {
      width *= 2;
      continue;
    }
    const rects: Record<string, AtlasRect> = {};
    placements.forEach((p, idx) => {
      const it = items[idx];
      if (!it) return;
      const x = p.cellX + padding;
      const y = p.cellY + padding;
      rects[it.name] = {
        x,
        y,
        w: it.w,
        h: it.h,
        u0: x / width,
        v0: y / height,
        u1: (x + it.w) / width,
        v1: (y + it.h) / height,
        frames: it.h / it.w,
      };
    });
    // Emit rects in name order so the JSON is stable and diff-friendly.
    const sorted: Record<string, AtlasRect> = {};
    for (const n of Object.keys(rects).sort()) sorted[n] = rects[n] as AtlasRect;
    return { width, height, padding, rects: sorted };
  }
}

/** Pack textures and blit them with edge extrusion to avoid bleeding under filtering/mipmaps. */
export function buildAtlas(
  inputs: readonly AtlasInput[],
  options: AtlasOptions = {},
): { layout: AtlasLayout; image: RgbaImage } {
  const layout = layoutAtlas(inputs, options);
  const { padding } = layout;
  const image = createImage(layout.width, layout.height);
  for (const src of inputs) {
    const r = layout.rects[src.name];
    if (!r) throw new Error(`atlas: internal error, ${src.name} not placed`);
    for (let dy = -padding; dy < src.height + padding; dy++) {
      const sy = Math.min(Math.max(dy, 0), src.height - 1);
      for (let dx = -padding; dx < src.width + padding; dx++) {
        const sx = Math.min(Math.max(dx, 0), src.width - 1);
        const si = (sy * src.width + sx) * 4;
        const di = ((r.y + dy) * layout.width + (r.x + dx)) * 4;
        image.data[di] = src.data[si] ?? 0;
        image.data[di + 1] = src.data[si + 1] ?? 0;
        image.data[di + 2] = src.data[si + 2] ?? 0;
        image.data[di + 3] = src.data[si + 3] ?? 0;
      }
    }
  }
  return { layout, image };
}
