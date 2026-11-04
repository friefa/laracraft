import type { Direction } from '@laracraft/core-model';
import { Flags, type Level } from '../core/level';
import { javaHashOrder } from '../core/java-hash';
import {
  JAVA_DIRECTIONS,
  JAVA_HORIZONTAL,
  above,
  below,
  opposite,
  posKey,
  rel,
  type Pos,
  type PosKey,
} from '../core/pos';
import type { BState } from '../core/state';
import type { Behaviour } from './behaviour';
import { isFaceSturdy, survivesOn } from './properties';

/**
 * Redstone dust, Java Edition (`RedStoneWireBlock` + default wire evaluator).
 *
 * - Power = max(strong power of neighbours as seen with wires muted, neighbouring dust − 1).
 *   Dust looks at dust beside it, one block up (if the block beside is a conductor and the
 *   block above this dust is not) and one block down (if the block beside is not a conductor).
 *   Source: https://minecraft.wiki/w/Redstone_Dust#Behavior (signal decays by 1 per block,
 *   "cut" by an opaque block above).
 * - Dust weakly powers the block below and the blocks it points into; it never powers the
 *   block above. A dot (all sides none, toggled by right-click) powers no side, an isolated
 *   cross powers all four. Source: https://minecraft.wiki/w/Redstone_Dust (dot vs cross).
 * - After a power change dust notifies the 7 positions around it in `HashSet` order, which is
 *   the cause of locational behaviour. Source: https://minecraft.wiki/w/Block_update and
 *   https://technical-minecraft.fandom.com/wiki/Locationality
 */
export const WIRE = 'minecraft:redstone_wire';

type Side = 'up' | 'side' | 'none';
const connected = (v: string): boolean => v === 'up' || v === 'side';

const isDot = (s: BState): boolean => JAVA_HORIZONTAL.every((d) => s.get(d) === 'none');
const isCross = (s: BState): boolean => JAVA_HORIZONTAL.every((d) => s.get(d) === 'side');

const shapes = new WeakMap<object, Map<string, BState>>();

/** Interned cross/dot wire states per power level (hot path). */
function wireShape(level: Level, kind: 'cross' | 'dot', power: number): BState {
  let m = shapes.get(level.table);
  if (!m) shapes.set(level.table, (m = new Map()));
  const k = `${kind}${power}`;
  let s = m.get(k);
  if (!s) {
    const side = kind === 'cross' ? 'side' : 'none';
    s = level.table.of(WIRE, {
      north: side,
      east: side,
      south: side,
      west: side,
      power: String(power),
    });
    m.set(k, s);
  }
  return s;
}

const cross = (level: Level, power: number): BState => wireShape(level, 'cross', power);
const dot = (level: Level, power: number): BState => wireShape(level, 'dot', power);

/** Java `canSurviveOn`: sturdy top face or a hopper. */
function canSurviveOn(s: BState): boolean {
  return s.is('minecraft:hopper') || survivesOn(s, 'down', 'rigid', s);
}

/** Java `shouldConnectTo(state, direction)`; `dir` undefined = the one-argument overload. */
function shouldConnectTo(level: Level, s: BState, dir: Direction | undefined): boolean {
  if (s.is(WIRE)) return true;
  if (s.is('minecraft:repeater')) {
    const f = s.get('facing') as Direction;
    return dir !== undefined && (f === dir || opposite(f) === dir);
  }
  if (s.is('minecraft:observer')) return dir !== undefined && s.get('facing') === dir;
  return dir !== undefined && level.isSignalSource(s);
}

function getConnectingSide(level: Level, pos: Pos, dir: Direction, canConnectUp: boolean): Side {
  const p = rel(pos, dir);
  const s = level.getState(p);
  if (canConnectUp) {
    const support = s.def?.render.modelId === 'trapdoor' || canSurviveOn(s);
    if (support && shouldConnectTo(level, level.getState(above(p)), undefined)) {
      return isFaceSturdy(s, opposite(dir)) ? 'up' : 'side';
    }
  }
  if (
    shouldConnectTo(level, s, dir) ||
    (!level.isConductor(p, s) && shouldConnectTo(level, level.getState(below(p)), undefined))
  ) {
    return 'side';
  }
  return 'none';
}

const canConnectUpAt = (level: Level, pos: Pos): boolean => !level.isConductor(above(pos));

function getMissingConnections(level: Level, pos: Pos, s: BState): BState {
  const up = canConnectUpAt(level, pos);
  let r = s;
  for (const d of JAVA_HORIZONTAL) {
    if (!connected(r.get(d))) r = r.with(d, getConnectingSide(level, pos, d, up));
  }
  return r;
}

/** Java `getConnectionState`: actual shape incl. the "single line extends both ways" rule. */
const connectionCache = new WeakMap<Level, Map<PosKey, { v: number; in: BState; out: BState }>>();

/** Java `getConnectionState`, memoised per world version (it only reads the world). */
export function getConnectionState(level: Level, pos: Pos, s: BState): BState {
  let cache = connectionCache.get(level);
  if (!cache) connectionCache.set(level, (cache = new Map()));
  const k = posKey(pos);
  const hit = cache.get(k);
  if (hit && hit.v === level.version && hit.in === s) return hit.out;
  const out = computeConnectionState(level, pos, s);
  cache.set(k, { v: level.version, in: s, out });
  return out;
}

