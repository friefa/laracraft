import type { Scenario } from '../../lib/api';
import {
  LEVER,
  OBSIDIAN,
  REDSTONE_BLOCK,
  STONE,
  TORCH,
  WIKI,
  air,
  b,
  extended,
  p,
  piston,
  pistonHead,
  place,
  repeater,
  state,
  use,
  type ScenarioBlock,
} from './helpers';

const PISTON = `${WIKI}Piston`;
const STICKY = `${WIKI}Sticky_Piston`;
const QC = `${WIKI}Tutorial:Quasi-connectivity`;

const TIMING =
  'Java: a piston powered during the player-input phase starts 1 gt later (block event in ' +
  'the next tick); powered during the scheduled-tick phase it starts in the same tick. ' +
  'The moving piston block entity advances 0.5 per tick and finalises on the 3rd tick, so ' +
  'the move completes 2 gt after the start.';

/** Piston at (0,0,0) facing east, floor lever south of it at (0,0,1). */
const withLever = (extra: ScenarioBlock[], sticky = false): ScenarioBlock[] => [
  b(p(0, 0, 0), piston('east', sticky)),
  b(p(0, 0, 1), LEVER),
  ...extra,
];
const LEVER_POS = p(0, 0, 1);
const BASE = p(0, 0, 0);
const HEAD = p(1, 0, 0);

const stoneRow = (n: number): ScenarioBlock[] =>
  Array.from({ length: n }, (_, i) => b(p(i + 1, 0, 0), STONE));

/** Anchor block far away so that y=0 is the lowest layer, keeping slime off the ground. */
const ANCHOR = b(p(10, 0, 10), STONE);

