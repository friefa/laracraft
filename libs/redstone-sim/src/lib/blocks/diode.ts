import type { Direction } from '@laracraft/core-model';
import { Flags, type BlockEntity, type Level } from '../core/level';
import { axisOf, clockWise, counterClockWise, opposite, rel, type Pos } from '../core/pos';
import type { BState } from '../core/state';
import { TickPriority } from '../core/ticks';
import type { Behaviour } from './behaviour';
import { analogOutputAt } from './containers';

/**
 * Repeater and comparator, Java Edition (`DiodeBlock`, `RepeaterBlock`, `ComparatorBlock`).
 *
 * `facing` points from the output to the input (towards the player who placed it).
 *
 * Repeater: delay 1–4 rt (2–8 gt), output 15, strongly powers the block in front. A pulse
 * shorter than the delay is extended to the delay. Locked while a powered repeater or
 * comparator points into its side; a locked repeater keeps its output.
 * Source: https://minecraft.wiki/w/Redstone_Repeater#Behavior
 *
 * Comparator: 1 rt (2 gt) delay; compare mode outputs the rear signal if ≥ the strongest
 * side signal, subtract mode outputs rear − side. Reads containers (and other analog blocks)
 * directly behind it or through one conductor. Side inputs: dust, redstone blocks and
 * signal sources' strong power. Source: https://minecraft.wiki/w/Redstone_Comparator
 *
 * Tick priorities: https://minecraft.wiki/w/Tick#Scheduled_tick
 */
export const REPEATER = 'minecraft:repeater';
export const COMPARATOR = 'minecraft:comparator';

export class ComparatorEntity implements BlockEntity {
  removed = false;
  output = 0;
  constructor(readonly pos: Pos) {}
}

const facingOf = (s: BState): Direction => s.get('facing') as Direction;
const isDiode = (s: BState): boolean => s.is(REPEATER) || s.is(COMPARATOR);

/** Java `DiodeBlock.getInputSignal` (+ comparator analog reading). */
function getInputSignal(level: Level, pos: Pos, s: BState): number {
  const d = facingOf(s);
  const p = rel(pos, d);
  let i = level.getSignal(p, d);
  if (i < 15) {
    const ps = level.getState(p);
    if (ps.is('minecraft:redstone_wire')) i = Math.max(i, ps.int('power'));
  }
  if (!s.is(COMPARATOR)) return i;
  const ps = level.getState(p);
  const analog = analogOutputAt(level, p, ps);
  if (analog !== undefined) return analog;
  if (i < 15 && level.isConductor(p, ps)) {
    const p2 = rel(p, d);
    const a2 = analogOutputAt(level, p2, level.getState(p2));
    if (a2 !== undefined) return a2;
  }
  return i;
}

/** Java `DiodeBlock.getAlternateSignal`: strongest side input. */
function getAlternateSignal(level: Level, pos: Pos, s: BState): number {
  const d = facingOf(s);
  const cw = clockWise(d);
  const ccw = counterClockWise(d);
  const diodesOnly = s.is(REPEATER);
  return Math.max(
    level.getControlInputSignal(rel(pos, cw), cw, diodesOnly),
    level.getControlInputSignal(rel(pos, ccw), ccw, diodesOnly),
  );
}

const isLocked = (level: Level, pos: Pos, s: BState): boolean =>
  s.is(REPEATER) && getAlternateSignal(level, pos, s) > 0;

function comparatorOutput(level: Level, pos: Pos, s: BState): number {
  const i = getInputSignal(level, pos, s);
  if (i === 0) return 0;
  const j = getAlternateSignal(level, pos, s);
  if (j > i) return 0;
  return s.get('mode') === 'subtract' ? i - j : i;
}

function shouldTurnOn(level: Level, pos: Pos, s: BState): boolean {
  const i = getInputSignal(level, pos, s);
  if (!s.is(COMPARATOR)) return i > 0;
  if (i === 0) return false;
  const j = getAlternateSignal(level, pos, s);
  return i > j || (i === j && s.get('mode') === 'compare');
}

/** Java `shouldPrioritize`: the block in front is a diode not facing back into this one. */
function shouldPrioritize(level: Level, pos: Pos, s: BState): boolean {
  const d = opposite(facingOf(s));
  const front = level.getState(rel(pos, d));
  return isDiode(front) && front.get('facing') !== d;
}

const delayOf = (s: BState): number => (s.is(REPEATER) ? s.int('delay') * 2 : 2);

function outputSignal(level: Level, pos: Pos, s: BState): number {
  if (s.is(REPEATER)) return 15;
  return level.getBlockEntity<ComparatorEntity>(pos)?.output ?? 0;
}

/** Java `updateNeighborsInFront`. */
function updateNeighborsInFront(level: Level, pos: Pos, s: BState): void {
  const d = facingOf(s);
  const front = rel(pos, opposite(d));
  level.neighborChanged(front, s.id, pos);
  level.updateNeighborsAtExceptFromFacing(front, s.id, d);
}

