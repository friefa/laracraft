import type { Scenario } from '../../lib/api';
import {
  CROSS,
  LAMP,
  LEVER,
  STONE,
  WIKI,
  b,
  dustPower,
  lit,
  observer,
  on,
  p,
  place,
  use,
} from './helpers';

const OBSERVER = `${WIKI}Observer`;

/** Observers: detection, 2 gt delay, 2 gt pulse, strong output, no self-trigger. */
export const OBSERVER_SCENARIOS: readonly Scenario[] = [
  {
    name: 'observer-pulse-on-block-placed',
    description:
      'An observer detects a block placed in front of it (shape update), turns on 2 gt later ' +
      'and off after a 2 gt pulse (ObserverBlock.tick schedules 2 gt each). The lamp at its ' +
      'back lights at 2 and goes out 4 gt after the pulse ends.',
    source: OBSERVER,
    blocks: [b(p(0, 0, 0), observer('west')), b(p(1, 0, 0), LAMP)],
    steps: [
      place(0, p(-1, 0, 0), STONE),
      on(1, p(0, 0, 0), false),
      on(2, p(0, 0, 0), true),
      lit(2, p(1, 0, 0), true),
      on(3, p(0, 0, 0), true),
      on(4, p(0, 0, 0), false),
      lit(7, p(1, 0, 0), true),
      lit(8, p(1, 0, 0), false),
    ],
  },
  {
    name: 'observer-strongly-powers-block-behind',
    description: 'The observer output strongly powers the block at its back (dust beside it: 15).',
    source: OBSERVER,
    blocks: [b(p(0, 0, 0), observer('west')), b(p(1, 0, 0), STONE), b(p(2, 0, 0), CROSS)],
    steps: [
      place(0, p(-1, 0, 0), STONE),
      dustPower(1, p(2, 0, 0), 0),
      dustPower(2, p(2, 0, 0), 15),
      dustPower(4, p(2, 0, 0), 0),
    ],
  },
  {
    name: 'observer-detects-state-change',
    description:
      'An observer facing a lever fires on each lever toggle (state change), each time a 2 gt ' +
      'pulse starting 2 gt after the change. Redstone power from the lever itself is ignored.',
    source: OBSERVER,
    blocks: [b(p(0, 0, -1), LEVER), b(p(0, 0, 0), observer('north')), b(p(0, 0, 1), LAMP)],
    steps: [
      use(0, p(0, 0, -1)),
      on(2, p(0, 0, 0), true),
      on(4, p(0, 0, 0), false),
      use(10, p(0, 0, -1)),
      on(11, p(0, 0, 0), false),
      on(12, p(0, 0, 0), true),
      on(14, p(0, 0, 0), false),
    ],
  },
  {
    name: 'observer-does-not-fire-on-own-placement',
    description:
      'Since Java 1.13 an observer placed by a player does not pulse (it only reacts to changes ' +
      'of the watched block).',
    source: OBSERVER,
    blocks: [b(p(-1, 0, 0), STONE), b(p(1, 0, 0), LAMP)],
    steps: [
      place(0, p(0, 0, 0), observer('west')),
      on(2, p(0, 0, 0), false),
      lit(2, p(1, 0, 0), false),
      on(3, p(0, 0, 0), false),
      lit(5, p(1, 0, 0), false),
    ],
  },
  {
    name: 'observer-ignores-redstone-power',
    description:
      'An observer is not a redstone input: a lever switched on beside it causes no pulse ' +
      '(only the watched face matters).',
    source: OBSERVER,
    blocks: [b(p(-1, 0, 0), LEVER), b(p(0, 0, 0), observer('north')), b(p(0, 0, 1), LAMP)],
    steps: [
      use(0, p(-1, 0, 0)),
      on(2, p(0, 0, 0), false),
      on(4, p(0, 0, 0), false),
      lit(4, p(0, 0, 1), false),
    ],
  },
  {
    name: 'observer-watching-observer',
    description:
      'Observer B watches observer A. A pulses 2..4; B sees A turn on at 2 and pulses 4..6. ' +
      "A turning off at 4 does not schedule a second pulse because B's tick for 4/6 is " +
      'already scheduled (startSignal only schedules when no tick is pending).',
    source: OBSERVER,
    blocks: [
      b(p(0, 0, 0), observer('west')),
      b(p(0, 0, 1), observer('north')),
      b(p(0, 0, 2), LAMP),
    ],
    steps: [
      place(0, p(-1, 0, 0), STONE),
      on(2, p(0, 0, 0), true),
      on(3, p(0, 0, 1), false),
      on(4, p(0, 0, 1), true),
      on(4, p(0, 0, 0), false),
      on(5, p(0, 0, 1), true),
      on(6, p(0, 0, 1), false),
      on(8, p(0, 0, 1), false),
      lit(9, p(0, 0, 2), true),
      lit(10, p(0, 0, 2), false),
    ],
  },
];
