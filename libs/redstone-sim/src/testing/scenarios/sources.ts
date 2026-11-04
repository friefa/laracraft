import type { Scenario } from '../../lib/api';
import {
  CROSS,
  LAMP,
  LEVER,
  REDSTONE_BLOCK,
  STONE,
  TORCH,
  WIKI,
  b,
  breakBlock,
  button,
  dustPower,
  lit,
  on,
  p,
  place,
  props,
  stepOff,
  stepOn,
  use,
  wallTorch,
} from './helpers';

/** Power sources: lever, buttons, pressure plates, redstone block, redstone torch. */
export const SOURCE_SCENARIOS: readonly Scenario[] = [
  {
    name: 'lever-toggles-lamp',
    description:
      'A lever switches instantly (no delay). The adjacent lamp lights in the same tick and ' +
      'turns off 4 gt after the lever is switched off (Java lamp off-delay).',
    source: `${WIKI}Lever`,
    blocks: [b(p(0, 0, 0), LEVER), b(p(1, 0, 0), LAMP)],
    steps: [
      use(0, p(0, 0, 0)),
      on(0, p(0, 0, 0), true),
      lit(0, p(1, 0, 0), true),
      use(10, p(0, 0, 0)),
      on(10, p(0, 0, 0), false),
      lit(13, p(1, 0, 0), true),
      lit(14, p(1, 0, 0), false),
    ],
  },
  {
    name: 'stone-button-20gt',
    description:
      'A stone button stays pressed for 20 gt (scheduled tick of 20). The lamp it powers ' +
      'goes out 4 gt after the button releases.',
    source: `${WIKI}Button`,
    blocks: [b(p(0, 0, 0), button('stone', 'floor', 'north')), b(p(1, 0, 0), LAMP)],
    steps: [
      use(0, p(0, 0, 0)),
      on(0, p(0, 0, 0), true),
      lit(0, p(1, 0, 0), true),
      on(19, p(0, 0, 0), true),
      on(20, p(0, 0, 0), false),
      lit(23, p(1, 0, 0), true),
      lit(24, p(1, 0, 0), false),
    ],
  },
  {
    name: 'wooden-button-30gt',
    description: 'A wooden (oak) button stays pressed for 30 gt.',
    source: `${WIKI}Button`,
    blocks: [b(p(0, 0, 0), button('oak', 'floor', 'north')), b(p(1, 0, 0), LAMP)],
    steps: [
      use(0, p(0, 0, 0)),
      on(0, p(0, 0, 0), true),
      on(29, p(0, 0, 0), true),
      on(30, p(0, 0, 0), false),
      lit(33, p(1, 0, 0), true),
      lit(34, p(1, 0, 0), false),
    ],
  },
  {
    name: 'button-strongly-powers-attached-block',
    description:
      'A pressed button strongly powers the block it is attached to, so dust next to that ' +
      'block receives 15 (only strong power reaches dust through a block).',
    source: `${WIKI}Button`,
    blocks: [
      b(p(0, 0, 0), STONE),
      b(p(1, 0, 0), button('stone', 'wall', 'east')),
      b(p(-1, 0, 0), CROSS),
    ],
    steps: [
      use(0, p(1, 0, 0)),
      dustPower(0, p(-1, 0, 0), 15),
      dustPower(19, p(-1, 0, 0), 15),
      dustPower(20, p(-1, 0, 0), 0),
    ],
  },
  {
    name: 'lever-strongly-powers-attached-block',
    description:
      'A floor lever strongly powers the block below it: dust beside that block gets 15 and a ' +
      'lamp beside it lights.',
    source: `${WIKI}Lever`,
    blocks: [
      b(p(0, 0, 0), STONE),
      b(p(0, 1, 0), LEVER),
      b(p(1, 0, 0), CROSS),
      b(p(-1, 0, 0), LAMP),
    ],
    steps: [
      use(0, p(0, 1, 0)),
      dustPower(0, p(1, 0, 0), 15),
      lit(0, p(-1, 0, 0), true),
      use(10, p(0, 1, 0)),
      dustPower(10, p(1, 0, 0), 0),
      lit(13, p(-1, 0, 0), true),
      lit(14, p(-1, 0, 0), false),
    ],
  },
  {
    name: 'stone-pressure-plate-20gt-recheck',
    description:
      'A stone pressure plate activates as soon as an entity is on it and re-checks every 20 gt ' +
      '(scheduled tick 20 after activation). The entity leaves at 5, so the plate releases at 20.',
    source: `${WIKI}Pressure_Plate`,
    blocks: [b(p(0, 0, 0), 'minecraft:stone_pressure_plate[powered=false]'), b(p(1, 0, 0), LAMP)],
    steps: [
      stepOn(0, p(0, 0, 0)),
      on(0, p(0, 0, 0), true),
      lit(0, p(1, 0, 0), true),
      stepOff(5, p(0, 0, 0)),
      on(19, p(0, 0, 0), true),
      on(20, p(0, 0, 0), false),
      lit(23, p(1, 0, 0), true),
      lit(24, p(1, 0, 0), false),
    ],
  },
  {
    name: 'wooden-pressure-plate-stays-while-occupied',
    description:
      'A wooden pressure plate keeps re-checking every 20 gt while occupied: the check at 20 ' +
      'still finds the entity; the entity leaves at 30, so the check at 40 releases it.',
    source: `${WIKI}Pressure_Plate`,
    blocks: [b(p(0, 0, 0), 'minecraft:oak_pressure_plate[powered=false]')],
    steps: [
      stepOn(0, p(0, 0, 0)),
      on(0, p(0, 0, 0), true),
      on(25, p(0, 0, 0), true),
      stepOff(30, p(0, 0, 0)),
      on(39, p(0, 0, 0), true),
      on(40, p(0, 0, 0), false),
    ],
  },
  {
    name: 'pressure-plate-strongly-powers-block-below',
    description:
      'An active pressure plate strongly powers the block under it, so dust beside that block ' +
      'gets 15.',
    source: `${WIKI}Pressure_Plate`,
    blocks: [
      b(p(0, 0, 0), STONE),
      b(p(0, 1, 0), 'minecraft:stone_pressure_plate[powered=false]'),
      b(p(1, 0, 0), CROSS),
    ],
    steps: [
      stepOn(0, p(0, 1, 0)),
      dustPower(0, p(1, 0, 0), 15),
      stepOff(1, p(0, 1, 0)),
      dustPower(19, p(1, 0, 0), 15),
      dustPower(20, p(1, 0, 0), 0),
    ],
  },
  {
    name: 'redstone-block-place-and-break',
    description:
      'A block of redstone is a permanent 15 source: placing it lights an adjacent lamp at once ' +
      'and connects adjacent dust (cross -> east-west line, power 15). Breaking it unpowers the ' +
      'dust at once (back to a cross) and the lamp 4 gt later.',
    source: `${WIKI}Block_of_Redstone`,
    blocks: [b(p(-1, 0, 0), CROSS), b(p(1, 0, 0), LAMP)],
    steps: [
      place(0, p(0, 0, 0), REDSTONE_BLOCK),
      lit(0, p(1, 0, 0), true),
      props(0, p(-1, 0, 0), { east: 'side', west: 'side', north: 'none', south: 'none' }),
      dustPower(0, p(-1, 0, 0), 15),
      breakBlock(10, p(0, 0, 0)),
      dustPower(10, p(-1, 0, 0), 0),
      props(10, p(-1, 0, 0), { east: 'side', west: 'side', north: 'side', south: 'side' }),
      lit(13, p(1, 0, 0), true),
      lit(14, p(1, 0, 0), false),
    ],
  },
  {
    name: 'redstone-torch-inverts-with-2gt-delay',
    description:
      'A wall torch on a block turns off 2 gt after the block becomes (strongly) powered and ' +
      'back on 2 gt after it is unpowered.',
    source: `${WIKI}Redstone_Torch`,
    blocks: [b(p(0, 0, 0), STONE), b(p(1, 0, 0), wallTorch('east')), b(p(0, 1, 0), LEVER)],
    steps: [
      use(0, p(0, 1, 0)),
      lit(1, p(1, 0, 0), true),
      lit(2, p(1, 0, 0), false),
      use(10, p(0, 1, 0)),
      lit(11, p(1, 0, 0), false),
      lit(12, p(1, 0, 0), true),
    ],
  },
  {
    name: 'redstone-torch-strongly-powers-block-above',
    description:
      'A redstone torch strongly powers the block directly above it; dust next to that block ' +
      'receives 15. Breaking the torch removes the power at once.',
    source: `${WIKI}Redstone_Torch`,
    blocks: [b(p(0, 1, 0), STONE), b(p(1, 0, 0), STONE), b(p(1, 1, 0), CROSS)],
    steps: [
      place(0, p(0, 0, 0), TORCH),
      dustPower(0, p(1, 1, 0), 15),
      breakBlock(10, p(0, 0, 0)),
      dustPower(10, p(1, 1, 0), 0),
    ],
  },
  {
    name: 'redstone-torch-does-not-power-its-attachment-block',
    description:
      'A torch powers its side neighbours (lamp beside it lights) but never the block it is ' +
      'attached to (lamp behind that block stays off).',
    source: `${WIKI}Redstone_Torch`,
    blocks: [b(p(0, 0, 0), STONE), b(p(-1, 0, 0), LAMP), b(p(1, 0, 1), LAMP)],
    steps: [
      place(0, p(1, 0, 0), wallTorch('east')),
      lit(0, p(1, 0, 1), true),
      lit(0, p(-1, 0, 0), false),
      lit(5, p(-1, 0, 0), false),
    ],
  },
  {
    name: 'redstone-torch-burnout',
    description:
      'Torch feedback loop: torch -> strongly powered block above -> dust -> block the torch ' +
      'hangs on. Period 4 gt (off at 2, 6, 10, ...). Java burns a torch out on the 8th turn-off ' +
      'within 60 gt (RedstoneTorchBlock.isToggledTooFrequently counts >= 8; the wiki says ' +
      '"more than eight", decompiled code wins), i.e. at 30, after which it stays off. Recovery ' +
      'depends on the update chain (scheduled 160 gt tick may be dropped as a duplicate), so ' +
      'only the off phase is checked.',
    source: `${WIKI}Redstone_Torch`,
    blocks: [b(p(0, 0, 0), STONE), b(p(1, 0, 0), wallTorch('east')), b(p(1, 1, 0), STONE)],
    steps: [
      place(0, p(0, 1, 0), CROSS),
      dustPower(0, p(0, 1, 0), 15),
      lit(1, p(1, 0, 0), true),
      lit(2, p(1, 0, 0), false),
      lit(4, p(1, 0, 0), true),
      lit(6, p(1, 0, 0), false),
      lit(28, p(1, 0, 0), true),
      lit(29, p(1, 0, 0), true),
      lit(30, p(1, 0, 0), false),
      lit(60, p(1, 0, 0), false),
      dustPower(60, p(0, 1, 0), 0),
      lit(150, p(1, 0, 0), false),
    ],
  },
];
