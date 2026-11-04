import type { BlockRegistry, Direction } from '@laracraft/core-model';
import type { Behaviour } from '../blocks/behaviour';
import { hasAnalogOutput, isConductorState, supportOf, survivesOn } from '../blocks/properties';
import {
  JAVA_DIRECTIONS,
  JAVA_HORIZONTAL,
  SHAPE_UPDATE_ORDER,
  opposite,
  posKey,
  type PosKey,
  rel,
  type Pos,
} from './pos';
import { JavaRandom } from './random';
import { StateTable, type BState } from './state';
import { TickScheduler, TickPriority } from './ticks';
import { NeighborUpdater, type UpdateTarget } from './updater';

/** Java `Block.UPDATE_*` flags. */
export const Flags = {
  NEIGHBORS: 1,
  CLIENTS: 2,
  INVISIBLE: 4,
  IMMEDIATE: 8,
  KNOWN_SHAPE: 16,
  SUPPRESS_DROPS: 32,
  MOVE_BY_PISTON: 64,
  ALL: 3,
} as const;

/** Java `Block.UPDATE_LIMIT`: shape update recursion depth. */
export const SHAPE_UPDATE_LIMIT = 512;

export interface BlockEntity {
  readonly pos: Pos;
  removed: boolean;
  tick?(level: Level): void;
  /** True while the entity still has work to do (moving blocks, hopper transfers). */
  busy?(level: Level): boolean;
}

export interface LevelOptions {
  readonly registry: BlockRegistry;
  readonly groundY: number;
  readonly maxChainedUpdates: number;
  readonly behaviourOf: (id: string) => Behaviour;
  readonly createBlockEntity: (level: Level, pos: Pos, s: BState) => BlockEntity | undefined;
}

interface BlockEvent {
  readonly pos: Pos;
  readonly block: string;
  readonly id: number;
  readonly param: number;
}

/**
 * The simulated world (Java `ServerLevel` subset): sparse block storage, signal queries,
 * `setBlock` with Java's flags, neighbour/shape updates, scheduled ticks, block events and
 * block entities. One {@link step} = one game tick in Java's phase order:
 * scheduled block ticks → block events → block entities.
 * Source: https://minecraft.wiki/w/Tick#Game_tick (phase order within a tick).
 */
export class Level implements UpdateTarget {
  readonly table: StateTable;
  readonly AIR: BState;
  private readonly GROUND: BState;
  private readonly blocks = new Map<PosKey, { pos: Pos; state: BState }>();
  readonly groundY: number;
  readonly ticks = new TickScheduler();
  readonly updater: NeighborUpdater;
  readonly random = new JavaRandom(0);
  private readonly events: BlockEvent[] = [];
  private readonly eventKeys = new Set<string>();
  readonly blockEntities = new Map<PosKey, BlockEntity>();
  private tickers: BlockEntity[] = [];
  private pendingTickers: BlockEntity[] = [];
  private tickingBlockEntities = false;
  private readonly behaviourOf: (id: string) => Behaviour;
  private readonly createBE: LevelOptions['createBlockEntity'];

  gameTime = 0;
  /** Incremented on every block change; lets pure world queries be memoised safely. */
  version = 0;
  /** Work counters (neighbour and shape updates executed) for profiling. */
  readonly stats = { neighborUpdates: 0, shapeUpdates: 0 };
  /** Java `ServerLevel.isHandlingTick()`: true during scheduled ticks and block events. */
  handlingTick = false;
  /** Java `RedStoneWireBlock.shouldSignal` (static): wires do not power each other via blocks. */
  wiresSignal = true;
  /** Redstone torch burnout bookkeeping (`RedstoneTorchBlock.RECENT_TOGGLES`). */
  readonly torchToggles: { pos: Pos; when: number }[] = [];
  /** Sky light 0–15 for daylight detectors (stimulus `set-daylight`). */
  daylight = 15;

  constructor(options: LevelOptions) {
    this.table = new StateTable(options.registry);
    this.AIR = this.table.block('minecraft:air');
    this.GROUND = this.table.block('minecraft:stone');
    this.groundY = options.groundY;
    this.behaviourOf = options.behaviourOf;
    this.createBE = options.createBlockEntity;
    this.updater = new NeighborUpdater(this, options.maxChainedUpdates);
  }

  b(s: BState): Behaviour {
    return (s.behaviour ??= this.behaviourOf(s.id));
  }

  // --- storage ---------------------------------------------------------------------

  getState(pos: Pos): BState {
    const e = this.blocks.get(posKey(pos));
    if (e) return e.state;
    return pos.y <= this.groundY ? this.GROUND : this.AIR;
  }

