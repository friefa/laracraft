import { Flags, type Level } from '../core/level';
import { above, below, type Pos } from '../core/pos';
import type { BState } from '../core/state';
import type { Behaviour } from './behaviour';

/**
 * Powered actuators, Java Edition: redstone lamp, note block, TNT, doors, trapdoors, fence
 * gates and powered/activator rails.
 */

/** Effects that are not block states (notes played, TNT primed) for tests and the UI. */
export interface LevelLog {
  readonly notes: { readonly pos: Pos; readonly tick: number }[];
  readonly tntPrimed: { readonly pos: Pos; readonly tick: number }[];
}

const logs = new WeakMap<Level, LevelLog>();
export function levelLog(level: Level): LevelLog {
  let l = logs.get(level);
  if (!l) logs.set(level, (l = { notes: [], tntPrimed: [] }));
  return l;
}

/**
 * Redstone lamp: turns on in the same tick it is powered, turns off 4 gt (2 rt) after losing
 * power (scheduled tick). Source: https://minecraft.wiki/w/Redstone_Lamp#Behavior
 */
export const lampBehaviour: Behaviour = {
  neighborChanged(level, pos, s) {
    const lit = s.bool('lit');
    if (lit === level.hasNeighborSignal(pos)) return;
    if (lit) level.scheduleTick(pos, s.id, 4);
    else level.setBlock(pos, s.with('lit', true), Flags.CLIENTS);
  },
  tick(level, pos, s) {
    if (s.bool('lit') && !level.hasNeighborSignal(pos))
      level.setBlock(pos, s.with('lit', false), Flags.CLIENTS);
  },
  placementState(level, pos, s) {
    return s.with('lit', level.hasNeighborSignal(pos));
  },
};

/**
 * Note block: plays on a rising edge of power (only with air above), `use` cycles the note.
 * Source: https://minecraft.wiki/w/Note_Block#Behavior
 */
function playNote(level: Level, pos: Pos): void {
  if (level.getState(above(pos)).isAir) levelLog(level).notes.push({ pos, tick: level.gameTime });
}

export const noteBlockBehaviour: Behaviour = {
  neighborChanged(level, pos, s) {
    const powered = level.hasNeighborSignal(pos);
    if (powered === s.bool('powered')) return;
    if (powered) playNote(level, pos);
    level.setBlock(pos, s.with('powered', powered), Flags.ALL);
  },
  use(level, pos, s) {
    level.setBlock(pos, s.with('note', (s.int('note') + 1) % 25), Flags.ALL);
    playNote(level, pos);
  },
};

/**
 * TNT: primed (turns into a TNT entity, i.e. the block becomes air) when powered or placed
 * next to power. The explosion is not simulated. Source: https://minecraft.wiki/w/TNT#Behavior
 */
function primeIfPowered(level: Level, pos: Pos): void {
  if (!level.hasNeighborSignal(pos)) return;
  levelLog(level).tntPrimed.push({ pos, tick: level.gameTime });
  level.removeBlock(pos, false);
}

export const tntBehaviour: Behaviour = {
  onPlace(level, pos, s, old) {
    if (!old.is(s.id)) primeIfPowered(level, pos);
  },
  neighborChanged(level, pos) {
    primeIfPowered(level, pos);
  },
};

const IRON = new Set(['minecraft:iron_door', 'minecraft:iron_trapdoor']);

/**
 * Doors: either half powered opens both (`powered`/`open`), updates from other doors of the
 * same type are ignored; the halves keep each other in sync through shape updates.
 * Iron doors cannot be opened by hand. Source: https://minecraft.wiki/w/Door#Behavior
 */
export const doorBehaviour: Behaviour = {
  neighborChanged(level, pos, s, fromBlock) {
    const other = s.get('half') === 'lower' ? above(pos) : below(pos);
    const powered = level.hasNeighborSignal(pos) || level.hasNeighborSignal(other);
    if (fromBlock !== s.id && powered !== s.bool('powered')) {
      level.setBlock(pos, s.with('powered', powered).with('open', powered), Flags.CLIENTS);
    }
  },
  updateShape(level, pos, s, dir, neighbor) {
    const half = s.get('half');
    if ((dir === 'up' || dir === 'down') && (half === 'lower') === (dir === 'up')) {
      if (!neighbor.is(s.id) || neighbor.get('half') === half) return level.AIR;
      return s
        .with('facing', neighbor.get('facing'))
        .with('open', neighbor.get('open'))
        .with('hinge', neighbor.get('hinge'))
        .with('powered', neighbor.get('powered'));
    }
    return level.defaultShape(s, dir, neighbor);
  },
  use(level, pos, s) {
    if (IRON.has(s.id)) return;
    level.setBlock(pos, s.with('open', !s.bool('open')), Flags.IMMEDIATE | Flags.CLIENTS);
  },
};

