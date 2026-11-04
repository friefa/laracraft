import { GoldenDocBuilder, type GoldenBuild } from './builder';

/**
 * Lever-operated 2×2 sticky piston door (Java), stored in its resting state:
 * lever off, pistons retracted, doorway open. Flipping the lever on closes the
 * door, flipping it off opens it again.
 *
 * Design: the common "two stacked sticky pistons per side" 2×2 door. Each side's
 * pair is powered by one dust line that ends on a block behind the lower piston:
 * the dust points into the upper piston (dust powers the block it points at) and
 * weakly powers the block below it, which activates the lower piston (a weakly
 * powered block activates adjacent mechanism components). No quasi-connectivity
 * is involved. The two sides are joined by a line above the doorway with one
 * repeater; the longest branch (lever → right side) arrives with signal 9.
 *
 * Doorway: x 0..1, y 1..2, plane z = 0, walking direction ±z. Floor y=0.
 *
 * Front view (z = 0), lever off:
 *
 *   y=3    .  w  .  L  L  L  L  L  L  .  w     L = stone brick lintel, w = feed dust
 *   y=2    .  S  W  P> D  .  .  D <P  W  S     W = dust pointing at the upper piston
 *   y=1    .  S  B  P> D  .  .  D <P  B  S     P = sticky piston (> east, < west)
 *   y=0    smooth stone floor (x -5..5, z -1..2)  D = door block (polished andesite)
 *   x=    -5 -4 -3 -2 -1  0  1  2  3  4  5     B, S = stone
 *
 * Back row (z = 1), carries the feed over the doorway:
 *
 *   y=4    .  .  w  w  w  R  w  w  w  w  .     R = repeater, facing=west (input west,
 *   y=3    l  w  S  S  S  S  S  S  S  S  w         signal flows east)
 *   y=2    S  S  S  .  .  .  .  .  .  S  S     l = lever on top of (-5,2,1)
 *   y=1    S  S  S  .  .  .  .  .  .  S  S
 *   x=    -5 -4 -3 -2 -1  0  1  2  3  4  5
 *
 * Signal path: lever (-5,3,1) → dust (-4,3,1) ─┬→ (-4,3,0) → down to (-3,2,0) [left W]
 *                                              └→ up to (-3,4,1) → … → repeater (0,4,1) → …
 *                                                 → (4,4,1) → down (5,3,1) → (5,3,0) → down (4,2,0) [right W]
 *
 * When powered: left pistons push their door blocks from x=-1 to x=0, right
 * pistons from x=2 to x=1 → doorway closed. Unpowered: sticky pistons pull them back.
 *
 * Exercises: redstone-safety (lever last, pistons not next to power), orientation
 * (3D piston facing, repeater facing, lever face/facing), support (dust and repeater
 * on rigid tops, lever on a floor face).
 */
export const PISTON_DOOR: GoldenBuild = {
  name: 'piston-door',
  description:
    '2×2 sticky piston door (two stacked sticky pistons per side) operated by one lever, with a repeater in the feed line; stored with the lever off (door open).',
  create(registry) {
    const b = new GoldenDocBuilder(registry, 'piston-door', PISTON_DOOR.description);
    const stone = 'minecraft:stone';
    const wire = (e: string, n: string, s: string, w: string) =>
      `minecraft:redstone_wire[east=${e},north=${n},power=0,south=${s},west=${w}]`;

    b.fill(-5, 0, -1, 5, 0, 2, 'minecraft:smooth_stone');

    // Pistons and door blocks.
    for (const y of [1, 2]) {
      b.set(-2, y, 0, 'minecraft:sticky_piston[extended=false,facing=east]');
      b.set(-1, y, 0, 'minecraft:polished_andesite');
      b.set(2, y, 0, 'minecraft:polished_andesite');
      b.set(3, y, 0, 'minecraft:sticky_piston[extended=false,facing=west]');
    }
    b.fill(-2, 3, 0, 3, 3, 0, 'minecraft:stone_bricks');

    // Left side: block behind the lower piston, dust on it pointing east.
    b.set(-3, 1, 0, stone);
    b.set(-3, 2, 0, wire('side', 'none', 'none', 'up'));
    b.fill(-4, 1, 0, -4, 2, 0, stone);
    b.set(-4, 3, 0, wire('side', 'none', 'side', 'none'));
    b.fill(-4, 1, 1, -4, 2, 1, stone);
    b.set(-4, 3, 1, wire('up', 'side', 'none', 'side'));
    b.fill(-5, 1, 1, -5, 2, 1, stone);
    b.set(-5, 3, 1, 'minecraft:lever[face=floor,facing=east,powered=false]');

    // Feed above the doorway (z = 1).
    b.fill(-3, 1, 1, -3, 2, 1, stone);
    b.fill(4, 1, 1, 4, 2, 1, stone);
    b.fill(-3, 3, 1, 4, 3, 1, stone);
    for (let x = -3; x <= 4; x++) {
      if (x === 0) continue;
      b.set(x, 4, 1, wire('side', 'none', 'none', 'side'));
    }
    b.set(0, 4, 1, 'minecraft:repeater[delay=1,facing=west,locked=false,powered=false]');

    // Right side, mirrored: dust on the block behind the lower piston points west.
    b.fill(5, 1, 1, 5, 2, 1, stone);
    b.set(5, 3, 1, wire('none', 'side', 'none', 'up'));
    b.fill(5, 1, 0, 5, 2, 0, stone);
    b.set(5, 3, 0, wire('none', 'none', 'side', 'side'));
    b.set(4, 1, 0, stone);
    b.set(4, 2, 0, wire('up', 'none', 'none', 'side'));
    return b.doc;
  },
};
