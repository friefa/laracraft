import { GoldenDocBuilder, type GoldenBuild } from './builder';

/**
 * Stone brick tower with a cantilevered top floor (x 0..7, y 0..9, z 0..4).
 *
 *   y=0     solid 5×5 base (x 0..4, z 0..4)
 *   y=1–8   hollow 5×5 walls (3×3 inside), entrance (2,1..2,4) in the south wall
 *   y=1–9   ladder at (2,y,1), facing=south: hangs on the north wall (2,y,0);
 *           at y=9 it passes through the top floor and hangs on the floor block (2,9,0)
 *   y=9     top floor x 0..7, z 0..4: the part x 5..7 overhangs the east wall by
 *           3 blocks with nothing below it
 *   (5,8,2) wall torch facing=east under the overhang, on the east wall (4,8,2)
 *   (7,8,2) lantern hanging=true under the outer edge of the overhang
 *
 * Exercises: support (ladder after each wall block, lantern after the overhang,
 * conditional support rule), click targets for the cantilever (each overhang block
 * is clicked on its western neighbour), reachability high up (scaffolding or
 * standing on the floor itself).
 */
export const TOWER: GoldenBuild = {
  name: 'tower',
  description:
    'Stone brick tower with a ladder inside, a top floor cantilevered 3 blocks out, a wall torch and a hanging lantern under the overhang.',
  create(registry) {
    const b = new GoldenDocBuilder(registry, 'tower', TOWER.description);
    const brick = 'minecraft:stone_bricks';
    b.fill(0, 0, 0, 4, 0, 4, brick);
    for (let y = 1; y <= 8; y++) {
      for (let i = 0; i <= 4; i++) {
        b.set(i, y, 0, brick);
        b.set(i, y, 4, brick);
        b.set(0, y, i, brick);
        b.set(4, y, i, brick);
      }
    }
    b.clear(2, 1, 4);
    b.clear(2, 2, 4);

    b.fill(0, 9, 0, 7, 9, 4, brick);
    for (let y = 1; y <= 9; y++) b.set(2, y, 1, 'minecraft:ladder[facing=south]');

    b.set(5, 8, 2, 'minecraft:wall_torch[facing=east]');
    b.set(7, 8, 2, 'minecraft:lantern[hanging=true]');
    return b.doc;
  },
};