  /** Implicit ground outside the build: solid, sturdy, but non-conductive and immovable. */
  isVirtualGround(pos: Pos): boolean {
    return pos.y <= this.groundY && !this.blocks.has(posKey(pos));
  }

  /** All explicitly stored, non-air blocks. */
  *storedBlocks(): IterableIterator<{ pos: Pos; state: BState }> {
    for (const e of this.blocks.values()) if (!e.state.isAir) yield e;
  }

  private store(pos: Pos, s: BState): void {
    this.version++;
    const k = posKey(pos);
    if (s.isAir && pos.y > this.groundY) this.blocks.delete(k);
    else this.blocks.set(k, { pos, state: s });
  }

  /** Initial load without any update (like reading a world save). */
  loadBlock(pos: Pos, s: BState): void {
    this.store(pos, s);
    this.ensureBlockEntity(pos, s);
  }

  // --- block entities ----------------------------------------------------------------

  getBlockEntity<T extends BlockEntity>(pos: Pos): T | undefined {
    return this.blockEntities.get(posKey(pos)) as T | undefined;
  }

  setBlockEntity(be: BlockEntity): void {
    const k = posKey(be.pos);
    const old = this.blockEntities.get(k);
    if (old) old.removed = true;
    this.blockEntities.set(k, be);
    if (be.tick) {
      if (this.tickingBlockEntities) this.pendingTickers.push(be);
      else this.tickers.push(be);
    }
  }

  removeBlockEntity(pos: Pos): void {
    const k = posKey(pos);
    const be = this.blockEntities.get(k);
    if (be) {
      be.removed = true;
      this.blockEntities.delete(k);
    }
  }

  private ensureBlockEntity(pos: Pos, s: BState): void {
    if (this.blockEntities.has(posKey(pos))) return;
    const be = this.createBE(this, pos, s);
    if (be) this.setBlockEntity(be);
  }

  // --- setBlock ----------------------------------------------------------------------

  /** Java `Level.setBlock(pos, state, flags, recursionLeft)`. Returns false for no change. */
  setBlock(pos: Pos, s: BState, flags: number, recursionLeft = SHAPE_UPDATE_LIMIT): boolean {
    const old = this.getState(pos);
    if (old === s) return false;
    const moving = (flags & Flags.MOVE_BY_PISTON) !== 0;
    this.store(pos, s);
    // LevelChunk.setBlockState: onRemove, block entity bookkeeping, onPlace.
    this.b(old).onRemove?.(this, pos, old, s, moving);
    if (old.id !== s.id) this.removeBlockEntity(pos);
    if (this.getState(pos) !== s) return true;
    this.ensureBlockEntity(pos, s);
    this.b(s).onPlace?.(this, pos, s, old, moving);
    if (this.getState(pos) !== s) return true;
    // Level.markAndNotifyBlock
    if ((flags & Flags.NEIGHBORS) !== 0) {
      this.updateNeighborsAt(pos, old.id);
      if (hasAnalogOutput(s)) this.updateNeighbourForOutputSignal(pos, s.id);
    }
    if ((flags & Flags.KNOWN_SHAPE) === 0 && recursionLeft > 0) {
      const f = flags & ~(Flags.NEIGHBORS | Flags.SUPPRESS_DROPS);
      this.b(old).updateIndirectNeighbourShapes?.(this, pos, old, f, recursionLeft - 1);
      this.updateNeighbourShapes(s, pos, f, recursionLeft - 1);
      this.b(s).updateIndirectNeighbourShapes?.(this, pos, s, f, recursionLeft - 1);
    }
    return true;
  }

  removeBlock(pos: Pos, moving: boolean): boolean {
    return this.setBlock(pos, this.AIR, Flags.ALL | (moving ? Flags.MOVE_BY_PISTON : 0));
  }

  /** Java `Level.destroyBlock` (drops are not simulated). */
  destroyBlock(pos: Pos, recursionLeft = SHAPE_UPDATE_LIMIT): boolean {
    if (this.getState(pos).isAir) return false;
    return this.setBlock(pos, this.AIR, Flags.ALL, recursionLeft);
  }

  // --- updates -----------------------------------------------------------------------

  updateNeighborsAt(pos: Pos, block: string): void {
    this.updater.updateNeighborsAtExceptFromFacing(pos, block, undefined);
  }

  updateNeighborsAtExceptFromFacing(pos: Pos, block: string, skip: Direction): void {
    this.updater.updateNeighborsAtExceptFromFacing(pos, block, skip);
  }

