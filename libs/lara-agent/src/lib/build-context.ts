import type { BuildDocument } from '@laracraft/core-model';
import type { LaraContext } from './api';

/**
 * Compact build context sent with every Lara turn (after the cached prefix).
 *
 * Format (plain text inside `<build_context>` tags, English, block ids without the
 * `minecraft:` namespace and without properties):
 *
 * ```
 * <build_context>
 * App language: de (German). Target edition: java.
 * Blocks: 1234 non-air. Bounds: x -3..20, y 0..15, z 0..30 (size 24×16×31).
 * Block types (top 30 of 41, by count): stone_bricks 812, oak_planks 300, …, +11 more (57 blocks)
 * Layers (y: blocks – main types):
 * y 0: 540 – stone_bricks 500, dirt 40
 * y 1-3: 210 – oak_planks 150, glass_pane 40, oak_door 4          ← bands when > 40 layers
 * Height map (highest block y per cell; cell = 2×2 blocks; rows north→south starting at z -3, columns west→east starting at x 0; . = empty):
 *  5  5  6  .
 * Selection: x 0..4, y 1..5, z 0..4 (size 5×5×5), 30 blocks – oak_planks 20, glass 10
 * </build_context>
 * ```
 *
 * Size is bounded independently of the build: ≤ 30 block types, ≤ 40 layer lines with ≤ 4
 * types each, a height map of ≤ 24×24 cells, one selection line — roughly ≤ 8 000
 * characters (≈ 2–3k tokens) even for very large builds.
 */

export const CONTEXT_LIMITS = {
  blockTypes: 30,
  layerLines: 40,
  typesPerLayer: 4,
  heightMapCells: 24,
  /** Hard cap on the whole text (characters). */
  maxChars: 10_000,
} as const;

const LANGUAGE_NAMES = { de: 'German', en: 'English' } as const;

