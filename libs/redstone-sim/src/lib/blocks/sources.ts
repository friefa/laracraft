import type { Direction } from '@laracraft/core-model';
import { Flags, type BlockEntity, type Level } from '../core/level';
import { below, opposite, posKey, rel, type Pos, type PosKey } from '../core/pos';
import type { BState } from '../core/state';
import type { Behaviour } from './behaviour';

/**
 * Power sources, Java Edition: lever, buttons, pressure plates, block of redstone, target
 * block, daylight detector, observer, detector rail.
 */

// --- lever & buttons ---------------------------------------------------------------------

/** Java `FaceAttachedHorizontalDirectionalBlock.getConnectedDirection`: from the attached block towards the lever. */
const connectedDirection = (s: BState): Direction => {
  const face = s.get('face');
  return face === 'ceiling' ? 'down' : face === 'floor' ? 'up' : (s.get('facing') as Direction);
};

function updateAttachedNeighbours(level: Level, pos: Pos, s: BState): void {
  level.updateNeighborsAt(pos, s.id);
  level.updateNeighborsAt(rel(pos, opposite(connectedDirection(s))), s.id);
}

/**
 * Lever and buttons: 15 to all neighbours, strong power into the attached block.
 * Lever toggles on use. Buttons stay pressed for 20 gt (stone) or 30 gt (wood).
 * Sources: https://minecraft.wiki/w/Lever#Behavior, https://minecraft.wiki/w/Button#Behavior
 */
export const attachedSourceBehaviour: Behaviour = {
  isSignalSource: () => true,
  getSignal: (_l, _p, s) => (s.bool('powered') ? 15 : 0),
  getDirectSignal: (_l, _p, s, dir) =>
    s.bool('powered') && connectedDirection(s) === dir ? 15 : 0,
  onRemove(level, pos, s, next, moving) {
    if (!moving && !next.is(s.id) && s.bool('powered')) updateAttachedNeighbours(level, pos, s);
  },
  use(level, pos, s) {
    if (s.is('minecraft:lever')) {
      const next = s.with('powered', !s.bool('powered'));
      level.setBlock(pos, next, Flags.ALL);
      updateAttachedNeighbours(level, pos, next);
      return;
    }
    if (s.bool('powered')) return;
    const next = s.with('powered', true);
    level.setBlock(pos, next, Flags.ALL);
    updateAttachedNeighbours(level, pos, next);
    level.scheduleTick(pos, s.id, buttonTicks(s));
  },
  tick(level, pos, s) {
    if (s.is('minecraft:lever') || !s.bool('powered')) return;
    // Arrows are not simulated, so the button simply releases (`checkPressed`).
    const next = s.with('powered', false);
    level.setBlock(pos, next, Flags.ALL);
    updateAttachedNeighbours(level, pos, next);
  },
};

/** Stone (and polished blackstone) buttons 20 gt, wooden buttons 30 gt. */
export const buttonTicks = (s: BState): number => (s.is('minecraft:stone_button') ? 20 : 30);

// --- pressure plates & detector rail ---------------------------------------------------------

/** Positions with an entity standing on them (stimuli `step-on` / `step-off`). */
const occupied = new WeakMap<Level, Set<PosKey>>();
const occupants = (level: Level): Set<PosKey> => {
  let s = occupied.get(level);
  if (!s) occupied.set(level, (s = new Set()));
  return s;
};

const PRESSED_TIME = 20;

function updatePlateNeighbours(level: Level, pos: Pos, id: string): void {
  level.updateNeighborsAt(pos, id);
  level.updateNeighborsAt(below(pos), id);
}

function checkPlatePressed(level: Level, pos: Pos, s: BState): void {
  const on = occupants(level).has(posKey(pos));
  if (on !== s.bool('powered')) {
    level.setBlock(pos, s.with('powered', on), Flags.CLIENTS);
    updatePlateNeighbours(level, pos, s.id);
  }
  if (on) level.scheduleTick(pos, s.id, PRESSED_TIME);
}

/**
 * Stone and wooden pressure plates (binary, 15). An entity on the plate turns it on at once;
 * it is re-checked every 20 gt and turns off at the first check after the entity left.
 * Both kinds react to players/mobs (the stimulus models one entity); item-only activation of
 * wooden plates is not simulated. Source: https://minecraft.wiki/w/Pressure_Plate#Behavior
 */
export const pressurePlateBehaviour: Behaviour = {
  isSignalSource: () => true,
  getSignal: (_l, _p, s) => (s.bool('powered') ? 15 : 0),
  getDirectSignal: (_l, _p, s, dir) => (dir === 'up' && s.bool('powered') ? 15 : 0),
  stepOn(level, pos, s) {
    occupants(level).add(posKey(pos));
    if (!s.bool('powered')) checkPlatePressed(level, pos, s);
  },
  stepOff(level, pos) {
    occupants(level).delete(posKey(pos));
  },
  tick(level, pos, s) {
    if (s.bool('powered')) checkPlatePressed(level, pos, s);
  },
  onRemove(level, pos, s, next, moving) {
    if (!moving && !next.is(s.id) && s.bool('powered')) updatePlateNeighbours(level, pos, s.id);
  },
};

/**
 * Detector rail: powered while a minecart is on it (stimuli `step-on`/`step-off` stand for a
 * minecart), re-checked every 20 gt. Strong power into the block below.
 * Source: https://minecraft.wiki/w/Detector_Rail#Behavior
 */
