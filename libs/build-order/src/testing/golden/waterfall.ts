import { GoldenDocBuilder, type GoldenBuild } from './builder';

/**
 * Waterfall: a stone cliff with a water trough on top that spills into a basin.
 *
 * - Cliff: stone x 0..4, y 0..4, z -1..1.
 * - Trough on the cliff top (y=5): walls at x=1 and x=3 (z -1..1) and a back wall
 *   (2,5,-1); two water SOURCES at (2,5,0) and (2,5,1), open towards +z.
 * - Basin: stone floor x 0..4, y=0, z 2..6, rim at y=1 on x=0, x=4 and z=6.
 * - Flowing water as Java would show it right after placing the sources: the lip
 *   (2,5,2) level=1 and the falling column (2,4..1,2) level=8. The spread across
 *   the basin floor is omitted. Flowing water is optional for completeness: it
 *   appears on its own once its source is placed.
 *
 * Exercises: fluids-last (sources only in the fluids phase, after all stone),
 * completeness (flowing water optional, sources required).
 */
export const WATERFALL: GoldenBuild = {
  name: 'waterfall',
  description: 'Stone cliff with a two-source water trough on top that falls into a stone basin.',
  create(registry) {
    const b = new GoldenDocBuilder(registry, 'waterfall', WATERFALL.description);
    const stone = 'minecraft:stone';
    b.fill(0, 0, -1, 4, 4, 1, stone);
    b.fill(1, 5, -1, 1, 5, 1, stone);
    b.fill(3, 5, -1, 3, 5, 1, stone);
    b.set(2, 5, -1, stone);

    b.fill(0, 0, 2, 4, 0, 6, stone);
    b.fill(0, 1, 2, 0, 1, 6, stone);
    b.fill(4, 1, 2, 4, 1, 6, stone);
    b.fill(1, 1, 6, 3, 1, 6, stone);

    b.set(2, 5, 0, 'minecraft:water[level=0]');
    b.set(2, 5, 1, 'minecraft:water[level=0]');
    b.set(2, 5, 2, 'minecraft:water[level=1]');
    for (let y = 1; y <= 4; y++) b.set(2, y, 2, 'minecraft:water[level=8]');
    return b.doc;
  },
};
