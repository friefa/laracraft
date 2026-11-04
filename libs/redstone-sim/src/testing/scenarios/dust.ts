import type { Scenario, ScenarioStep } from '../../lib/api';
import {
  CROSS,
  GLASS,
  LAMP,
  LEVER,
  REDSTONE_BLOCK,
  STONE,
  WIKI,
  WIRE_EW,
  WIRE_NS,
  b,
  dustPower,
  lit,
  on,
  p,
  place,
  props,
  repeater,
  use,
  wallLever,
  wire,
  type ScenarioBlock,
} from './helpers';

const DUST = `${WIKI}Redstone_Dust`;

const decayLine = (): ScenarioBlock[] => {
  const blocks: ScenarioBlock[] = [b(p(0, 0, 0), LEVER)];
  for (let x = 1; x <= 16; x++) blocks.push(b(p(x, 0, 0), WIRE_EW));
  blocks.push(b(p(17, 0, 0), LAMP));
  return blocks;
};

const decaySteps = (): ScenarioStep[] => [
  use(0, p(0, 0, 0)),
  dustPower(0, p(1, 0, 0), 15),
  dustPower(0, p(2, 0, 0), 14),
  dustPower(0, p(8, 0, 0), 8),
  dustPower(0, p(15, 0, 0), 1),
  dustPower(0, p(16, 0, 0), 0),
  lit(0, p(17, 0, 0), false),
  lit(5, p(17, 0, 0), false),
  use(10, p(0, 0, 0)),
  dustPower(10, p(1, 0, 0), 0),
  dustPower(10, p(15, 0, 0), 0),
];

