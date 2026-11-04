import { LocalBuilder, defineModule, moduleKey, wire, type ResolvedParams } from '../define';
import type { EnumParamSpec } from '../types';

/** Full blocks a piston can push that look good as a door (all in the registry). */
const DOOR_BLOCKS = [
  'polished_andesite',
  'stone',
  'stone_bricks',
  'smooth_stone',
  'cobblestone',
  'polished_diorite',
  'polished_granite',
] as const;

const doorBlockParam = (id: string): EnumParamSpec => ({
  type: 'string',
  enum: DOOR_BLOCKS,
  default: 'polished_andesite',
  descriptionKey: moduleKey(id, 'param.doorBlock'),
});

const doorBlock = (p: ResolvedParams): string => `minecraft:${String(p['doorBlock'])}`;

const STONE = 'minecraft:stone';
const LINTEL = 'minecraft:stone_bricks';
const sticky = (facing: string) => `minecraft:sticky_piston[extended=false,facing=${facing}]`;

const BEDROCK_PISTON_NOTE =
  'Relies only on direct power (dust pointing into the upper piston, the block under that dust ' +
  'powering the lower piston); no quasi-connectivity. Bedrock pistons and dust direction rules ' +
  'differ in detail and the design has not been verified there.';

/**
 * 2×2 sticky piston door, lever-operated (Java Edition).
 *
 * Design: the common "two stacked sticky pistons per side" 2×2 door, identical to the
 * build-order golden build `piston-door` (libs/build-order/src/testing/golden/piston-door.ts),
 * which is already planned and validated there. When closed the door blocks sit in the
 * wall plane, flush with the wall (the classic "flush 2×2" in its simplest form).
 * Each side's piston pair is fed by one dust line ending on the block behind the lower
 * piston: that dust points into the upper piston and powers the block under it, which
 * activates the lower piston. No quasi-connectivity, no block-dropping.
 * The two sides are joined by a feed line behind and above the doorway with one repeater
 * (longest branch arrives with signal 9).
 *
 * References:
 * - https://minecraft.wiki/w/Tutorials/Piston_door (2×2 sticky piston door)
 * - https://minecraft.wiki/w/Redstone_Dust (dust powers the block it points into and the block below)
 *
 * Local layout (facing north = the doorway's front faces −Z), lever off = door open:
 *
 *   front row z=0                          back row z=1
 *   y=3  . . . . . . . . . . .             . . w w w R w w w w .   R = repeater (signal → east)
 *   y=2  . w . L L L L L L . w             l w S S S S S S S S w   l = lever, w = dust
 *   y=1  . S W P D . . D P W S             S S S . . . . . . S S   P = sticky piston, D = door block
 *   y=0  . S B P D . . D P B S             S S S . . . . . . S S   L = lintel, S/B = stone
 *   x=   0 1 2 3 4 5 6 7 8 9 10            0 1 2 3 4 5 6 7 8 9 10
 *
 * Doorway: x 5..6, y 0..1, z 0 (anchor = its lower west cell). Lever on: pistons push the
 * door blocks from x=4/x=7 into the doorway (closed); lever off: they are pulled back (open).
 */
export const PISTON_DOOR_2X2 = defineModule({
  id: 'piston_door_2x2',
  nameKey: moduleKey('piston_door_2x2', 'name'),
  descriptionKey: moduleKey('piston_door_2x2', 'description'),
  category: 'door',
  editions: { java: 'tested', bedrock: 'untested' },
  editionNotes: { bedrock: BEDROCK_PISTON_NOTE },
  size: { x: 11, y: 4, z: 2 },
  anchor: { x: 5, y: 0, z: 0 },
  design:
    'Two stacked sticky pistons per side push two door blocks each into a 2×2 doorway; one lever, one repeater.',
  references: [
    'https://minecraft.wiki/w/Tutorials/Piston_door',
    'https://minecraft.wiki/w/Redstone_Dust',
    'libs/build-order/src/testing/golden/piston-door.ts',
  ],
  ports: [
    { name: 'lever', kind: 'input', pos: { x: 0, y: 2, z: 1 }, side: 'west', signal: 'level' },
  ],
  params: { doorBlock: doorBlockParam('piston_door_2x2') },
  behaviour: {
    status: 'specified',
    initial: {
      outputs: {},
      cells: [
        { pos: { x: 5, y: 0, z: 0 }, filled: false },
        { pos: { x: 6, y: 0, z: 0 }, filled: false },
        { pos: { x: 5, y: 1, z: 0 }, filled: false },
        { pos: { x: 6, y: 1, z: 0 }, filled: false },
      ],
    },
    steps: [
      {
        description: 'Lever on: all four pistons extend, the doorway is closed.',
        set: { lever: true },
        waitTicks: 10,
        expect: {
          cells: [
            { pos: { x: 5, y: 0, z: 0 }, filled: true },
            { pos: { x: 6, y: 0, z: 0 }, filled: true },
            { pos: { x: 5, y: 1, z: 0 }, filled: true },
            { pos: { x: 6, y: 1, z: 0 }, filled: true },
          ],
        },
      },
      {
        description: 'Lever off: the sticky pistons pull the blocks back, the doorway is open.',
        set: { lever: false },
        waitTicks: 10,
        expect: {
          cells: [
            { pos: { x: 5, y: 0, z: 0 }, filled: false },
            { pos: { x: 6, y: 0, z: 0 }, filled: false },
            { pos: { x: 5, y: 1, z: 0 }, filled: false },
            { pos: { x: 6, y: 1, z: 0 }, filled: false },
            { pos: { x: 4, y: 0, z: 0 }, filled: true },
            { pos: { x: 7, y: 1, z: 0 }, filled: true },
          ],
        },
      },
    ],
  },
  blocks(p) {
    const b = new LocalBuilder();
    const door = doorBlock(p);
    for (const y of [0, 1]) {
      b.set(3, y, 0, sticky('east'));
      b.set(4, y, 0, door);
      b.set(7, y, 0, door);
      b.set(8, y, 0, sticky('west'));
    }
    b.fill(3, 2, 0, 8, 2, 0, LINTEL);

    // West side: dust on the block behind the lower piston points east into the upper one.
    b.set(2, 0, 0, STONE);
    b.set(2, 1, 0, wire({ e: 'side', w: 'up' }));
    b.fill(1, 0, 0, 1, 1, 0, STONE);
    b.set(1, 2, 0, wire({ e: 'side', s: 'side' }));
    b.fill(1, 0, 1, 1, 1, 1, STONE);
    b.set(1, 2, 1, wire({ e: 'up', n: 'side', w: 'side' }));
    b.fill(0, 0, 1, 0, 1, 1, STONE);
    b.set(0, 2, 1, 'minecraft:lever[face=floor,facing=east,powered=false]');

    // Feed line behind and above the doorway (z = 1).
    b.fill(2, 0, 1, 2, 1, 1, STONE);
    b.fill(9, 0, 1, 9, 1, 1, STONE);
    b.fill(2, 2, 1, 9, 2, 1, STONE);
    for (let x = 2; x <= 9; x++) {
      if (x === 5)
        b.set(x, 3, 1, 'minecraft:repeater[delay=1,facing=west,locked=false,powered=false]');
      else b.set(x, 3, 1, wire({ e: 'side', w: 'side' }));
    }

    // East side, mirrored.
    b.fill(10, 0, 1, 10, 1, 1, STONE);
    b.set(10, 2, 1, wire({ n: 'side', w: 'up' }));
    b.fill(10, 0, 0, 10, 1, 0, STONE);
    b.set(10, 2, 0, wire({ s: 'side', w: 'side' }));
    b.set(9, 0, 0, STONE);
    b.set(9, 1, 0, wire({ e: 'up', w: 'side' }));
    return b.blocks();
  },
});