  neighborChanged(pos: Pos, block: string, from: Pos): void {
    this.updater.neighborChanged(pos, block, from);
  }

  /** Java `BlockStateBase.updateNeighbourShapes`. */
  updateNeighbourShapes(s: BState, pos: Pos, flags: number, recursionLeft: number): void {
    for (const d of SHAPE_UPDATE_ORDER) {
      this.updater.shapeUpdate(opposite(d), s, rel(pos, d), pos, flags, recursionLeft);
    }
  }

  /** Java `Level.neighborShapeChanged` for one neighbour. */
  neighborShapeChanged(
    dir: Direction,
    s: BState,
    pos: Pos,
    neighborPos: Pos,
    flags: number,
    rl: number,
  ): void {
    this.updater.shapeUpdate(dir, s, pos, neighborPos, flags, rl);
  }

  executeNeighborUpdate(
    pos: Pos,
    state: BState | undefined,
    block: string,
    from: Pos,
    moving: boolean,
  ): void {
    this.stats.neighborUpdates++;
    const s = state ?? this.getState(pos);
    this.b(s).neighborChanged?.(this, pos, s, block, from, moving);
  }

  executeShapeUpdate(
    dir: Direction,
    neighbor: BState,
    pos: Pos,
    neighborPos: Pos,
    flags: number,
    rl: number,
  ): void {
    this.stats.shapeUpdates++;
    const old = this.getState(pos);
    const next = this.shapeOf(old, pos, dir, neighbor, neighborPos);
    this.updateOrDestroy(old, next, pos, flags, rl);
  }

  /** `state.updateShape(...)` including the generic support check from registry data. */
  shapeOf(s: BState, pos: Pos, dir: Direction, neighbor: BState, neighborPos: Pos): BState {
    const custom = this.b(s).updateShape;
    if (custom) return custom(this, pos, s, dir, neighbor, neighborPos);
    return this.defaultShape(s, dir, neighbor);
  }

  /** Attached blocks break when the block they hang on can no longer support them. */
  defaultShape(s: BState, dir: Direction, neighbor: BState): BState {
    const sup = supportOf(s);
    if (sup && sup.dir === dir && !survivesOn(s, dir, sup.needs, neighbor)) return this.AIR;
    return s;
  }

  /** Can `s` stay at `pos` with the current neighbours (support only)? */
  canSurvive(s: BState, pos: Pos): boolean {
    const sup = supportOf(s);
    if (!sup) return true;
    return survivesOn(s, sup.dir, sup.needs, this.getState(rel(pos, sup.dir)));
  }

  /** Java `Block.updateOrDestroy`. */
  updateOrDestroy(old: BState, next: BState, pos: Pos, flags: number, rl: number): void {
    if (next === old) return;
    if (next.isAir) this.destroyBlock(pos, rl);
    else this.setBlock(pos, next, flags & ~Flags.SUPPRESS_DROPS, rl);
  }

  /** Java `Block.updateFromNeighbourShapes`. */
  updateFromNeighbourShapes(s: BState, pos: Pos): BState {
    let r = s;
    for (const d of SHAPE_UPDATE_ORDER) {
      const np = rel(pos, d);
      r = this.shapeOf(r, pos, d, this.getState(np), np);
      if (r.isAir) return r;
    }
    return r;
  }

  /** Java `Level.updateNeighbourForOutputSignal`: wakes comparators reading `pos`. */
  updateNeighbourForOutputSignal(pos: Pos, block: string): void {
    for (const d of JAVA_HORIZONTAL) {
      let p = rel(pos, d);
      let s = this.getState(p);
      if (s.is('minecraft:comparator')) {
        this.updater.neighborChangedWithState(s, p, block, pos, false);
      } else if (this.isConductor(p, s)) {
        p = rel(p, d);
        s = this.getState(p);
        if (s.is('minecraft:comparator'))
          this.updater.neighborChangedWithState(s, p, block, pos, false);
      }
    }
  }

  // --- signals -----------------------------------------------------------------------

  isConductor(pos: Pos, s = this.getState(pos)): boolean {
    if (this.isVirtualGround(pos)) return false;
    if (s.conductor === undefined) {
      const custom = this.b(s).conductor;
      s.conductor = custom ? custom(s) : isConductorState(s);
    }
    return s.conductor;
  }

  isSignalSource(s: BState): boolean {
    return this.b(s).isSignalSource?.(s) ?? false;
  }

  /** Weak signal of the block itself (`state.getSignal`), without conduction. */
  blockSignal(pos: Pos, s: BState, dir: Direction): number {
    const f = this.b(s).getSignal;
    return f ? f(this, pos, s, dir) : 0;
  }