/** Trapdoors open while powered. Source: https://minecraft.wiki/w/Trapdoor#Behavior */
export const trapdoorBehaviour: Behaviour = {
  neighborChanged(level, pos, s) {
    const powered = level.hasNeighborSignal(pos);
    if (powered === s.bool('powered')) return;
    level.setBlock(pos, s.with('open', powered).with('powered', powered), Flags.CLIENTS);
  },
  use(level, pos, s) {
    if (IRON.has(s.id)) return;
    level.setBlock(pos, s.with('open', !s.bool('open')), Flags.CLIENTS);
  },
};

/** Fence gates open while powered. Source: https://minecraft.wiki/w/Fence_Gate#Behavior */
export const fenceGateBehaviour: Behaviour = {
  neighborChanged(level, pos, s) {
    const powered = level.hasNeighborSignal(pos);
    if (powered === s.bool('powered')) return;
    level.setBlock(pos, s.with('powered', powered).with('open', powered), Flags.CLIENTS);
  },
  use(level, pos, s) {
    level.setBlock(pos, s.with('open', !s.bool('open')), Flags.IMMEDIATE | Flags.CLIENTS);
  },
};

// --- powered & activator rails -----------------------------------------------------------

type Shape = string;
const isAscending = (shape: Shape): boolean => shape.startsWith('ascending');

/**
 * Powered and activator rails: powered directly or through up to 8 connected rails of the
 * same type in a line (`PoweredRailBlock.findPoweredRailSignal`). Rail shapes are not
 * recomputed from neighbours (stored shapes are kept).
 * Source: https://minecraft.wiki/w/Powered_Rail#Behavior, https://minecraft.wiki/w/Activator_Rail
 */
function findPoweredRailSignal(
  level: Level,
  pos: Pos,
  s: BState,
  forward: boolean,
  distance: number,
): boolean {
  if (distance >= 8) return false;
  let { x, y, z } = pos;
  let tryBelow = true;
  let shape = s.get('shape');
  switch (shape) {
    case 'north_south':
      z += forward ? 1 : -1;
      break;
    case 'east_west':
      x += forward ? -1 : 1;
      break;
    case 'ascending_east':
      if (forward) x--;
      else {
        x++;
        y++;
        tryBelow = false;
      }
      shape = 'east_west';
      break;
    case 'ascending_west':
      if (forward) {
        x--;
        y++;
        tryBelow = false;
      } else x++;
      shape = 'east_west';
      break;
    case 'ascending_north':
      if (forward) z++;
      else {
        z--;
        y++;
        tryBelow = false;
      }
      shape = 'north_south';
      break;
    case 'ascending_south':
      if (forward) {
        z++;
        y++;
        tryBelow = false;
      } else z--;
      shape = 'north_south';
      break;
  }
  if (isSameRailWithPower(level, s.id, { x, y, z }, forward, distance, shape)) return true;
  return tryBelow && isSameRailWithPower(level, s.id, { x, y: y - 1, z }, forward, distance, shape);
}

function isSameRailWithPower(
  level: Level,
  id: string,
  pos: Pos,
  forward: boolean,
  distance: number,
  shape: Shape,
): boolean {
  const s = level.getState(pos);
  if (!s.is(id)) return false;
  const r = s.get('shape');
  if (
    shape === 'east_west' &&
    (r === 'north_south' || r === 'ascending_north' || r === 'ascending_south')
  )
    return false;
  if (
    shape === 'north_south' &&
    (r === 'east_west' || r === 'ascending_east' || r === 'ascending_west')
  )
    return false;
  if (!s.bool('powered')) return false;
  return (
    level.hasNeighborSignal(pos) || findPoweredRailSignal(level, pos, s, forward, distance + 1)
  );
}

function updateRail(level: Level, pos: Pos, s: BState): void {
  const powered = s.bool('powered');
  const should =
    level.hasNeighborSignal(pos) ||
    findPoweredRailSignal(level, pos, s, true, 0) ||
    findPoweredRailSignal(level, pos, s, false, 0);
  if (should === powered) return;
  level.setBlock(pos, s.with('powered', should), Flags.ALL);
  level.updateNeighborsAt(below(pos), s.id);
  if (isAscending(s.get('shape'))) level.updateNeighborsAt(above(pos), s.id);
}

export const poweredRailBehaviour: Behaviour = {
  neighborChanged(level, pos, s) {
    if (!level.canSurvive(s, pos)) {
      level.removeBlock(pos, false);
      return;
    }
    updateRail(level, pos, s);
  },
  onPlace(level, pos, s, old) {
    if (!old.is(s.id)) updateRail(level, pos, s);
  },
};

export const plainRailBehaviour: Behaviour = {
  neighborChanged(level, pos, s) {
    if (!level.canSurvive(s, pos)) level.removeBlock(pos, false);
  },
};
