import type { Pos } from './pos';

/**
 * Reproduces the iteration order of `java.util.HashSet<BlockPos>` / `HashMap<BlockPos, …>`.
 *
 * Java Edition iterates hash sets in two redstone-relevant places: redstone dust notifies the
 * 7 positions around a changed wire from a `HashSet` (the source of "locational" dust
 * behaviour), and pistons clear vacated positions from a `HashMap`. Emulating the JDK order
 * makes those effects deterministic and identical to the game.
 * Sources: https://minecraft.wiki/w/Redstone_Dust (update order is location dependent),
 * https://technical-minecraft.fandom.com/wiki/Locationality (hash-based update order).
 *
 * `BlockPos.hashCode()` = `(y + z * 31) * 31 + x` (int arithmetic, `Vec3i`),
 * `HashMap.hash(h)` = `h ^ (h >>> 16)`, bucket = `hash & (capacity - 1)`. Without
 * treeification the iteration is bucket by bucket, entries of one bucket in insertion order
 * (resizes preserve the relative order). Capacity starts at 16 and doubles when the size
 * exceeds 0.75 × capacity.
 */
export function blockPosHash(p: Pos): number {
  const h = (Math.imul((p.y + Math.imul(p.z, 31)) | 0, 31) + p.x) | 0;
  return h ^ (h >>> 16);
}

/**
 * Iteration order of a hash set after inserting `positions` in this order (duplicates are
 * ignored like `HashSet.add`). `maxSize` is the largest size the map reached (for capacity);
 * defaults to the number of distinct positions.
 */
export function javaHashOrder(positions: readonly Pos[], maxSize?: number): Pos[] {
  const seen = new Set<string>();
  const distinct: Pos[] = [];
  for (const p of positions) {
    const k = `${p.x},${p.y},${p.z}`;
    if (seen.has(k)) continue;
    seen.add(k);
    distinct.push(p);
  }
  let capacity = 16;
  const size = maxSize ?? distinct.length;
  while (size > capacity * 0.75) capacity *= 2;
  const mask = capacity - 1;
  return distinct
    .map((p, i) => ({ p, i, b: blockPosHash(p) & mask }))
    .sort((a, b) => a.b - b.b || a.i - b.i)
    .map((e) => e.p);
}