const shortId = (state: string): string => state.replace(/\[.*$/, '').replace(/^minecraft:/, '');

const range = (a: number, b: number): string => (a === b ? `${a}` : `${a}..${b}`);

function topList(counts: ReadonlyMap<string, number>, limit: number): string {
  const sorted = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shown = sorted.slice(0, limit).map(([id, n]) => `${id} ${n}`);
  const rest = sorted.slice(limit);
  if (rest.length) {
    const n = rest.reduce((s, [, c]) => s + c, 0);
    shown.push(`+${rest.length} more (${n} blocks)`);
  }
  return shown.join(', ');
}

export function buildContextText(context: LaraContext): string {
  const { doc, selection } = context;
  const lines: string[] = ['<build_context>'];
  lines.push(
    `App language: ${context.language} (${LANGUAGE_NAMES[context.language]}). Target edition: ${context.edition}.`,
  );
  const bounds = doc.volume.bounds();
  if (!bounds) {
    lines.push('The build is empty. Start near x 0, z 0 with the ground floor at y 0.');
    const sel = normalise(selection ?? null);
    if (sel) lines.push(`${selectionLabel(sel)}, 0 blocks`);
  } else {
    lines.push(...describeBuild(doc, bounds, selection ?? null));
  }
  lines.push('</build_context>');
  let text = lines.join('\n');
  if (text.length > CONTEXT_LIMITS.maxChars) {
    text = `${text.slice(0, CONTEXT_LIMITS.maxChars - 40)}\n…(truncated)\n</build_context>`;
  }
  return text;
}

type Box = NonNullable<ReturnType<BuildDocument['volume']['bounds']>>;

function describeBuild(doc: BuildDocument, b: Box, selection: LaraContext['selection']): string[] {
  const sx = b.max.x - b.min.x + 1;
  const sy = b.max.y - b.min.y + 1;
  const sz = b.max.z - b.min.z + 1;

  const cell = Math.max(1, Math.ceil(Math.max(sx, sz) / CONTEXT_LIMITS.heightMapCells));
  const cols = Math.ceil(sx / cell);
  const rows = Math.ceil(sz / cell);
  const heights = new Int32Array(cols * rows).fill(-0x7fffffff);

  const bandSize = Math.max(1, Math.ceil(sy / CONTEXT_LIMITS.layerLines));
  const bands = new Map<number, Map<string, number>>();
  const bandTotals = new Map<number, number>();
  const types = new Map<string, number>();

  const sel = normalise(selection);
  const selTypes = new Map<string, number>();
  let selCount = 0;

  const idOf = new Map<number, string>();
  let total = 0;
  doc.volume.forEachBlock((x, y, z, index) => {
    let id = idOf.get(index);
    if (id === undefined) {
      id = shortId(doc.palette.stateAt(index));
      idOf.set(index, id);
    }
    total++;
    types.set(id, (types.get(id) ?? 0) + 1);
    const band = Math.floor((y - b.min.y) / bandSize);
    let m = bands.get(band);
    if (!m) bands.set(band, (m = new Map()));
    m.set(id, (m.get(id) ?? 0) + 1);
    bandTotals.set(band, (bandTotals.get(band) ?? 0) + 1);
    const ci = Math.floor((z - b.min.z) / cell) * cols + Math.floor((x - b.min.x) / cell);
    if (y > (heights[ci] as number)) heights[ci] = y;
    if (
      sel &&
      x >= sel.min.x &&
      x <= sel.max.x &&
      y >= sel.min.y &&
      y <= sel.max.y &&
      z >= sel.min.z &&
      z <= sel.max.z
    ) {
      selCount++;
      selTypes.set(id, (selTypes.get(id) ?? 0) + 1);
    }
  });

  const out: string[] = [];
  out.push(
    `Blocks: ${total} non-air. Bounds: x ${range(b.min.x, b.max.x)}, y ${range(b.min.y, b.max.y)}, z ${range(b.min.z, b.max.z)} (size ${sx}×${sy}×${sz}).`,
  );
  out.push(
    `Block types (top ${Math.min(types.size, CONTEXT_LIMITS.blockTypes)} of ${types.size}, by count): ${topList(types, CONTEXT_LIMITS.blockTypes)}`,
  );
  out.push('Layers (y: blocks – main types):');
  for (const band of [...bands.keys()].sort((a, c) => a - c)) {
    const y0 = b.min.y + band * bandSize;
    const y1 = Math.min(b.max.y, y0 + bandSize - 1);
    const label = y0 === y1 ? `y ${y0}` : `y ${y0}-${y1}`;
    out.push(
      `${label}: ${bandTotals.get(band)} – ${topList(bands.get(band) as Map<string, number>, CONTEXT_LIMITS.typesPerLayer)}`,
    );
  }
  out.push(
    `Height map (highest block y per cell; cell = ${cell}×${cell} blocks; rows north→south starting at z ${b.min.z}, columns west→east starting at x ${b.min.x}; . = empty):`,
  );
  const width = Math.max(2, String(b.max.y).length, String(b.min.y).length);
  for (let r = 0; r < rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < cols; c++) {
      const h = heights[r * cols + c] as number;
      row.push((h === -0x7fffffff ? '.' : String(h)).padStart(width));
    }
    out.push(row.join(' '));
  }
  if (sel) {
    out.push(
      `${selectionLabel(sel)}, ${selCount} blocks${selCount ? ` – ${topList(selTypes, 8)}` : ''}`,
    );
  }
  return out;
}

function normalise(selection: LaraContext['selection']): Box | null {
  if (!selection) return null;
  const { min: a, max: c } = selection;
  return {
    min: { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), z: Math.min(a.z, c.z) },
    max: { x: Math.max(a.x, c.x), y: Math.max(a.y, c.y), z: Math.max(a.z, c.z) },
  };
}

function selectionLabel(sel: Box): string {
  const size = `${sel.max.x - sel.min.x + 1}×${sel.max.y - sel.min.y + 1}×${sel.max.z - sel.min.z + 1}`;
  return `Selection: x ${range(sel.min.x, sel.max.x)}, y ${range(sel.min.y, sel.max.y)}, z ${range(sel.min.z, sel.max.z)} (size ${size})`;
}
