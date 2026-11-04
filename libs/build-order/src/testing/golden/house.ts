import { GoldenDocBuilder, type GoldenBuild } from './builder';

/**
 * Small house, 7×5×7 (x 0..6, y 0..4, z 0..6), sitting on the terrain (groundY = -1).
 *
 *   y=0   cobblestone floor 7×7
 *   y=1–3 walls: oak log corners (axis=y), oak plank walls,
 *         door in the south wall at x=3 (facing=north: placed walking in, looking north),
 *         glass windows at y=2: north (3,2,0), west (0,2,3), east (6,2,3),
 *         south (1,2,6) and (5,2,6)
 *         wall torches inside at y=2: (1,2,2) on the west wall, (5,2,4) on the east
 *         wall, (2,2,5) on the south wall
 *   y=4   roof: stair eaves facing inward (north edge facing=south, south edge
 *         facing=north, west edge facing=east, east edge facing=west), plank
 *         corners and a plank infill.
 *
 * Exercises: support (wall torches after their wall, door after the floor),
 * orientation (stairs, door, logs, wall torches), completeness (two-part door).
 */
export const HOUSE: GoldenBuild = {
  name: 'house',
  description:
    'Small 7×5×7 oak house with a door, a stair-edged roof, glass windows and wall torches inside.',
  create(registry) {
    const b = new GoldenDocBuilder(registry, 'house', HOUSE.description);
    b.fill(0, 0, 0, 6, 0, 6, 'minecraft:cobblestone');

    // Walls.
    for (let y = 1; y <= 3; y++) {
      for (let i = 0; i <= 6; i++) {
        b.set(i, y, 0, 'minecraft:oak_planks');
        b.set(i, y, 6, 'minecraft:oak_planks');
        b.set(0, y, i, 'minecraft:oak_planks');
        b.set(6, y, i, 'minecraft:oak_planks');
      }
      for (const [x, z] of [
        [0, 0],
        [6, 0],
        [0, 6],
        [6, 6],
      ] as const) {
        b.set(x, y, z, 'minecraft:oak_log[axis=y]');
      }
    }

    // Door (south wall).
    b.set(3, 1, 6, 'minecraft:oak_door[facing=north,half=lower,hinge=left]');
    b.set(3, 2, 6, 'minecraft:oak_door[facing=north,half=upper,hinge=left]');

    // Windows.
    for (const [x, z] of [
      [3, 0],
      [0, 3],
      [6, 3],
      [1, 6],
      [5, 6],
    ] as const) {
      b.set(x, 2, z, 'minecraft:glass');
    }

    // Wall torches inside; each hangs on the wall opposite of its facing.
    b.set(1, 2, 2, 'minecraft:wall_torch[facing=east]'); // on (0,2,2)
    b.set(5, 2, 4, 'minecraft:wall_torch[facing=west]'); // on (6,2,4)
    b.set(2, 2, 5, 'minecraft:wall_torch[facing=north]'); // on (2,2,6)

    // Roof.
    for (let i = 1; i <= 5; i++) {
      b.set(i, 4, 0, 'minecraft:oak_stairs[facing=south,half=bottom]');
      b.set(i, 4, 6, 'minecraft:oak_stairs[facing=north,half=bottom]');
      b.set(0, 4, i, 'minecraft:oak_stairs[facing=east,half=bottom]');
      b.set(6, 4, i, 'minecraft:oak_stairs[facing=west,half=bottom]');
    }
    for (const [x, z] of [
      [0, 0],
      [6, 0],
      [0, 6],
      [6, 6],
    ] as const) {
      b.set(x, 4, z, 'minecraft:oak_planks');
    }
    b.fill(1, 4, 1, 5, 4, 5, 'minecraft:oak_planks');
    return b.doc;
  },
};
