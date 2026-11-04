import type { MaterialCount } from '@laracraft/build-order';

/** Items that stack to 16 in Java Edition (the ones relevant for builds). */
const STACK_16 = /(_sign|_banner|^snowball|^egg|^ender_pearl|^honey_bottle|^armor_stand)$/;

/** Java Edition stack size of an item id (`minecraft:` prefix optional). */
export function stackSizeOf(item: string): number {
  const path = item.slice(item.indexOf(':') + 1);
  if (path.endsWith('_bucket')) return 1;
  if (STACK_16.test(path)) return 16;
  return 64;
}

/**
 * Compact stack notation used in material lists: `12`, `1×64`, `2×64 + 12`.
 * Items that do not stack (filled buckets) are shown as a plain count.
 */
export function formatStacks(count: number, stackSize = 64): string {
  const n = Math.max(0, Math.floor(count));
  const stacks = Math.floor(n / stackSize);
  const rest = n % stackSize;
  if (stackSize <= 1 || stacks === 0) return String(n);
  const full = `${stacks}×${stackSize}`;
  return rest > 0 ? `${full} + ${rest}` : full;
}

export function formatItemStacks(m: MaterialCount): string {
  return formatStacks(m.count, stackSizeOf(m.item));
}

export interface MaterialSort {
  readonly by: 'name' | 'count';
  readonly dir: 'asc' | 'desc';
}

/** Sorted copy; ties fall back to the item id so the order is stable. */
export function sortMaterials(
  list: readonly MaterialCount[],
  sort: MaterialSort,
  nameOf: (item: string) => string,
  locale?: string,
): MaterialCount[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  return [...list].sort((a, b) => {
    const primary =
      sort.by === 'count' ? a.count - b.count : collator.compare(nameOf(a.item), nameOf(b.item));
    return primary !== 0 ? sign * primary : a.item.localeCompare(b.item);
  });
}
