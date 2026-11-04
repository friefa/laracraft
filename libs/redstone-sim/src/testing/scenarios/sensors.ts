import type { Scenario, ScenarioStep } from '../../lib/api';
import {
  LAMP,
  LEVER,
  WIKI,
  WIRE_EW,
  b,
  daylight,
  dustPower,
  lit,
  on,
  p,
  props,
  use,
  wire,
  type ScenarioBlock,
} from './helpers';

const detector = (inverted: boolean) => `minecraft:daylight_detector[inverted=${inverted},power=0]`;

const DAYLIGHT_NOTE =
  'The detector recalculates only when game time is divisible by 20, so a change is seen ' +
  'at the latest 20 gt later. `set-daylight` is taken as the effective sky light at noon ' +
  '(sun angle 0, so the non-inverted output equals it).';

const railLine = (rail: string): ScenarioBlock[] => {
  const blocks: ScenarioBlock[] = [b(p(0, 0, 1), LEVER)];
  for (let x = 0; x <= 9; x++) {
    blocks.push(
      b(p(x, 0, 0), `minecraft:${rail}[powered=false,shape=east_west,waterlogged=false]`),
    );
  }
  return blocks;
};

const railSteps = (): ScenarioStep[] => [
  use(0, p(0, 0, 1)),
  on(0, p(0, 0, 0), true),
  on(0, p(1, 0, 0), true),
  on(0, p(8, 0, 0), true),
  on(0, p(9, 0, 0), false),
  use(10, p(0, 0, 1)),
  on(10, p(0, 0, 0), false),
  on(10, p(8, 0, 0), false),
];

/** Daylight detectors, target blocks, powered/activator rails. */
export const SENSOR_SCENARIOS: readonly Scenario[] = [
  {
    name: 'daylight-detector-follows-daylight',
    description: `Daylight 15 -> output 15, 0 -> 0, 8 -> 8. ${DAYLIGHT_NOTE}`,
    source: `${WIKI}Daylight_Detector`,
    blocks: [b(p(0, 0, 0), detector(false)), b(p(1, 0, 0), WIRE_EW)],
    steps: [
      daylight(0, 15),
      props(20, p(0, 0, 0), { power: '15' }),
      dustPower(20, p(1, 0, 0), 15),
      daylight(25, 0),
      props(45, p(0, 0, 0), { power: '0' }),
      dustPower(45, p(1, 0, 0), 0),
      daylight(50, 8),
      props(70, p(0, 0, 0), { power: '8' }),
    ],
  },
  {
    name: 'daylight-detector-inverted',
    description: `Inverted mode outputs 15 minus the sky light: 0 -> 15, 15 -> 0, 6 -> 9. ${DAYLIGHT_NOTE}`,
    source: `${WIKI}Daylight_Detector`,
    blocks: [b(p(0, 0, 0), detector(true)), b(p(1, 0, 0), WIRE_EW)],
    steps: [
      daylight(0, 0),
      props(20, p(0, 0, 0), { power: '15' }),
      dustPower(20, p(1, 0, 0), 15),
      daylight(25, 15),
      props(45, p(0, 0, 0), { power: '0' }),
      daylight(50, 6),
      props(70, p(0, 0, 0), { power: '9' }),
    ],
  },
  {
    name: 'target-block-redirects-dust',
    description:
      'Dust always connects to a target block, so dust between a lever (west) and a target ' +
      '(south) is a corner: it powers the target (lamp behind it lights) but not the lamp to ' +
      'the east. Without a projectile hit the target keeps power=0.',
    source: `${WIKI}Target`,
    blocks: [
      b(p(-1, 0, 0), LEVER),
      b(p(0, 0, 0), wire({ w: 'side', s: 'side' })),
      b(p(0, 0, 1), 'minecraft:target[power=0]'),
      b(p(0, 0, 2), LAMP),
      b(p(1, 0, 0), LAMP),
    ],
    steps: [
      use(0, p(-1, 0, 0)),
      lit(0, p(0, 0, 2), true),
      lit(0, p(1, 0, 0), false),
      lit(5, p(1, 0, 0), false),
      props(5, p(0, 0, 1), { power: '0' }),
    ],
  },
  {
    name: 'powered-rail-propagates-8-rails',
    description:
      'A powered rail passes power along connected powered rails up to 8 rails from the ' +
      'directly powered one (rails 0..8 powered, rail 9 not); updates are instant.',
    source: `${WIKI}Powered_Rail`,
    blocks: railLine('powered_rail'),
    steps: railSteps(),
  },
  {
    name: 'activator-rail-propagates-8-rails',
    description: 'Activator rails propagate power exactly like powered rails (8 rails).',
    source: `${WIKI}Activator_Rail`,
    blocks: railLine('activator_rail'),
    steps: railSteps(),
  },
];
