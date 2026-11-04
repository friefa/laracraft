import { GoldenDocBuilder, type GoldenBuild } from './builder';

/**
 * Sand gate (x 0..6, y 0..8, z = 0, one block thick), on the terrain (groundY = -1).
 *
 *   y    x: 0  1  2  3  4  5  6
 *   8          .  .  .  S  .  .  .
 *   7          S  S  S  S  S  S  S      S = sand
 *   6          G  T  S  S  S  T  S      G = gravel
 *   5          G  .  T  T  T  .  S      T = sandstone (does not fall)
 *   0–4        G  .  .  .  .  .  S
 *
 * - Pillars: gravel at x=0, sand at x=6 (y 0..6): gravity blocks built bottom-up.
 * - Shoulders: sandstone (1,6) and (5,6) hang on the pillars' sides.
 * - Lintel: sandstone (2..4,5) floats one block below the shoulders and touches
 *   no block that can exist before it (its only final neighbours are the sand
 *   above it). It therefore needs a TEMPORARY support to click on (e.g. a dirt
 *   column under (2,5) or (3,5)), removed afterwards. Removing it is legal:
 *   sandstone has no gravity, and no gravity block rests on the temporary block.
 * - Crown: sand (2..4,6) on the lintel, sand row y=7 on shoulders/pillars/sand,
 *   keystone sand (3,8).
 *
 * Every gravity block rests on a block below it in the final build. Note that in
 * Java a temporary support directly UNDER a gravity block can never be removed
 * (the block falls), so gravity alone never justifies a removable temporary block.
 *
 * Exercises: gravity (pillars and crown bottom-up), temporary-cleanup (lintel
 * support), click-target (floating lintel), reachability (crown at y 7–8).
 */
export const SAND_ARCH: GoldenBuild = {
  name: 'sand-arch',
  description:
    'Sand and gravel pillars carrying a floating sandstone lintel with a sand crown; the lintel needs a temporary support.',
  create(registry) {
    const b = new GoldenDocBuilder(registry, 'sand-arch', SAND_ARCH.description);
    b.fill(0, 0, 0, 0, 6, 0, 'minecraft:gravel');
    b.fill(6, 0, 0, 6, 6, 0, 'minecraft:sand');
    b.set(1, 6, 0, 'minecraft:sandstone');
    b.set(5, 6, 0, 'minecraft:sandstone');
    b.fill(2, 5, 0, 4, 5, 0, 'minecraft:sandstone');
    b.fill(2, 6, 0, 4, 6, 0, 'minecraft:sand');
    b.fill(0, 7, 0, 6, 7, 0, 'minecraft:sand');
    b.set(3, 8, 0, 'minecraft:sand');
    return b.doc;
  },
};