/** Redstone dust: decay, strong/weak power, conductors, shapes, climbing. */
export const DUST_SCENARIOS: readonly Scenario[] = [
  {
    name: 'dust-decays-one-per-block',
    description:
      'Dust loses 1 power per block: 15 next to the lever, 1 at the 15th dust, 0 at the 16th; ' +
      'the lamp after the 16th dust stays off. Dust updates are instant (0 gt).',
    source: DUST,
    blocks: decayLine(),
    steps: decaySteps(),
  },
  {
    name: 'dust-weakly-powers-block-it-points-into',
    description:
      'Dust pointing into an opaque block weakly powers it: a lamp next to that block lights, ' +
      'but dust next to that block gets nothing (weak power does not reach dust).',
    source: `${WIKI}Redstone_mechanics`,
    blocks: [
      b(p(0, 0, 0), LEVER),
      b(p(1, 0, 0), WIRE_EW),
      b(p(2, 0, 0), STONE),
      b(p(3, 0, 0), LAMP),
      b(p(2, 0, 1), CROSS),
    ],
    steps: [
      use(0, p(0, 0, 0)),
      dustPower(0, p(1, 0, 0), 15),
      lit(0, p(3, 0, 0), true),
      dustPower(0, p(2, 0, 1), 0),
      dustPower(5, p(2, 0, 1), 0),
    ],
  },
  {
    name: 'dust-line-passing-a-block-does-not-power-it',
    description:
      'An east-west dust line does not point south, so the block south of it stays unpowered ' +
      'and the lamp behind that block stays off.',
    source: DUST,
    blocks: [
      b(p(0, 0, 0), LEVER),
      b(p(1, 0, 0), WIRE_EW),
      b(p(2, 0, 0), WIRE_EW),
      b(p(1, 0, 1), STONE),
      b(p(1, 0, 2), LAMP),
    ],
    steps: [
      use(0, p(0, 0, 0)),
      dustPower(0, p(2, 0, 0), 14),
      lit(0, p(1, 0, 2), false),
      lit(5, p(1, 0, 2), false),
    ],
  },
  {
    name: 'glass-does-not-conduct',
    description:
      'Glass is transparent (not a redstone conductor): dust pointing into glass does not ' +
      'power the lamp behind it.',
    source: `${WIKI}Redstone_mechanics`,
    blocks: [
      b(p(0, 0, 0), LEVER),
      b(p(1, 0, 0), WIRE_EW),
      b(p(2, 0, 0), GLASS),
      b(p(3, 0, 0), LAMP),
    ],
    steps: [
      use(0, p(0, 0, 0)),
      dustPower(0, p(1, 0, 0), 15),
      lit(0, p(3, 0, 0), false),
      lit(5, p(3, 0, 0), false),
    ],
  },
  {
    name: 'dust-cross-powers-sides-dot-does-not',
    description:
      'Unconnected dust is a cross and powers all four sides (lamps east and south light). ' +
      'Using it turns it into a dot, which only powers the block below: the lamps go out 4 gt ' +
      'later while the dust keeps power 15 from the strongly powered block under it.',
    source: DUST,
    blocks: [
      b(p(0, 0, 0), STONE),
      b(p(-1, 0, 0), wallLever('west')),
      b(p(0, 1, 0), CROSS),
      b(p(1, 1, 0), LAMP),
      b(p(0, 1, 1), LAMP),
    ],
    steps: [
      use(0, p(-1, 0, 0)),
      dustPower(0, p(0, 1, 0), 15),
      lit(0, p(1, 1, 0), true),
      lit(0, p(0, 1, 1), true),
      use(10, p(0, 1, 0)),
      props(10, p(0, 1, 0), { north: 'none', east: 'none', south: 'none', west: 'none' }),
      lit(13, p(1, 1, 0), true),
      lit(14, p(1, 1, 0), false),
      lit(14, p(0, 1, 1), false),
      dustPower(14, p(0, 1, 0), 15),
    ],
  },
  {
    name: 'dust-with-one-connection-is-a-line',
    description:
      'Dust connected only to a lever in the north becomes a north-south line (Java 1.16+): it ' +
      'powers the lamp to the south but not the lamp to the east.',
    source: DUST,
    blocks: [
      b(p(0, 0, -1), LEVER),
      b(p(0, 0, 0), WIRE_NS),
      b(p(0, 0, 1), LAMP),
      b(p(1, 0, 0), LAMP),
    ],
    steps: [
      use(0, p(0, 0, -1)),
      lit(0, p(0, 0, 1), true),
      lit(0, p(1, 0, 0), false),
      lit(5, p(1, 0, 0), false),
    ],
  },
  {
    name: 'dust-climbs-a-block',
    description:
      'Dust runs up the side of a block onto its top (east=up) and loses 1 power per dust as ' +
      'usual.',
    source: DUST,
    blocks: [
      b(p(0, 0, 0), LEVER),
      b(p(1, 0, 0), wire({ w: 'side', e: 'up' })),
      b(p(2, 0, 0), STONE),
      b(p(2, 1, 0), WIRE_EW),
    ],
    steps: [use(0, p(0, 0, 0)), dustPower(0, p(1, 0, 0), 15), dustPower(0, p(2, 1, 0), 14)],
  },
  {
    name: 'opaque-block-above-cuts-dust-climb',
    description:
      'An opaque (conductive) block above the lower dust cuts the diagonal connection: the ' +
      'upper dust stays unconnected (cross) and unpowered.',
    source: DUST,
    blocks: [
      b(p(0, 0, 0), LEVER),
      b(p(1, 0, 0), WIRE_EW),
      b(p(1, 1, 0), STONE),
      b(p(2, 0, 0), STONE),
      b(p(2, 1, 0), CROSS),
    ],
    steps: [
      use(0, p(0, 0, 0)),
      dustPower(0, p(1, 0, 0), 15),
      dustPower(0, p(2, 1, 0), 0),
      dustPower(5, p(2, 1, 0), 0),
    ],
  },
  {
    name: 'glass-above-does-not-cut-dust-climb',
    description: 'A transparent block (glass) above the lower dust does not cut the climb.',
    source: DUST,
    blocks: [
      b(p(0, 0, 0), LEVER),
      b(p(1, 0, 0), wire({ w: 'side', e: 'up' })),
      b(p(1, 1, 0), GLASS),
      b(p(2, 0, 0), STONE),
      b(p(2, 1, 0), WIRE_EW),
    ],
    steps: [use(0, p(0, 0, 0)), dustPower(0, p(2, 1, 0), 14)],
  },
  {
    name: 'weakly-powered-block-powers-repeater',
    description:
      'A block weakly powered by dust still powers a repeater behind it (repeaters read ' +
      'weakly powered blocks); repeater delay 1 = 2 gt.',
    source: `${WIKI}Redstone_Repeater`,
    blocks: [
      b(p(0, 0, 0), LEVER),
      b(p(1, 0, 0), WIRE_EW),
      b(p(2, 0, 0), STONE),
      b(p(3, 0, 0), repeater('west', 1)),
      b(p(4, 0, 0), LAMP),
    ],
    steps: [
      use(0, p(0, 0, 0)),
      on(1, p(3, 0, 0), false),
      lit(1, p(4, 0, 0), false),
      on(2, p(3, 0, 0), true),
      lit(2, p(4, 0, 0), true),
    ],
  },
  {
    name: 'redstone-block-does-not-power-adjacent-block',
    description:
      'A block of redstone activates adjacent components but does not power adjacent opaque ' +
      'blocks (it has no strong output), so a lamp behind a stone next to it stays off.',
    source: `${WIKI}Block_of_Redstone`,
    blocks: [b(p(1, 0, 0), STONE), b(p(2, 0, 0), LAMP)],
    steps: [
      place(0, p(0, 0, 0), REDSTONE_BLOCK),
      lit(0, p(2, 0, 0), false),
      lit(5, p(2, 0, 0), false),
    ],
  },
];
