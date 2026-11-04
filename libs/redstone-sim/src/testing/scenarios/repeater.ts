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
  on,
  p,
  props,
  repeater,
  use,
} from './helpers';

const REPEATER = `${WIKI}Redstone_Repeater`;

/** lever (0,0,0) -> repeater (1,0,0) facing west (input west, output east) -> lamp (2,0,0). */
const basic = (delay: number) => [
  b(p(0, 0, 0), LEVER),
  b(p(1, 0, 0), repeater('west', delay)),
  b(p(2, 0, 0), LAMP),
];

const delayScenario = (delay: 1 | 2 | 3 | 4): Scenario => {
  const d = delay * 2;
  return {
    name: `repeater-delay-${delay}-is-${d}gt`,
    description:
      `A repeater with delay ${delay} (redstone ticks) switches ${d} gt after its input ` +
      `changes, both on and off. The lamp turns on with the repeater and off 4 gt after it.`,
    source: REPEATER,
    blocks: basic(delay),
    steps: [
      use(0, p(0, 0, 0)),
      on(d - 1, p(1, 0, 0), false),
      lit(d - 1, p(2, 0, 0), false),
      on(d, p(1, 0, 0), true),
      lit(d, p(2, 0, 0), true),
      use(20, p(0, 0, 0)),
      on(20 + d - 1, p(1, 0, 0), true),
      on(20 + d, p(1, 0, 0), false),
      lit(20 + d + 3, p(2, 0, 0), true),
      lit(20 + d + 4, p(2, 0, 0), false),
    ],
  };
};

/**
 * Locking layout: main repeater A (1,0,0) facing west fed by lever L1 (0,0,0), lamp (2,0,0);
 * side repeater B (1,0,1) facing south (input from lever L2 at (1,0,2), output into A's side).
 */
const lockLayout = () => [
  b(p(0, 0, 0), LEVER),
  b(p(1, 0, 0), repeater('west', 1)),
  b(p(2, 0, 0), LAMP),
  b(p(1, 0, 1), repeater('south', 1)),
  b(p(1, 0, 2), LEVER),
];
const L1 = p(0, 0, 0);
const A = p(1, 0, 0);
const OUT = p(2, 0, 0);
const B = p(1, 0, 1);
const L2 = p(1, 0, 2);

