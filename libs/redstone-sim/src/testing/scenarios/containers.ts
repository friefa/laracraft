import type { Scenario } from '../../lib/api';
import {
  CHEST,
  LEVER,
  REDSTONE_BLOCK,
  STONE,
  WIKI,
  b,
  dropper,
  hopper,
  insert,
  items,
  p,
  place,
  props,
  use,
} from './helpers';

const HOPPER = `${WIKI}Hopper`;

const INSERT_NOTE =
  '`insert-items` models a player putting items in through the GUI, which (unlike a hopper ' +
  'pushing into an empty hopper) does not start a transfer cooldown.';

/** Dropper (0,0,0) facing east into a chest (1,0,0), floor lever (0,0,1). */
const dropperIntoChest = () => [
  b(p(0, 0, 0), dropper('east')),
  b(p(1, 0, 0), CHEST),
  b(p(0, 0, 1), LEVER),
];

/** Dispensers, droppers and hoppers. */
export const CONTAINER_SCENARIOS: readonly Scenario[] = [
  {
    name: 'dropper-fires-4gt-after-power-into-chest',
    description:
      'A dropper sets triggered=true when powered and moves one item into the container it ' +
      'faces 4 gt later (scheduled tick of 4).',
    source: `${WIKI}Dropper`,
    blocks: dropperIntoChest(),
    steps: [
      insert(0, p(0, 0, 0), 3),
      use(1, p(0, 0, 1)),
      props(1, p(0, 0, 0), { triggered: 'true' }),
      items(4, p(1, 0, 0), 0),
      items(4, p(0, 0, 0), 3),
      items(5, p(1, 0, 0), 1),
      items(5, p(0, 0, 0), 2),
    ],
  },
  {
    name: 'dropper-fires-only-on-rising-edge',
    description:
      'Staying powered does not fire again; only a new rising edge does (off at 40, on at 50 ' +
      '-> second item at 54).',
    source: `${WIKI}Dropper`,
    blocks: dropperIntoChest(),
    steps: [
      insert(0, p(0, 0, 0), 3),
      use(0, p(0, 0, 1)),
      items(30, p(1, 0, 0), 1),
      use(40, p(0, 0, 1)),
      props(40, p(0, 0, 0), { triggered: 'false' }),
      use(50, p(0, 0, 1)),
      items(53, p(1, 0, 0), 1),
      items(54, p(1, 0, 0), 2),
      items(54, p(0, 0, 0), 1),
    ],
  },
  {
    name: 'dispenser-ejects-item-after-4gt',
    description:
      'A dispenser with plain items (cobblestone) drops one as an item entity 4 gt after being ' +
      'powered.',
    source: `${WIKI}Dispenser`,
    blocks: [b(p(0, 0, 0), dropper('east', 'dispenser')), b(p(0, 0, 1), LEVER)],
    steps: [
      insert(0, p(0, 0, 0), 2),
      use(1, p(0, 0, 1)),
      items(4, p(0, 0, 0), 2),
      items(5, p(0, 0, 0), 1),
    ],
  },
  {
    name: 'dropper-quasi-connectivity',
    description:
      'Java quasi-connectivity: a dropper is also activated by power at the space above it, but ' +
      'only when it receives an update. A block of redstone two above does not update it; a ' +
      'stone placed beside it at 10 does, so it fires at 14.',
    source: `${WIKI}Tutorial:Quasi-connectivity`,
    blocks: [b(p(0, 0, 0), dropper('east')), b(p(1, 0, 0), CHEST)],
    steps: [
      insert(0, p(0, 0, 0), 1),
      place(1, p(0, 2, 0), REDSTONE_BLOCK),
      props(6, p(0, 0, 0), { triggered: 'false' }),
      items(6, p(1, 0, 0), 0),
      place(10, p(-1, 0, 0), STONE),
      props(10, p(0, 0, 0), { triggered: 'true' }),
      items(13, p(1, 0, 0), 0),
      items(14, p(1, 0, 0), 1),
    ],
  },
  {
    name: 'hopper-moves-one-item-per-8gt',
    description:
      'A hopper pushes one item per transfer and then waits 8 gt (cooldown 8): pushes at 1, 9, ' +
      `17, 25, 33. ${INSERT_NOTE}`,
    source: HOPPER,
    blocks: [b(p(0, 0, 0), CHEST), b(p(0, 1, 0), hopper('down'))],
    steps: [
      insert(0, p(0, 1, 0), 5),
      items(1, p(0, 0, 0), 1),
      items(8, p(0, 0, 0), 1),
      items(9, p(0, 0, 0), 2),
      items(16, p(0, 0, 0), 2),
      items(17, p(0, 0, 0), 3),
      items(33, p(0, 0, 0), 5),
      items(33, p(0, 1, 0), 0),
    ],
  },
  {
    name: 'hopper-locked-by-redstone',
    description:
      'A powered hopper is disabled at once (enabled=false) and moves nothing; after the power ' +
      `is removed it transfers on the next tick (no cooldown was running). ${INSERT_NOTE}`,
    source: HOPPER,
    blocks: [
      b(p(0, 0, 0), CHEST),
      b(p(0, 1, 0), hopper('down')),
      b(p(1, 0, 0), STONE),
      b(p(1, 1, 0), LEVER),
    ],
    steps: [
      use(0, p(1, 1, 0)),
      props(0, p(0, 1, 0), { enabled: 'false' }),
      insert(1, p(0, 1, 0), 5),
      items(20, p(0, 0, 0), 0),
      items(20, p(0, 1, 0), 5),
      use(30, p(1, 1, 0)),
      props(30, p(0, 1, 0), { enabled: 'true' }),
      items(30, p(0, 0, 0), 0),
      items(31, p(0, 0, 0), 1),
    ],
  },
  {
    name: 'hopper-pulls-from-container-above',
    description: `A hopper pulls one item per 8 gt from the chest above it. ${INSERT_NOTE}`,
    source: HOPPER,
    blocks: [b(p(0, 0, 0), hopper('down')), b(p(0, 1, 0), CHEST)],
    steps: [
      insert(0, p(0, 1, 0), 3),
      items(1, p(0, 0, 0), 1),
      items(8, p(0, 0, 0), 1),
      items(9, p(0, 0, 0), 2),
      items(17, p(0, 0, 0), 3),
      items(17, p(0, 1, 0), 0),
    ],
  },
];