export const detectorRailBehaviour: Behaviour = {
  isSignalSource: () => true,
  getSignal: (_l, _p, s) => (s.bool('powered') ? 15 : 0),
  getDirectSignal: (_l, _p, s, dir) => (dir === 'up' && s.bool('powered') ? 15 : 0),
  stepOn(level, pos, s) {
    occupants(level).add(posKey(pos));
    if (!s.bool('powered')) checkDetectorRail(level, pos, s);
  },
  stepOff(level, pos) {
    occupants(level).delete(posKey(pos));
  },
  tick(level, pos, s) {
    if (s.bool('powered')) checkDetectorRail(level, pos, s);
  },
  neighborChanged(level, pos, s) {
    if (!level.canSurvive(s, pos)) level.removeBlock(pos, false);
  },
};

function checkDetectorRail(level: Level, pos: Pos, s: BState): void {
  const on = occupants(level).has(posKey(pos));
  if (on !== s.bool('powered')) {
    level.setBlock(pos, s.with('powered', on), Flags.ALL);
    level.updateNeighborsAt(pos, s.id);
    level.updateNeighborsAt(below(pos), s.id);
  }
  if (on) level.scheduleTick(pos, s.id, PRESSED_TIME);
  level.updateNeighbourForOutputSignal(pos, s.id);
}

// --- constant sources ------------------------------------------------------------------------

/** Block of redstone: weak power 15 on all sides, not a conductor. https://minecraft.wiki/w/Block_of_Redstone */
export const redstoneBlockBehaviour: Behaviour = {
  isSignalSource: () => true,
  getSignal: () => 15,
};

/**
 * Target block: emits its `power` (set by projectiles, not simulated) and is reset to 0 when
 * placed. Dust connects to it. https://minecraft.wiki/w/Target
 */
export const targetBehaviour: Behaviour = {
  isSignalSource: () => true,
  getSignal: (_l, _p, s) => s.int('power'),
  onPlace(level, pos, s, old) {
    if (!old.is(s.id) && s.int('power') > 0 && !level.hasScheduledTick(pos, s.id)) {
      level.setBlock(pos, s.with('power', 0), Flags.KNOWN_SHAPE | Flags.CLIENTS);
    }
  },
  tick(level, pos, s) {
    if (s.int('power') !== 0) level.setBlock(pos, s.with('power', 0), Flags.ALL);
  },
};

/**
 * Daylight detector: weak power from sky light, refreshed every 20 gt by its block entity;
 * inverted mode outputs 15 − light. The sun angle is not modelled: the `set-daylight`
 * stimulus is taken as the effective light level. https://minecraft.wiki/w/Daylight_Detector
 */
export class DaylightEntity implements BlockEntity {
  removed = false;
  constructor(readonly pos: Pos) {}
  tick(level: Level): void {
    if (level.gameTime % 20 === 0) updateDaylight(level, this.pos, level.getState(this.pos));
  }
}

function updateDaylight(level: Level, pos: Pos, s: BState): void {
  if (!s.is('minecraft:daylight_detector')) return;
  const light = Math.max(0, Math.min(15, level.daylight));
  const power = s.bool('inverted') ? 15 - light : light;
  if (s.int('power') !== power) level.setBlock(pos, s.with('power', power), Flags.ALL);
}

export const daylightBehaviour: Behaviour = {
  isSignalSource: () => true,
  getSignal: (_l, _p, s) => s.int('power'),
  use(level, pos, s) {
    const next = s.with('inverted', !s.bool('inverted'));
    level.setBlock(pos, next, Flags.CLIENTS);
    updateDaylight(level, pos, next);
  },
};

// --- observer --------------------------------------------------------------------------------

/**
 * Observer: detects shape updates (state changes, placement, removal) of the block its face
 * looks at; 2 gt later it turns on (strong power 15 out of its back) for 2 gt.
 * Source: https://minecraft.wiki/w/Observer#Behavior (2 gt delay, 2 gt pulse in Java),
 * https://minecraft.wiki/w/Redstone_circuits/Clock (two placed observers form a 6 gt clock).
 */
function observerUpdateFront(level: Level, pos: Pos, s: BState): void {
  const d = s.get('facing') as Direction;
  const front = rel(pos, opposite(d));
  level.neighborChanged(front, s.id, pos);
  level.updateNeighborsAtExceptFromFacing(front, s.id, d);
}

function startSignal(level: Level, pos: Pos, s: BState): void {
  if (!level.hasScheduledTick(pos, s.id)) level.scheduleTick(pos, s.id, 2);
}

export const observerBehaviour: Behaviour = {
  isSignalSource: () => true,
  getSignal: (_l, _p, s, dir) => (s.bool('powered') && s.get('facing') === dir ? 15 : 0),
  getDirectSignal: (_l, _p, s, dir) => (s.bool('powered') && s.get('facing') === dir ? 15 : 0),
  updateShape(level, pos, s, dir) {
    if (s.get('facing') === dir && !s.bool('powered')) startSignal(level, pos, s);
    return s;
  },
  tick(level, pos, s) {
    if (s.bool('powered')) {
      level.setBlock(pos, s.with('powered', false), Flags.CLIENTS);
    } else {
      level.setBlock(pos, s.with('powered', true), Flags.CLIENTS);
      level.scheduleTick(pos, s.id, 2);
    }
    observerUpdateFront(level, pos, s);
  },
  onPlace(level, pos, s, old) {
    if (s.is(old.id)) return;
    if (s.bool('powered') && !level.hasScheduledTick(pos, s.id)) {
      const off = s.with('powered', false);
      level.setBlock(pos, off, Flags.KNOWN_SHAPE | Flags.CLIENTS);
      observerUpdateFront(level, pos, off);
    }
  },
  onRemove(level, pos, s, next) {
    if (s.is(next.id)) return;
    if (s.bool('powered') && level.hasScheduledTick(pos, s.id)) {
      observerUpdateFront(level, pos, s.with('powered', false));
    }
  },
};