/**
 * 1×2 sticky piston door, lever-operated (Java Edition).
 *
 * Design: the simplest piston door — two stacked sticky pistons beside a 1-wide, 2-high
 * doorway, each holding one door block. A lever on the block behind them feeds one dust
 * that points into the upper piston; the block under that dust powers the lower piston
 * (same powering trick as the 2×2 door, no quasi-connectivity).
 *
 * References:
 * - https://minecraft.wiki/w/Tutorials/Piston_door (1×2 / 2×1 piston door)
 * - https://minecraft.wiki/w/Redstone_Dust
 *
 * Local layout (single row z = 0, facing north), lever off = door open:
 *
 *   y=2  . . L L L L      L = lintel
 *   y=1  l w P D . S      l = lever on top of stone, w = dust, P = sticky piston (→ east)
 *   y=0  S S P D . S      D = door block, doorway at x = 4
 *   x=   0 1 2 3 4 5
 */
export const PISTON_DOOR_1X2 = defineModule({
  id: 'piston_door_1x2',
  nameKey: moduleKey('piston_door_1x2', 'name'),
  descriptionKey: moduleKey('piston_door_1x2', 'description'),
  category: 'door',
  editions: { java: 'tested', bedrock: 'untested' },
  editionNotes: { bedrock: BEDROCK_PISTON_NOTE },
  size: { x: 6, y: 3, z: 1 },
  anchor: { x: 4, y: 0, z: 0 },
  design: 'Two stacked sticky pistons push two door blocks into a 1×2 doorway; lever and one dust.',
  references: [
    'https://minecraft.wiki/w/Tutorials/Piston_door',
    'https://minecraft.wiki/w/Redstone_Dust',
  ],
  ports: [
    { name: 'lever', kind: 'input', pos: { x: 0, y: 1, z: 0 }, side: 'west', signal: 'level' },
  ],
  params: { doorBlock: doorBlockParam('piston_door_1x2') },
  behaviour: {
    status: 'specified',
    initial: {
      cells: [
        { pos: { x: 4, y: 0, z: 0 }, filled: false },
        { pos: { x: 4, y: 1, z: 0 }, filled: false },
      ],
    },
    steps: [
      {
        description: 'Lever on: both pistons extend, the doorway is closed.',
        set: { lever: true },
        waitTicks: 6,
        expect: {
          cells: [
            { pos: { x: 4, y: 0, z: 0 }, filled: true },
            { pos: { x: 4, y: 1, z: 0 }, filled: true },
          ],
        },
      },
      {
        description: 'Lever off: the blocks are pulled back, the doorway is open.',
        set: { lever: false },
        waitTicks: 6,
        expect: {
          cells: [
            { pos: { x: 4, y: 0, z: 0 }, filled: false },
            { pos: { x: 4, y: 1, z: 0 }, filled: false },
            { pos: { x: 3, y: 0, z: 0 }, filled: true },
            { pos: { x: 3, y: 1, z: 0 }, filled: true },
          ],
        },
      },
    ],
  },
  blocks(p) {
    const b = new LocalBuilder();
    const door = doorBlock(p);
    b.set(0, 0, 0, STONE);
    b.set(0, 1, 0, 'minecraft:lever[face=floor,facing=east,powered=false]');
    b.set(1, 0, 0, STONE);
    b.set(1, 1, 0, wire({ e: 'side', w: 'side' }));
    for (const y of [0, 1]) {
      b.set(2, y, 0, sticky('east'));
      b.set(3, y, 0, door);
      b.set(5, y, 0, STONE);
    }
    b.fill(2, 2, 0, 5, 2, 0, LINTEL);
    return b.blocks();
  },
});
