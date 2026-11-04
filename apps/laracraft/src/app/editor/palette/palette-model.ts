import type { BlockCategory, BlockDefinition, BlockRegistry } from '@laracraft/core-model';

/**
 * i18n key of a block's display name: `blocks.<path>` (generated files
 * `public/i18n/blocks/<lang>.json`, shared with the instruction mode).
 */
export function blockNameKey(def: Pick<BlockDefinition, 'id'>): string {
  return `blocks.${def.id.replace(/^minecraft:/, '')}`;
}

/** Blocks the palette never offers (air, moving piston, piston head …). */
export function isPaletteBlock(def: BlockDefinition): boolean {
  return def.category !== 'technical' && !def.tags?.includes('technical');
}

export interface PaletteData {
  readonly blocks: readonly BlockDefinition[];
  readonly categories: readonly BlockCategory[];
}

/** Palette blocks and their categories, in registry order. */
export function paletteData(registry: BlockRegistry): PaletteData {
  const blocks = registry.all().filter(isPaletteBlock);
  const categories = [...new Set(blocks.map((b) => b.category))];
  return { blocks, categories };
}

/** Lower case without diacritics, so "grun" finds "Grün" and "weiss" finds "Weiß". */
export function normalizeSearch(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss').trim();
}

/**
 * Text a block is found by: its display name in the active language, its
 * English name (derived from the id) and its English search tags.
 */
export function searchText(def: BlockDefinition, displayName: string): string {
  const english = def.id.replace(/^minecraft:/, '').replace(/_/g, ' ');
  return normalizeSearch([displayName, english, ...(def.tags ?? [])].join(' '));
}

/** Blocks whose search text contains every word of the query. */
export function searchBlocks(
  blocks: readonly BlockDefinition[],
  query: string,
  displayName: (def: BlockDefinition) => string,
): BlockDefinition[] {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...blocks];
  return blocks.filter((def) => {
    const text = searchText(def, displayName(def));
    return words.every((w) => text.includes(w));
  });
}

export const FAVORITES_KEY = 'laracraft.editor.favorites';
export const RECENT_KEY = 'laracraft.editor.recent';
export const MAX_RECENT = 12;

/** Reads a list of block ids; storage may be unavailable or hold garbage. */
export function readIdList(storage: Storage | undefined, key: string): string[] {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function writeIdList(
  storage: Storage | undefined,
  key: string,
  ids: readonly string[],
): void {
  try {
    storage?.setItem(key, JSON.stringify(ids));
  } catch {
    // Best effort (private mode, quota).
  }
}

/** Most recent first, without duplicates, at most {@link MAX_RECENT}. */
export function pushRecent(recent: readonly string[], id: string): string[] {
  return [id, ...recent.filter((r) => r !== id)].slice(0, MAX_RECENT);
}

export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((f) => f !== id) : [...ids, id];
}
