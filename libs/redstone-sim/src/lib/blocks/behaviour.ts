import type { Direction } from '@laracraft/core-model';
import type { Level } from '../core/level';
import type { Pos } from '../core/pos';
import type { BState } from '../core/state';

/** Java `PushReaction`. */
export type PushReaction = 'normal' | 'destroy' | 'block' | 'push_only';

/**
 * Per-block behaviour, mirroring the Java `Block`/`BlockBehaviour` callbacks the redstone
 * logic depends on. All callbacks are optional; {@link Level} supplies Java's defaults.
 *
 * Direction conventions (Java): in `getSignal`/`getDirectSignal` `dir` points from the
 * asking neighbour towards this block. In `updateShape` `dir` points from this block towards
 * the neighbour that changed.
 */
export interface Behaviour {
  /** Java `isSignalSource()`: dust connects to it and it may emit power. */
  isSignalSource?(s: BState): boolean;
  /** Weak power towards the neighbour at `pos - dir`. */
  getSignal?(level: Level, pos: Pos, s: BState, dir: Direction): number;
  /** Strong ("direct") power towards the neighbour at `pos - dir`. */
  getDirectSignal?(level: Level, pos: Pos, s: BState, dir: Direction): number;

  neighborChanged?(
    level: Level,
    pos: Pos,
    s: BState,
    fromBlock: string,
    fromPos: Pos,
    moving: boolean,
  ): void;
  /** Returns the state after a neighbour's shape changed (air = break). */
  updateShape?(
    level: Level,
    pos: Pos,
    s: BState,
    dir: Direction,
    neighbor: BState,
    neighborPos: Pos,
  ): BState;
  /** Java `updateIndirectNeighbourShapes` (redstone dust diagonals). */
  updateIndirectNeighbourShapes?(
    level: Level,
    pos: Pos,
    s: BState,
    flags: number,
    recursionLeft: number,
  ): void;
  onPlace?(level: Level, pos: Pos, s: BState, old: BState, moving: boolean): void;
  onRemove?(level: Level, pos: Pos, s: BState, next: BState, moving: boolean): void;
  /** Scheduled block tick. */
  tick?(level: Level, pos: Pos, s: BState): void;
  /** Block event (pistons, note blocks). */
  triggerEvent?(level: Level, pos: Pos, s: BState, id: number, param: number): boolean;
  /** Right-click by a player. */
  use?(level: Level, pos: Pos, s: BState): void;
  /** Entity steps on / leaves (pressure plates, detector rails). */
  stepOn?(level: Level, pos: Pos, s: BState): void;
  stepOff?(level: Level, pos: Pos, s: BState): void;
  /** State derived from neighbours when a player places the block (`getStateForPlacement`). */
  placementState?(level: Level, pos: Pos, s: BState): BState;
  /** Java `setPlacedBy` (pistons check for power). */
  setPlacedBy?(level: Level, pos: Pos, s: BState): void;
  /** Overrides the computed piston push reaction. */
  pushReaction?(s: BState): PushReaction;
  /** Overrides the computed redstone conductivity. */
  conductor?(s: BState): boolean;
}