/** Pistons: timing, pushing, limits, sticky behaviour, slime/honey, quasi-connectivity. */
export const PISTON_SCENARIOS: readonly Scenario[] = [
  {
    name: 'piston-extends-1gt-after-player-input',
    description: `Lever switched by the player at 0: extended=true at 1, head in place at 3. ${TIMING}`,
    source: PISTON,
    blocks: withLever([]),
    steps: [
      use(0, LEVER_POS),
      extended(0, BASE, false),
      extended(1, BASE, true),
      state(2, HEAD, 'minecraft:moving_piston[facing=east,type=normal]'),
      state(3, HEAD, pistonHead('east')),
    ],
  },
  {
    name: 'piston-0tick-start-from-repeater',
    description:
      `Repeater (delay 1) powers the piston in the scheduled-tick phase of tick 2: the piston ` +
      `extends in the same tick (extended=true at 2) and the head is in place at 4. ${TIMING}`,
    source: PISTON,
    blocks: [
      b(p(-2, 0, 0), LEVER),
      b(p(-1, 0, 0), repeater('west', 1)),
      b(p(0, 0, 0), piston('east')),
    ],
    steps: [
      use(0, p(-2, 0, 0)),
      extended(1, BASE, false),
      extended(2, BASE, true),
      state(4, HEAD, pistonHead('east')),
    ],
  },
  {
    name: 'piston-retracts-in-2gt',
    description:
      'Lever off at 10: the retraction starts at 11 (head removed, base becomes a moving piston) ' +
      'and the base is a plain retracted piston again at 13.',
    source: PISTON,
    blocks: withLever([]),
    steps: [
      use(0, LEVER_POS),
      state(5, HEAD, pistonHead('east')),
      use(10, LEVER_POS),
      state(10, HEAD, pistonHead('east')),
      air(11, HEAD),
      state(11, BASE, 'minecraft:moving_piston[facing=east,type=normal]'),
      state(12, BASE, 'minecraft:moving_piston[facing=east,type=normal]'),
      state(13, BASE, piston('east')),
    ],
  },
  {
    name: 'piston-pushes-block-and-leaves-it',
    description:
      'A normal piston pushes the block in front one block forward (in place at 3) and leaves ' +
      'it there when retracting.',
    source: PISTON,
    blocks: withLever([b(HEAD, STONE)]),
    steps: [
      use(0, LEVER_POS),
      state(3, p(2, 0, 0), STONE),
      state(3, HEAD, pistonHead('east')),
      use(10, LEVER_POS),
      air(13, HEAD),
      state(13, p(2, 0, 0), STONE),
    ],
  },
  {
    name: 'sticky-piston-pulls-block-back',
    description:
      'A sticky piston pulls the block on its head back on retraction: the block leaves (2,0,0) ' +
      'at 11 and is back at (1,0,0) at 13.',
    source: STICKY,
    blocks: withLever([b(HEAD, STONE)], true),
    steps: [
      use(0, LEVER_POS),
      state(5, HEAD, pistonHead('east', true)),
      state(5, p(2, 0, 0), STONE),
      use(10, LEVER_POS),
      air(11, p(2, 0, 0)),
      state(13, HEAD, STONE),
      state(13, BASE, piston('east', true)),
    ],
  },
  {
    name: 'sticky-piston-drops-block-on-1gt-pulse',
    description:
      'A 1 gt pulse (lever on at 0, off at 1): the retraction arrives while the block is still ' +
      'moving (progress < 0.5), so the piston uses event 2 and drops ("spits") the block at the ' +
      'extended position instead of pulling it.',
    source: STICKY,
    blocks: withLever([b(HEAD, STONE)], true),
    steps: [
      use(0, LEVER_POS),
      use(1, LEVER_POS),
      state(10, p(2, 0, 0), STONE),
      air(10, HEAD),
      state(10, BASE, piston('east', true)),
    ],
  },
  {
    name: 'piston-pushes-12-blocks',
    description: 'A piston pushes up to 12 blocks.',
    source: PISTON,
    blocks: withLever(stoneRow(12)),
    steps: [
      use(0, LEVER_POS),
      extended(5, BASE, true),
      state(5, HEAD, pistonHead('east')),
      state(5, p(2, 0, 0), STONE),
      state(5, p(13, 0, 0), STONE),
    ],
  },
  {
    name: 'piston-cannot-push-13-blocks',
    description: 'With 13 blocks in front the push fails and the piston does not extend at all.',
    source: PISTON,
    blocks: withLever(stoneRow(13)),
    steps: [
      use(0, LEVER_POS),
      extended(5, BASE, false),
      state(5, HEAD, STONE),
      air(5, p(14, 0, 0)),
    ],
  },
  {
    name: 'piston-cannot-push-obsidian',
    description: 'Obsidian is immovable: the piston does not extend.',
    source: PISTON,
    blocks: withLever([b(HEAD, OBSIDIAN)]),
    steps: [use(0, LEVER_POS), extended(5, BASE, false), state(5, HEAD, OBSIDIAN)],
  },
  {
    name: 'piston-destroys-torch-in-front',
    description: 'Torches break when pushed (push reaction "destroy"); the head takes their place.',
    source: PISTON,
    blocks: withLever([b(HEAD, TORCH)]),
    steps: [use(0, LEVER_POS), state(3, HEAD, pistonHead('east'))],
  },
  {
    name: 'pushed-block-destroys-carpet',
    description: 'A pushed block breaks a carpet in its way and takes its place.',
    source: PISTON,
    blocks: withLever([b(HEAD, STONE), b(p(2, 0, 0), 'minecraft:white_carpet')]),
    steps: [use(0, LEVER_POS), state(3, p(2, 0, 0), STONE)],
  },
  {
    name: 'slime-block-moves-attached-blocks',
    description:
      'A pushed slime block drags the blocks stuck to its other faces along (here: one beside, ' +
      'one on top). The build floats at y=2 so the slime does not stick to the ground.',
    source: `${WIKI}Slime_Block`,
    blocks: [
      ANCHOR,
      b(p(0, 2, 0), piston('east')),
      b(p(1, 2, 0), 'minecraft:slime_block'),
      b(p(1, 2, 1), STONE),
      b(p(1, 3, 0), STONE),
    ],
    steps: [
      place(0, p(-1, 2, 0), REDSTONE_BLOCK),
      state(5, p(1, 2, 0), pistonHead('east')),
      state(5, p(2, 2, 0), 'minecraft:slime_block'),
      state(5, p(2, 2, 1), STONE),
      state(5, p(2, 3, 0), STONE),
      air(5, p(1, 2, 1)),
      air(5, p(1, 3, 0)),
    ],
  },
  {
    name: 'honey-does-not-stick-to-slime',
    description:
      'Honey drags a stone stuck to it, but honey and slime do not stick to each other: the ' +
      'slime on top of the honey stays behind.',
    source: `${WIKI}Honey_Block`,
    blocks: [
      ANCHOR,
      b(p(0, 2, 0), piston('east')),
      b(p(1, 2, 0), 'minecraft:honey_block'),
      b(p(1, 2, 1), STONE),
      b(p(1, 3, 0), 'minecraft:slime_block'),
    ],
    steps: [
      place(0, p(-1, 2, 0), REDSTONE_BLOCK),
      state(5, p(2, 2, 0), 'minecraft:honey_block'),
      state(5, p(2, 2, 1), STONE),
      state(5, p(1, 3, 0), 'minecraft:slime_block'),
      air(5, p(2, 3, 0)),
    ],
  },
  {
    name: 'quasi-connectivity-bud-piston',
    description:
      'Java quasi-connectivity: a piston also checks power at the space above it. A block of ' +
      'redstone placed diagonally above powers that space but sends no update to the piston, ' +
      'so it stays retracted (BUD state) until a neighbour update (stone placed beside it at ' +
      '10) makes it extend at 11.',
    source: QC,
    blocks: [b(BASE, piston('south'))],
    steps: [
      place(0, p(1, 1, 0), REDSTONE_BLOCK),
      extended(5, BASE, false),
      place(10, p(-1, 0, 0), STONE),
      extended(11, BASE, true),
      state(13, p(0, 0, 1), pistonHead('south')),
    ],
  },
  {
    name: 'piston-not-powered-through-its-front',
    description:
      'A piston ignores power from the block at its head side (getNeighborSignal skips the ' +
      'facing direction): a block of redstone in front does not extend it.',
    source: PISTON,
    blocks: [b(BASE, piston('east'))],
    steps: [
      place(0, HEAD, REDSTONE_BLOCK),
      extended(5, BASE, false),
      state(5, HEAD, REDSTONE_BLOCK),
    ],
  },
];
