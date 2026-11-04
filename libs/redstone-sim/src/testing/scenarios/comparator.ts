import type { Scenario } from '../../lib/api';
import {
  CHEST,
  LEVER,
  REDSTONE_BLOCK,
  STONE,
  WIKI,
  WIRE_EW,
  WIRE_NS,
  b,
  comparator,
  dropper,
  dustPower,
  hopper,
  insert,
  items,
  on,
  p,
  place,
  props,
  use,
} from './helpers';

const COMPARATOR = `${WIKI}Redstone_Comparator`;

const FORMULA =
  'Java formula (AbstractContainerMenu.getRedstoneSignalFromContainer): ' +
  'f = sum(count / maxStack) / slots; signal = floor(f * 14) + (any items ? 1 : 0).';

/** Container at (0,0,0), comparator (1,0,0) reading it (facing west), dust (2,0,0). */
const reader = (container: string) => [
  b(p(0, 0, 0), container),
  b(p(1, 0, 0), comparator('west')),
  b(p(2, 0, 0), WIRE_EW),
];

/** Comparators: delay, compare/subtract, side inputs, container reading. */
export const COMPARATOR_SCENARIOS: readonly Scenario[] = [
  {
    name: 'comparator-passes-rear-signal-after-2gt',
    description:
      'In compare mode without side input a comparator outputs its rear signal (15 from a ' +
      'lever) after 2 gt, and drops it 2 gt after the input goes away.',
    source: COMPARATOR,
    blocks: [b(p(0, 0, 0), LEVER), b(p(1, 0, 0), comparator('west')), b(p(2, 0, 0), WIRE_EW)],
    steps: [
      use(0, p(0, 0, 0)),
      dustPower(1, p(2, 0, 0), 0),
      dustPower(2, p(2, 0, 0), 15),
      on(2, p(1, 0, 0), true),
      use(10, p(0, 0, 0)),
      dustPower(11, p(2, 0, 0), 15),
      dustPower(12, p(2, 0, 0), 0),
      on(12, p(1, 0, 0), false),
    ],
  },
  {
    name: 'comparator-compare-mode-side-greater-turns-off',
    description:
      'Rear input 13 (third dust from a lever), output 13. A side input of 15 (dust) is greater ' +
      'than the rear, so compare mode outputs 0 two gt later.',
    source: COMPARATOR,
    blocks: [
      b(p(-4, 0, 0), LEVER),
      b(p(-3, 0, 0), WIRE_EW),
      b(p(-2, 0, 0), WIRE_EW),
      b(p(-1, 0, 0), WIRE_EW),
      b(p(0, 0, 0), comparator('west')),
      b(p(1, 0, 0), WIRE_EW),
      b(p(0, 0, 1), WIRE_NS),
      b(p(0, 0, 2), LEVER),
    ],
    steps: [
      use(0, p(-4, 0, 0)),
      dustPower(0, p(-1, 0, 0), 13),
      dustPower(2, p(1, 0, 0), 13),
      use(10, p(0, 0, 2)),
      dustPower(10, p(0, 0, 1), 15),
      dustPower(11, p(1, 0, 0), 13),
      dustPower(12, p(1, 0, 0), 0),
      on(12, p(0, 0, 0), false),
    ],
  },
  {
    name: 'comparator-equal-side-keeps-compare-output-subtract-clears-it',
    description:
      'A block of redstone beside a comparator is a side input of 15. Equal to the rear (15) ' +
      'is not greater, so compare mode keeps 15. Switching to subtract mode by use refreshes ' +
      'the output immediately (ComparatorBlock.useWithoutItem calls refreshOutputState): 15-15=0.',
    source: COMPARATOR,
    blocks: [b(p(0, 0, 0), LEVER), b(p(1, 0, 0), comparator('west')), b(p(2, 0, 0), WIRE_EW)],
    steps: [
      use(0, p(0, 0, 0)),
      dustPower(2, p(2, 0, 0), 15),
      place(10, p(1, 0, 1), REDSTONE_BLOCK),
      dustPower(15, p(2, 0, 0), 15),
      use(20, p(1, 0, 0)),
      props(20, p(1, 0, 0), { mode: 'subtract' }),
      dustPower(20, p(2, 0, 0), 0),
    ],
  },
  {
    name: 'comparator-subtract-mode',
    description:
      'Subtract mode: rear 15 minus side 13 (third dust from a lever) = 2. Switching back to ' +
      'compare mode by use outputs 15 immediately.',
    source: COMPARATOR,
    blocks: [
      b(p(-1, 0, 0), LEVER),
      b(p(0, 0, 0), comparator('west', 'subtract')),
      b(p(1, 0, 0), WIRE_EW),
      b(p(0, 0, 1), WIRE_NS),
      b(p(0, 0, 2), WIRE_NS),
      b(p(0, 0, 3), WIRE_NS),
      b(p(0, 0, 4), LEVER),
    ],
    steps: [
      use(0, p(-1, 0, 0)),
      dustPower(2, p(1, 0, 0), 15),
      use(10, p(0, 0, 4)),
      dustPower(10, p(0, 0, 1), 13),
      dustPower(11, p(1, 0, 0), 15),
      dustPower(12, p(1, 0, 0), 2),
      on(12, p(0, 0, 0), true),
      use(20, p(0, 0, 0)),
      props(20, p(0, 0, 0), { mode: 'compare' }),
      dustPower(20, p(1, 0, 0), 15),
    ],
  },
  {
    name: 'comparator-side-ignores-plain-lever',
    description:
      'Side inputs only count redstone blocks, dust, and components that strongly power the ' +
      'comparator (SignalGetter.getControlInputSignal). A floor lever beside it only strongly ' +
      'powers the block below, so subtract mode keeps outputting 15.',
    source: COMPARATOR,
    blocks: [
      b(p(0, 0, 0), LEVER),
      b(p(1, 0, 0), comparator('west', 'subtract')),
      b(p(2, 0, 0), WIRE_EW),
      b(p(1, 0, 1), LEVER),
    ],
    steps: [
      use(0, p(0, 0, 0)),
      dustPower(2, p(2, 0, 0), 15),
      use(10, p(1, 0, 1)),
      dustPower(12, p(2, 0, 0), 15),
      dustPower(15, p(2, 0, 0), 15),
    ],
  },
  {
    name: 'comparator-reads-hopper-fill-level',
    description:
      `Hopper (5 slots): 1 item -> 1, 22 items -> 1, 23 items -> 2 (23/64/5*14 = 1.006). ` +
      `Container changes reach the comparator via a neighbour update; it switches 2 gt later. ` +
      FORMULA,
    source: COMPARATOR,
    blocks: reader(hopper('down')),
    steps: [
      insert(0, p(0, 0, 0), 1),
      dustPower(1, p(2, 0, 0), 0),
      dustPower(2, p(2, 0, 0), 1),
      insert(10, p(0, 0, 0), 21),
      items(15, p(0, 0, 0), 22),
      dustPower(15, p(2, 0, 0), 1),
      insert(20, p(0, 0, 0), 1),
      dustPower(21, p(2, 0, 0), 1),
      dustPower(22, p(2, 0, 0), 2),
      items(22, p(0, 0, 0), 23),
    ],
  },
  {
    name: 'comparator-reads-full-hopper-as-15',
    description: `A full hopper (5 x 64) gives 15. ${FORMULA}`,
    source: COMPARATOR,
    blocks: reader(hopper('down')),
    steps: [insert(0, p(0, 0, 0), 320), dustPower(2, p(2, 0, 0), 15), items(2, p(0, 0, 0), 320)],
  },
  {
    name: 'comparator-reads-chest-fill-level',
    description: `Chest (27 slots): 123 items -> 1, 124 items -> 2 (124/64/27*14 = 1.0046). ${FORMULA}`,
    source: COMPARATOR,
    blocks: reader(CHEST),
    steps: [
      insert(0, p(0, 0, 0), 123),
      dustPower(2, p(2, 0, 0), 1),
      insert(10, p(0, 0, 0), 1),
      dustPower(11, p(2, 0, 0), 1),
      dustPower(12, p(2, 0, 0), 2),
    ],
  },
  {
    name: 'comparator-reads-dropper-300-items-as-8',
    description: `Dropper (9 slots) with 300 items -> 8 (the wiki example). ${FORMULA}`,
    source: COMPARATOR,
    blocks: reader(dropper('up')),
    steps: [insert(0, p(0, 0, 0), 300), dustPower(2, p(2, 0, 0), 8)],
  },
  {
    name: 'comparator-reads-container-through-solid-block',
    description:
      `A comparator reads a container behind one conductive block: hopper with 64 items -> 3 ` +
      `(64/64/5*14 = 2.8). ${FORMULA}`,
    source: COMPARATOR,
    blocks: [
      b(p(0, 0, 0), hopper('down')),
      b(p(1, 0, 0), STONE),
      b(p(2, 0, 0), comparator('west')),
      b(p(3, 0, 0), WIRE_EW),
    ],
    steps: [insert(0, p(0, 0, 0), 64), dustPower(1, p(3, 0, 0), 0), dustPower(2, p(3, 0, 0), 3)],
  },
];
