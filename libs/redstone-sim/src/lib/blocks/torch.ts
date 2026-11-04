import type { Direction } from '@laracraft/core-model';
import { Flags, type Level } from '../core/level';
import { JAVA_DIRECTIONS, opposite, rel, samePos, type Pos } from '../core/pos';
import type { BState } from '../core/state';
import type { Behaviour } from './behaviour';

/**
 * Redstone torch and wall torch, Java Edition (`RedstoneTorchBlock`, `RedstoneWallTorchBlock`).
 *
 * - Inverts the power of the block it is attached to after 1 redstone tick (2 gt, scheduled
 *   tick, normal priority). Powers all neighbours except its attachment block; strongly powers
 *   the block above. Source: https://minecraft.wiki/w/Redstone_Torch#Behavior
 * - Burnout: when a torch turns off and it has toggled 8 times within the last 60 gt it burns
 *   out and is re-checked 160 gt later. Source: https://minecraft.wiki/w/Redstone_Torch#Burnout
 */
export const TORCH = 'minecraft:redstone_torch';
export const WALL_TORCH = 'minecraft:redstone_wall_torch';

const RECENT_TOGGLE_TIMER = 60;
const MAX_RECENT_TOGGLES = 8;
const RESTART_DELAY = 160;

/** Direction from the torch to the block it is attached to. */
const attachDir = (s: BState): Direction =>
  s.is(WALL_TORCH) ? opposite(s.get('facing') as Direction) : 'down';

function hasNeighborSignal(level: Level, pos: Pos, s: BState): boolean {
  const d = attachDir(s);
  return level.hasSignal(rel(pos, d), d);
}

function isToggledTooFrequently(level: Level, pos: Pos, add: boolean): boolean {
  if (add) level.torchToggles.push({ pos, when: level.gameTime });
  let n = 0;
  for (const t of level.torchToggles) {
    if (samePos(t.pos, pos) && ++n >= MAX_RECENT_TOGGLES) return true;
  }
  return false;
}

export const torchBehaviour: Behaviour = {
  isSignalSource: () => true,
  getSignal(_level, _pos, s, dir) {
    if (!s.bool('lit')) return 0;
    // Java: floor torch `direction != UP`, wall torch `facing != direction`.
    return s.is(WALL_TORCH) ? (s.get('facing') !== dir ? 15 : 0) : dir !== 'up' ? 15 : 0;
  },
  getDirectSignal(level, pos, s, dir) {
    return dir === 'down' ? (torchBehaviour.getSignal?.(level, pos, s, dir) ?? 0) : 0;
  },
  onPlace(level, pos, s, old) {
    void old;
    for (const d of JAVA_DIRECTIONS) level.updateNeighborsAt(rel(pos, d), s.id);
  },
  onRemove(level, pos, s, _next, moving) {
    if (moving) return;
    for (const d of JAVA_DIRECTIONS) level.updateNeighborsAt(rel(pos, d), s.id);
  },
  neighborChanged(level, pos, s) {
    if (s.bool('lit') === hasNeighborSignal(level, pos, s) && !level.willTickThisTick(pos, s.id)) {
      level.scheduleTick(pos, s.id, 2);
    }
  },
  tick(level, pos, s) {
    const powered = hasNeighborSignal(level, pos, s);
    const list = level.torchToggles;
    while (list.length > 0 && level.gameTime - (list[0]?.when ?? 0) > RECENT_TOGGLE_TIMER)
      list.shift();
    if (s.bool('lit')) {
      if (powered) {
        level.setBlock(pos, s.with('lit', false), Flags.ALL);
        if (isToggledTooFrequently(level, pos, true)) {
          level.scheduleTick(pos, level.getState(pos).id, RESTART_DELAY);
        }
      }
    } else if (!powered && !isToggledTooFrequently(level, pos, false)) {
      level.setBlock(pos, s.with('lit', true), Flags.ALL);
    }
  },
  placementState(level, pos, s) {
    return s.with('lit', !hasNeighborSignal(level, pos, s));
  },
};