/** Repeaters: delays, strong output, pulse shaping, locking. */
export const REPEATER_SCENARIOS: readonly Scenario[] = [
  delayScenario(1),
  delayScenario(2),
  delayScenario(3),
  delayScenario(4),
  {
    name: 'repeater-strongly-powers-front-only',
    description:
      'A repeater strongly powers the block in front (dust beside that block gets 15) and ' +
      'outputs nothing to its sides (lamp beside the repeater stays off).',
    source: REPEATER,
    blocks: [
      b(p(0, 0, 0), LEVER),
      b(p(1, 0, 0), repeater('west', 1)),
      b(p(2, 0, 0), STONE),
      b(p(3, 0, 0), CROSS),
      b(p(1, 0, 1), LAMP),
    ],
    steps: [
      use(0, p(0, 0, 0)),
      dustPower(1, p(3, 0, 0), 0),
      dustPower(2, p(3, 0, 0), 15),
      lit(5, p(1, 0, 1), false),
    ],
  },
  {
    name: 'repeater-extends-short-pulse-to-its-delay',
    description:
      'A 1 gt input pulse into a delay-4 repeater: it turns on at 8 and, because the input is ' +
      'already off, schedules its turn-off another 8 gt later (DiodeBlock.tick), so the output ' +
      'is an 8 gt pulse from 8 to 16.',
    source: REPEATER,
    blocks: basic(4),
    steps: [
      use(0, p(0, 0, 0)),
      use(1, p(0, 0, 0)),
      on(7, p(1, 0, 0), false),
      on(8, p(1, 0, 0), true),
      on(15, p(1, 0, 0), true),
      on(16, p(1, 0, 0), false),
      lit(19, p(2, 0, 0), true),
      lit(20, p(2, 0, 0), false),
    ],
  },
  {
    name: 'repeater-delay-1-passes-1gt-pulse-as-2gt',
    description: 'A 1 gt pulse through a delay-1 repeater becomes a 2 gt pulse (on 2, off 4).',
    source: REPEATER,
    blocks: basic(1),
    steps: [
      use(0, p(0, 0, 0)),
      use(1, p(0, 0, 0)),
      on(1, p(1, 0, 0), false),
      on(2, p(1, 0, 0), true),
      on(3, p(1, 0, 0), true),
      on(4, p(1, 0, 0), false),
    ],
  },
  {
    name: 'repeater-suppresses-short-off-pulse',
    description:
      'A 1 gt off-pulse shorter than the delay is swallowed: the turn-off tick at 28 finds the ' +
      'input on again and the delay-4 repeater stays on.',
    source: REPEATER,
    blocks: basic(4),
    steps: [
      use(0, p(0, 0, 0)),
      on(8, p(1, 0, 0), true),
      use(20, p(0, 0, 0)),
      use(21, p(0, 0, 0)),
      on(28, p(1, 0, 0), true),
      on(35, p(1, 0, 0), true),
      lit(35, p(2, 0, 0), true),
    ],
  },
  {
    name: 'repeater-locked-by-side-repeater',
    description:
      'A powered repeater facing into the side of another repeater locks it in the same tick ' +
      '(locked=true via shape update). A locked unpowered repeater ignores its input; when ' +
      'unlocked it re-checks and turns on one delay (2 gt) later.',
    source: REPEATER,
    blocks: lockLayout(),
    steps: [
      use(0, L2),
      props(1, A, { locked: 'false' }),
      on(2, B, true),
      props(2, A, { locked: 'true' }),
      use(10, L1),
      on(12, A, false),
      on(25, A, false),
      lit(25, OUT, false),
      use(30, L2),
      on(32, B, false),
      props(32, A, { locked: 'false' }),
      on(33, A, false),
      on(34, A, true),
      lit(34, OUT, true),
    ],
  },
  {
    name: 'locked-repeater-holds-its-output',
    description:
      'A repeater locked while on stays on even after its input turns off; after unlocking it ' +
      'turns off one delay (2 gt) later.',
    source: REPEATER,
    blocks: lockLayout(),
    steps: [
      use(0, L1),
      on(2, A, true),
      use(10, L2),
      props(12, A, { locked: 'true' }),
      use(20, L1),
      on(25, A, true),
      lit(29, OUT, true),
      use(30, L2),
      on(32, B, false),
      on(33, A, true),
      on(34, A, false),
      lit(37, OUT, true),
      lit(38, OUT, false),
    ],
  },
  {
    name: 'repeater-chain-delays-add-up',
    description: 'Delay 1 (2 gt) followed by delay 4 (8 gt): the second repeater turns on at 10.',
    source: REPEATER,
    blocks: [
      b(p(0, 0, 0), LEVER),
      b(p(1, 0, 0), repeater('west', 1)),
      b(p(2, 0, 0), repeater('west', 4)),
      b(p(3, 0, 0), LAMP),
    ],
    steps: [
      use(0, p(0, 0, 0)),
      on(2, p(1, 0, 0), true),
      on(9, p(2, 0, 0), false),
      on(10, p(2, 0, 0), true),
      lit(10, p(3, 0, 0), true),
    ],
  },
  {
    name: 'repeater-delay-cycles-on-use',
    description:
      'Using a repeater cycles its delay 1 -> 2 -> 3 -> 4 -> 1. The new delay applies: delay 2 ' +
      'turns on 4 gt after the input.',
    source: REPEATER,
    blocks: basic(1),
    steps: [
      use(0, p(1, 0, 0)),
      props(0, p(1, 0, 0), { delay: '2' }),
      use(1, p(1, 0, 0)),
      props(1, p(1, 0, 0), { delay: '3' }),
      use(2, p(1, 0, 0)),
      props(2, p(1, 0, 0), { delay: '4' }),
      use(3, p(1, 0, 0)),
      props(3, p(1, 0, 0), { delay: '1' }),
      use(4, p(1, 0, 0)),
      props(4, p(1, 0, 0), { delay: '2' }),
      use(10, p(0, 0, 0)),
      on(13, p(1, 0, 0), false),
      on(14, p(1, 0, 0), true),
    ],
  },
];