function computeConnectionState(level: Level, pos: Pos, s: BState): BState {
  const wasDot = isDot(s);
  let r = getMissingConnections(level, pos, dot(level, s.int('power')));
  if (wasDot && isDot(r)) return r;
  const n = connected(r.get('north'));
  const so = connected(r.get('south'));
  const e = connected(r.get('east'));
  const w = connected(r.get('west'));
  // No north/south connection → the line runs east-west, and vice versa.
  const noNorthSouth = !n && !so;
  const noEastWest = !e && !w;
  if (!w && noNorthSouth) r = r.with('west', 'side');
  if (!e && noNorthSouth) r = r.with('east', 'side');
  if (!n && noEastWest) r = r.with('north', 'side');
  if (!so && noEastWest) r = r.with('south', 'side');
  return r;
}

const wireSignal = (s: BState): number => (s.is(WIRE) ? s.int('power') : 0);

/** Java `calculateTargetStrength`. */
export function calculateTargetStrength(level: Level, pos: Pos): number {
  let i: number;
  level.wiresSignal = false;
  try {
    i = level.getBestNeighborSignal(pos);
  } finally {
    level.wiresSignal = true;
  }
  let j = 0;
  if (i < 15) {
    const upCut = level.isConductor(above(pos));
    for (const d of JAVA_HORIZONTAL) {
      const p = rel(pos, d);
      const s = level.getState(p);
      j = Math.max(j, wireSignal(s));
      const cond = level.isConductor(p, s);
      if (cond && !upCut) j = Math.max(j, wireSignal(level.getState(above(p))));
      else if (!cond) j = Math.max(j, wireSignal(level.getState(below(p))));
    }
  }
  return Math.max(i, j - 1);
}

function updatePowerStrength(level: Level, pos: Pos, s: BState): void {
  const i = calculateTargetStrength(level, pos);
  if (s.int('power') === i) return;
  if (level.getState(pos) === s) level.setBlock(pos, s.with('power', i), Flags.CLIENTS);
  const set = javaHashOrder([pos, ...JAVA_DIRECTIONS.map((d) => rel(pos, d))]);
  for (const p of set) level.updateNeighborsAt(p, WIRE);
}

function checkCornerChangeAt(level: Level, p: Pos): void {
  if (!level.getState(p).is(WIRE)) return;
  level.updateNeighborsAt(p, WIRE);
  for (const d of JAVA_DIRECTIONS) level.updateNeighborsAt(rel(p, d), WIRE);
}

function updateNeighborsOfNeighboringWires(level: Level, pos: Pos): void {
  for (const d of JAVA_HORIZONTAL) checkCornerChangeAt(level, rel(pos, d));
  for (const d of JAVA_HORIZONTAL) {
    const p = rel(pos, d);
    checkCornerChangeAt(level, level.isConductor(p) ? above(p) : below(p));
  }
}

export const wireBehaviour: Behaviour = {
  isSignalSource: () => true,
  getSignal(level, pos, s, dir) {
    if (!level.wiresSignal || dir === 'down') return 0;
    const power = s.int('power');
    if (power === 0) return 0;
    if (dir === 'up') return power;
    return connected(getConnectionState(level, pos, s).get(opposite(dir))) ? power : 0;
  },
  getDirectSignal(level, pos, s, dir) {
    return level.wiresSignal ? (wireBehaviour.getSignal?.(level, pos, s, dir) ?? 0) : 0;
  },
  neighborChanged(level, pos, s) {
    if (level.canSurvive(s, pos)) updatePowerStrength(level, pos, s);
    else level.removeBlock(pos, false);
  },
  updateShape(level, pos, s, dir, neighbor) {
    if (dir === 'down') return canSurviveOn(neighbor) ? s : level.AIR;
    if (dir === 'up') return getConnectionState(level, pos, s);
    const side = getConnectingSide(level, pos, dir, canConnectUpAt(level, pos));
    if (connected(side) === connected(s.get(dir)) && !isCross(s)) return s.with(dir, side);
    return getConnectionState(level, pos, cross(level, s.int('power')).with(dir, side));
  },
  updateIndirectNeighbourShapes(level, pos, s, flags, rl) {
    for (const d of JAVA_HORIZONTAL) {
      if (s.get(d) === 'none' || level.getState(rel(pos, d)).is(WIRE)) continue;
      for (const m of [below(rel(pos, d)), above(rel(pos, d))]) {
        if (!level.getState(m).is(WIRE)) continue;
        const p = rel(m, opposite(d));
        level.neighborShapeChanged(opposite(d), level.getState(p), m, p, flags, rl);
      }
    }
  },
  onPlace(level, pos, s, old) {
    if (old.is(WIRE)) return;
    updatePowerStrength(level, pos, s);
    level.updateNeighborsAt(above(pos), WIRE);
    level.updateNeighborsAt(below(pos), WIRE);
    updateNeighborsOfNeighboringWires(level, pos);
  },
  onRemove(level, pos, s, next, moving) {
    if (moving || next.is(WIRE)) return;
    for (const d of JAVA_DIRECTIONS) level.updateNeighborsAt(rel(pos, d), WIRE);
    updatePowerStrength(level, pos, s);
    updateNeighborsOfNeighboringWires(level, pos);
  },
  use(level, pos, s) {
    if (!isCross(s) && !isDot(s)) return;
    const base = isCross(s) ? dot(level, s.int('power')) : cross(level, s.int('power'));
    const next = getConnectionState(level, pos, base);
    if (next === s) return;
    level.setBlock(pos, next, Flags.ALL);
    for (const d of JAVA_HORIZONTAL) {
      const p = rel(pos, d);
      if (connected(s.get(d)) !== connected(next.get(d)) && level.isConductor(p)) {
        level.updateNeighborsAtExceptFromFacing(p, WIRE, opposite(d));
      }
    }
  },
  placementState(level, pos, s) {
    return getConnectionState(level, pos, cross(level, s.int('power')));
  },
};