function checkTickOnNeighbor(level: Level, pos: Pos, s: BState): void {
  if (s.is(COMPARATOR)) {
    if (level.willTickThisTick(pos, s.id)) return;
    const i = comparatorOutput(level, pos, s);
    const j = outputSignal(level, pos, s);
    if (i !== j || s.bool('powered') !== shouldTurnOn(level, pos, s)) {
      const p = shouldPrioritize(level, pos, s) ? TickPriority.HIGH : TickPriority.NORMAL;
      level.scheduleTick(pos, s.id, 2, p);
    }
    return;
  }
  if (isLocked(level, pos, s)) return;
  const powered = s.bool('powered');
  if (powered !== shouldTurnOn(level, pos, s) && !level.willTickThisTick(pos, s.id)) {
    let p: number = TickPriority.HIGH;
    if (shouldPrioritize(level, pos, s)) p = TickPriority.EXTREMELY_HIGH;
    else if (powered) p = TickPriority.VERY_HIGH;
    level.scheduleTick(pos, s.id, delayOf(s), p);
  }
}

function refreshComparator(level: Level, pos: Pos, s: BState): void {
  const i = comparatorOutput(level, pos, s);
  const be = level.getBlockEntity<ComparatorEntity>(pos);
  let j = 0;
  if (be) {
    j = be.output;
    be.output = i;
  }
  if (j !== i || s.get('mode') === 'compare') {
    const on = shouldTurnOn(level, pos, s);
    const powered = s.bool('powered');
    if (powered && !on) level.setBlock(pos, s.with('powered', false), Flags.CLIENTS);
    else if (!powered && on) level.setBlock(pos, s.with('powered', true), Flags.CLIENTS);
    updateNeighborsInFront(level, pos, s);
  }
}

export const diodeBehaviour: Behaviour = {
  isSignalSource: () => true,
  getSignal(level, pos, s, dir) {
    if (!s.bool('powered')) return 0;
    return facingOf(s) === dir ? outputSignal(level, pos, s) : 0;
  },
  getDirectSignal(level, pos, s, dir) {
    return diodeBehaviour.getSignal?.(level, pos, s, dir) ?? 0;
  },
  neighborChanged(level, pos, s) {
    if (level.canSurvive(s, pos)) {
      checkTickOnNeighbor(level, pos, s);
    } else {
      level.removeBlock(pos, false);
      for (const d of ['down', 'up', 'north', 'south', 'west', 'east'] as const) {
        level.updateNeighborsAt(rel(pos, d), s.id);
      }
    }
  },
  updateShape(level, pos, s, dir, neighbor) {
    const r = level.defaultShape(s, dir, neighbor);
    if (r.isAir) return r;
    if (s.is(REPEATER) && axisOf(dir) !== axisOf(facingOf(s))) {
      return s.with('locked', isLocked(level, pos, s));
    }
    return s;
  },
  tick(level, pos, s) {
    if (s.is(COMPARATOR)) {
      refreshComparator(level, pos, s);
      return;
    }
    if (isLocked(level, pos, s)) return;
    const powered = s.bool('powered');
    const on = shouldTurnOn(level, pos, s);
    if (powered && !on) {
      level.setBlock(pos, s.with('powered', false), Flags.CLIENTS);
    } else if (!powered) {
      level.setBlock(pos, s.with('powered', true), Flags.CLIENTS);
      if (!on) level.scheduleTick(pos, s.id, delayOf(s), TickPriority.VERY_HIGH);
    }
  },
  onPlace(level, pos, s) {
    updateNeighborsInFront(level, pos, s);
  },
  onRemove(level, pos, s, next, moving) {
    if (moving || next.id === s.id) return;
    updateNeighborsInFront(level, pos, s);
  },
  use(level, pos, s) {
    if (s.is(REPEATER)) {
      const delay = (s.int('delay') % 4) + 1;
      level.setBlock(pos, s.with('delay', delay), Flags.ALL);
      return;
    }
    const next = s.with('mode', s.get('mode') === 'compare' ? 'subtract' : 'compare');
    level.setBlock(pos, next, Flags.CLIENTS);
    refreshComparator(level, pos, next);
  },
  placementState(level, pos, s) {
    let r = s.with('powered', s.is(REPEATER) ? false : s.bool('powered'));
    if (r.is(REPEATER)) r = r.with('locked', isLocked(level, pos, r));
    return r;
  },
  setPlacedBy(level, pos, s) {
    if (shouldTurnOn(level, pos, s)) level.scheduleTick(pos, s.id, 1);
  },
};

/** Initialises a loaded comparator's stored output (a world save keeps it in the block entity). */
export function initComparator(level: Level, pos: Pos, s: BState): void {
  const be = level.getBlockEntity<ComparatorEntity>(pos);
  if (be) be.output = comparatorOutput(level, pos, s);
}

/** Comparator output strength stored in its block entity (for tests/UI). */
export const comparatorOutputAt = (level: Level, pos: Pos): number =>
  level.getBlockEntity<ComparatorEntity>(pos)?.output ?? 0;