  /** Java `Level.getSignal(pos, dir)`: block signal, or strong power of a conductor. */
  getSignal(pos: Pos, dir: Direction): number {
    const s = this.getState(pos);
    const i = this.blockSignal(pos, s, dir);
    if (i >= 15 || !this.isConductor(pos, s)) return i;
    return Math.max(i, this.getDirectSignalTo(pos));
  }

  getDirectSignal(pos: Pos, dir: Direction): number {
    const s = this.getState(pos);
    const f = this.b(s).getDirectSignal;
    return f ? f(this, pos, s, dir) : 0;
  }

  /** Java `getDirectSignalTo`: strongest strong power into `pos` from its six neighbours. */
  getDirectSignalTo(pos: Pos): number {
    let max = 0;
    for (const d of JAVA_DIRECTIONS) {
      const v = this.getDirectSignal(rel(pos, d), d);
      if (v > max) {
        max = v;
        if (max >= 15) return max;
      }
    }
    return max;
  }

  hasSignal(pos: Pos, dir: Direction): boolean {
    return this.getSignal(pos, dir) > 0;
  }

  hasNeighborSignal(pos: Pos): boolean {
    for (const d of JAVA_DIRECTIONS) if (this.getSignal(rel(pos, d), d) > 0) return true;
    return false;
  }

  getBestNeighborSignal(pos: Pos): number {
    let max = 0;
    for (const d of JAVA_DIRECTIONS) {
      const v = this.getSignal(rel(pos, d), d);
      if (v >= 15) return 15;
      if (v > max) max = v;
    }
    return max;
  }

  /** Java `SignalGetter.getControlInputSignal` (diode side inputs). */
  getControlInputSignal(pos: Pos, dir: Direction, diodesOnly: boolean): number {
    const s = this.getState(pos);
    if (diodesOnly) {
      return s.is('minecraft:repeater') || s.is('minecraft:comparator')
        ? this.getDirectSignal(pos, dir)
        : 0;
    }
    if (s.is('minecraft:redstone_block')) return 15;
    if (s.is('minecraft:redstone_wire')) return s.int('power');
    return this.isSignalSource(s) ? this.getDirectSignal(pos, dir) : 0;
  }

  // --- scheduling --------------------------------------------------------------------

  scheduleTick(
    pos: Pos,
    block: string,
    delay: number,
    priority: number = TickPriority.NORMAL,
  ): void {
    this.ticks.schedule(pos, block, this.gameTime + delay, priority);
  }

  hasScheduledTick(pos: Pos, block: string): boolean {
    return this.ticks.hasScheduledTick(pos, block);
  }

  willTickThisTick(pos: Pos, block: string): boolean {
    return this.ticks.willTickThisTick(pos, block);
  }

  blockEvent(pos: Pos, block: string, id: number, param: number): void {
    const k = `${posKey(pos)}|${block}|${id}|${param}`;
    if (this.eventKeys.has(k)) return;
    this.eventKeys.add(k);
    this.events.push({ pos, block, id, param });
  }

  /** Is anything left to do (pending ticks, events, moving blocks)? */
  get busy(): boolean {
    if (this.ticks.size > 0 || this.events.length > 0) return true;
    for (const be of this.tickers) if (!be.removed && be.busy?.(this)) return true;
    return false;
  }

  // --- game tick ---------------------------------------------------------------------

  /** One game tick. */
  step(): void {
    this.gameTime++;
    this.handlingTick = true;
    try {
      this.ticks.run(this.gameTime, (t) => {
        const s = this.getState(t.pos);
        if (s.id === t.block) this.b(s).tick?.(this, t.pos, s);
      });
      this.runBlockEvents();
    } finally {
      this.handlingTick = false;
    }
    this.tickBlockEntities();
  }

  private runBlockEvents(): void {
    while (this.events.length > 0) {
      const e = this.events.shift() as BlockEvent;
      this.eventKeys.delete(`${posKey(e.pos)}|${e.block}|${e.id}|${e.param}`);
      const s = this.getState(e.pos);
      if (s.id === e.block) this.b(s).triggerEvent?.(this, e.pos, s, e.id, e.param);
    }
  }

  private tickBlockEntities(): void {
    this.tickingBlockEntities = true;
    if (this.pendingTickers.length > 0) {
      this.tickers.push(...this.pendingTickers);
      this.pendingTickers = [];
    }
    for (const be of this.tickers) if (!be.removed) be.tick?.(this);
    this.tickers = this.tickers.filter((be) => !be.removed);
    this.tickingBlockEntities = false;
  }
}
