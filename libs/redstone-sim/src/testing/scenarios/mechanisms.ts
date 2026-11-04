import type { Scenario } from '../../lib/api';
import {
  LAMP,
  LEVER,
  REDSTONE_BLOCK,
  STONE,
  WIKI,
  WIRE_EW,
  air,
  b,
  lit,
  on,
  p,
  place,
  props,
  use,
} from './helpers';

const door = (wood: string, half: 'lower' | 'upper') =>
  `minecraft:${wood}_door[facing=east,half=${half},hinge=left,open=false,powered=false]`;
const trapdoor = (wood: string) =>
  `minecraft:${wood}_trapdoor[facing=north,half=bottom,open=false,powered=false,waterlogged=false]`;
const OPEN = { open: 'true', powered: 'true' };
const CLOSED = { open: 'false', powered: 'false' };

/** Lamps, note blocks, doors, trapdoors, fence gates, TNT. */
export const MECHANISM_SCENARIOS: readonly Scenario[] = [
  {
    name: 'lamp-short-pulse-stays-lit-4gt',
    description:
      'A lamp lights instantly but turns off via a 4 gt scheduled tick: a 1 gt pulse keeps it ' +
      'lit from 0 to 5.',
    source: `${WIKI}Redstone_Lamp`,
    blocks: [b(p(0, 0, 0), LEVER), b(p(1, 0, 0), LAMP)],
    steps: [
      use(0, p(0, 0, 0)),
      lit(0, p(1, 0, 0), true),
      use(1, p(0, 0, 0)),
      lit(4, p(1, 0, 0), true),
      lit(5, p(1, 0, 0), false),
    ],
  },
  {
    name: 'lamp-repowered-before-off-tick-stays-lit',
    description:
      'Power off at 10 schedules the lamp off-tick for 14; power returns at 12, so the tick ' +
      'finds the lamp powered and it stays lit.',
    source: `${WIKI}Redstone_Lamp`,
    blocks: [b(p(0, 0, 0), LEVER), b(p(1, 0, 0), LAMP)],
    steps: [
      use(0, p(0, 0, 0)),
      use(10, p(0, 0, 0)),
      use(12, p(0, 0, 0)),
      lit(14, p(1, 0, 0), true),
      lit(20, p(1, 0, 0), true),
    ],
  },
  {
    name: 'note-block-powered-state-and-tuning',
    description:
      'A note block follows its power instantly (powered=true/false; it plays only on the ' +
      'rising edge). Using it raises the note by one.',
    source: `${WIKI}Note_Block`,
    blocks: [
      b(p(0, 0, 0), 'minecraft:note_block[instrument=harp,note=0,powered=false]'),
      b(p(1, 0, 0), LEVER),
    ],
    steps: [
      use(0, p(1, 0, 0)),
      on(0, p(0, 0, 0), true),
      use(5, p(1, 0, 0)),
      on(5, p(0, 0, 0), false),
      use(10, p(0, 0, 0)),
      props(10, p(0, 0, 0), { note: '1' }),
      use(11, p(0, 0, 0)),
      props(11, p(0, 0, 0), { note: '2' }),
    ],
  },
  {
    name: 'oak-door-opens-when-powered',
    description:
      'A powered door opens instantly; both halves get open=true and powered=true, and both ' +
      'close again when the power goes away.',
    source: `${WIKI}Door`,
    blocks: [
      b(p(0, 0, 0), door('oak', 'lower')),
      b(p(0, 1, 0), door('oak', 'upper')),
      b(p(0, 0, 1), LEVER),
    ],
    steps: [
      use(0, p(0, 0, 1)),
      props(0, p(0, 0, 0), OPEN),
      props(0, p(0, 1, 0), OPEN),
      use(5, p(0, 0, 1)),
      props(5, p(0, 0, 0), CLOSED),
      props(5, p(0, 1, 0), CLOSED),
    ],
  },
  {
    name: 'oak-door-opens-by-hand',
    description: 'Using a wooden door toggles open on both halves without changing powered.',
    source: `${WIKI}Door`,
    blocks: [b(p(0, 0, 0), door('oak', 'lower')), b(p(0, 1, 0), door('oak', 'upper'))],
    steps: [
      use(0, p(0, 0, 0)),
      props(0, p(0, 0, 0), { open: 'true', powered: 'false' }),
      props(0, p(0, 1, 0), { open: 'true', powered: 'false' }),
    ],
  },
  {
    name: 'iron-door-only-opens-with-power',
    description: 'An iron door ignores the hand but opens instantly when powered.',
    source: `${WIKI}Iron_Door`,
    blocks: [
      b(p(0, 0, 0), door('iron', 'lower')),
      b(p(0, 1, 0), door('iron', 'upper')),
      b(p(0, 0, 1), LEVER),
    ],
    steps: [
      use(0, p(0, 0, 0)),
      props(1, p(0, 0, 0), { open: 'false' }),
      use(5, p(0, 0, 1)),
      props(5, p(0, 0, 0), OPEN),
      props(5, p(0, 1, 0), OPEN),
    ],
  },
  {
    name: 'oak-trapdoor-opens-when-powered',
    description: 'A powered trapdoor opens instantly and closes when unpowered.',
    source: `${WIKI}Trapdoor`,
    blocks: [b(p(0, 0, 0), trapdoor('oak')), b(p(1, 0, 0), LEVER)],
    steps: [
      use(0, p(1, 0, 0)),
      props(0, p(0, 0, 0), OPEN),
      use(5, p(1, 0, 0)),
      props(5, p(0, 0, 0), CLOSED),
    ],
  },
  {
    name: 'iron-trapdoor-ignores-hand',
    description: 'An iron trapdoor cannot be opened by hand, only by power.',
    source: `${WIKI}Iron_Trapdoor`,
    blocks: [b(p(0, 0, 0), trapdoor('iron')), b(p(1, 0, 0), LEVER)],
    steps: [
      use(0, p(0, 0, 0)),
      props(1, p(0, 0, 0), { open: 'false' }),
      use(5, p(1, 0, 0)),
      props(5, p(0, 0, 0), OPEN),
    ],
  },
  {
    name: 'fence-gate-opens-when-powered',
    description: 'A powered fence gate opens instantly (powered=true, open=true).',
    source: `${WIKI}Fence_Gate`,
    blocks: [
      b(
        p(0, 0, 0),
        'minecraft:oak_fence_gate[facing=north,in_wall=false,open=false,powered=false]',
      ),
      b(p(1, 0, 0), LEVER),
    ],
    steps: [
      use(0, p(1, 0, 0)),
      props(0, p(0, 0, 0), OPEN),
      use(5, p(1, 0, 0)),
      props(5, p(0, 0, 0), CLOSED),
    ],
  },
  {
    name: 'tnt-primed-by-lever',
    description: 'Powered TNT is primed at once: the block becomes air (a primed TNT entity).',
    source: `${WIKI}TNT`,
    blocks: [b(p(0, 0, 0), 'minecraft:tnt[unstable=false]'), b(p(1, 0, 0), LEVER)],
    steps: [use(0, p(1, 0, 0)), air(0, p(0, 0, 0))],
  },
  {
    name: 'tnt-placed-next-to-power-is-primed',
    description: 'TNT placed next to an active power source is primed immediately (onPlace).',
    source: `${WIKI}TNT`,
    blocks: [b(p(1, 0, 0), REDSTONE_BLOCK)],
    steps: [place(0, p(0, 0, 0), 'minecraft:tnt[unstable=false]'), air(0, p(0, 0, 0))],
  },
  {
    name: 'tnt-primed-by-weakly-powered-block',
    description: 'A block weakly powered by dust activates adjacent TNT.',
    source: `${WIKI}TNT`,
    blocks: [
      b(p(0, 0, 0), LEVER),
      b(p(1, 0, 0), WIRE_EW),
      b(p(2, 0, 0), STONE),
      b(p(3, 0, 0), 'minecraft:tnt[unstable=false]'),
    ],
    steps: [props(0, p(3, 0, 0), { unstable: 'false' }), use(0, p(0, 0, 0)), air(0, p(3, 0, 0))],
  },
];
