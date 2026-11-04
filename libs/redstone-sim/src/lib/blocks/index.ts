import type { BlockEntity, Level } from '../core/level';
import type { Pos } from '../core/pos';
import type { BState } from '../core/state';
import {
  doorBehaviour,
  fenceGateBehaviour,
  lampBehaviour,
  noteBlockBehaviour,
  plainRailBehaviour,
  poweredRailBehaviour,
  tntBehaviour,
  trapdoorBehaviour,
} from './actuators';
import type { Behaviour } from './behaviour';
import { createContainerEntity, dispenserBehaviour, hopperBehaviour } from './containers';
import { ComparatorEntity, diodeBehaviour } from './diode';
import { movingPistonBehaviour, pistonBehaviour, pistonHeadBehaviour } from './piston';
import {
  DaylightEntity,
  attachedSourceBehaviour,
  daylightBehaviour,
  detectorRailBehaviour,
  observerBehaviour,
  pressurePlateBehaviour,
  redstoneBlockBehaviour,
  targetBehaviour,
} from './sources';
import { torchBehaviour } from './torch';
import { wireBehaviour } from './wire';

const NONE: Behaviour = {};

const BY_ID: Readonly<Record<string, Behaviour>> = {
  'minecraft:redstone_wire': wireBehaviour,
  'minecraft:redstone_torch': torchBehaviour,
  'minecraft:redstone_wall_torch': torchBehaviour,
  'minecraft:repeater': diodeBehaviour,
  'minecraft:comparator': diodeBehaviour,
  'minecraft:piston': pistonBehaviour,
  'minecraft:sticky_piston': pistonBehaviour,
  'minecraft:piston_head': pistonHeadBehaviour,
  'minecraft:moving_piston': movingPistonBehaviour,
  'minecraft:lever': attachedSourceBehaviour,
  'minecraft:redstone_block': redstoneBlockBehaviour,
  'minecraft:target': targetBehaviour,
  'minecraft:daylight_detector': daylightBehaviour,
  'minecraft:observer': observerBehaviour,
  'minecraft:detector_rail': detectorRailBehaviour,
  'minecraft:powered_rail': poweredRailBehaviour,
  'minecraft:activator_rail': poweredRailBehaviour,
  'minecraft:rail': plainRailBehaviour,
  'minecraft:redstone_lamp': lampBehaviour,
  'minecraft:note_block': noteBlockBehaviour,
  'minecraft:tnt': tntBehaviour,
  'minecraft:hopper': hopperBehaviour,
  'minecraft:dispenser': dispenserBehaviour,
  'minecraft:dropper': dispenserBehaviour,
};

const BY_SUFFIX: readonly (readonly [string, Behaviour])[] = [
  ['_button', attachedSourceBehaviour],
  ['_pressure_plate', pressurePlateBehaviour],
  ['_trapdoor', trapdoorBehaviour],
  ['_door', doorBehaviour],
  ['_fence_gate', fenceGateBehaviour],
];

const cache = new Map<string, Behaviour>();

/** Behaviour of a block id (blocks without redstone logic get the generic behaviour). */
export function behaviourOf(id: string): Behaviour {
  let b = cache.get(id);
  if (b) return b;
  b = BY_ID[id] ?? BY_SUFFIX.find(([suffix]) => id.endsWith(suffix))?.[1] ?? NONE;
  cache.set(id, b);
  return b;
}

/** Creates the block entity a freshly placed/loaded block needs (not for moving pistons). */
export function createBlockEntity(_level: Level, pos: Pos, s: BState): BlockEntity | undefined {
  if (s.is('minecraft:comparator')) return new ComparatorEntity(pos);
  if (s.is('minecraft:daylight_detector')) return new DaylightEntity(pos);
  return createContainerEntity(pos, s);
}
