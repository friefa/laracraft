import type { Direction } from '@laracraft/core-model';
import { Flags, SHAPE_UPDATE_LIMIT, type BlockEntity, type Level } from '../core/level';
import { javaHashOrder } from '../core/java-hash';
import {
  DATA_3D,
  FROM_3D,
  JAVA_DIRECTIONS,
  above,
  axisOf,
  opposite,
  posKey,
  type PosKey,
  rel,
  samePos,
  type Pos,
} from '../core/pos';
import type { BState } from '../core/state';
import type { Behaviour, PushReaction } from './behaviour';
import { basePushReaction, hasBlockEntity } from './properties';

/**
 * Pistons and sticky pistons, Java Edition (`PistonBaseBlock`, `PistonStructureResolver`,
 * `PistonHeadBlock`, `MovingPistonBlock`, `PistonMovingBlockEntity`).
 *
 * - Activation: powered from any side except the front, or quasi-connectivity: a signal into
 *   the block above the piston (also when that block is air) counts, but the piston only
 *   reacts when it receives a block update (BUD). Source: https://minecraft.wiki/w/Quasi-connectivity
 *   and https://minecraft.wiki/w/Piston#Quasi-connectivity
 * - Extension/retraction is a block event (processed after scheduled ticks); moving blocks are
 *   `moving_piston` block entities that finish 2 gt later (0 → 0.5 → 1 progress, placed in the
 *   third block-entity tick). Source: https://minecraft.wiki/w/Piston#Behavior ("The extension
 *   takes 2 game ticks"), https://minecraft.wiki/w/Moving_Piston
 * - Push limit 12, immovable blocks (obsidian, extended pistons, block entities, piston heads),
 *   blocks that break (dust, torches, diodes, buttons, doors …), slime/honey drag adjacent
 *   blocks but not each other. Source: https://minecraft.wiki/w/Piston#Behavior,
 *   https://minecraft.wiki/w/Slime_Block, https://minecraft.wiki/w/Honey_Block
 * - Sticky piston de-powered while its push is still in progress (≤ 1 rt pulse) retracts with
 *   event type 2 and leaves the block behind ("block dropping").
 *   Source: https://minecraft.wiki/w/Sticky_Piston (block dropping)
 */
export const PISTON = 'minecraft:piston';
export const STICKY_PISTON = 'minecraft:sticky_piston';
export const PISTON_HEAD = 'minecraft:piston_head';
export const MOVING_PISTON = 'minecraft:moving_piston';

const MAX_PUSH = 12;

const isPistonBase = (s: BState): boolean => s.is(PISTON) || s.is(STICKY_PISTON);
const facingOf = (s: BState): Direction => s.get('facing') as Direction;

export function pushReactionOf(level: Level, s: BState): PushReaction {
  const custom = level.b(s).pushReaction;
  return custom ? custom(s) : basePushReaction(s);
}

/** Java `PistonBaseBlock.isPushable`. */
export function isPushable(
  level: Level,
  s: BState,
  pos: Pos,
  moveDir: Direction,
  allowDestroy: boolean,
  pistonFacing: Direction,
): boolean {
  if (level.isVirtualGround(pos)) return false;
  if (s.isAir) return true;
  if (!isPistonBase(s)) {
    switch (pushReactionOf(level, s)) {
      case 'block':
        return false;
      case 'destroy':
        return allowDestroy;
      case 'push_only':
        return moveDir === pistonFacing;
      default:
        break;
    }
  } else if (s.bool('extended')) {
    return false;
  }
  return !hasBlockEntity(s);
}

const isSticky = (s: BState): boolean =>
  s.is('minecraft:slime_block') || s.is('minecraft:honey_block');

function canStickToEachOther(a: BState, b: BState): boolean {
  if (a.is('minecraft:honey_block') && b.is('minecraft:slime_block')) return false;
  if (a.is('minecraft:slime_block') && b.is('minecraft:honey_block')) return false;
  return isSticky(a) || isSticky(b);
}

const indexOfPos = (list: readonly Pos[], p: Pos): number => list.findIndex((q) => samePos(q, p));

/** Java `PistonStructureResolver`. */
export class PistonStructureResolver {
  readonly toPush: Pos[] = [];
  readonly toDestroy: Pos[] = [];
  private readonly pushDirection: Direction;
  private readonly startPos: Pos;

  constructor(
    private readonly level: Level,
    private readonly pistonPos: Pos,
    private readonly pistonDirection: Direction,
    extending: boolean,
  ) {
    this.pushDirection = extending ? pistonDirection : opposite(pistonDirection);
    this.startPos = extending
      ? rel(pistonPos, pistonDirection)
      : rel(pistonPos, pistonDirection, 2);
    this.extending = extending;
  }

  private readonly extending: boolean;

  resolve(): boolean {
    this.toPush.length = 0;
    this.toDestroy.length = 0;
    const s = this.level.getState(this.startPos);
    if (
      !isPushable(this.level, s, this.startPos, this.pushDirection, false, this.pistonDirection)
    ) {
      if (this.extending && pushReactionOf(this.level, s) === 'destroy') {
        this.toDestroy.push(this.startPos);
        return true;
      }
      return false;
    }
    if (!this.addBlockLine(this.startPos, this.pushDirection)) return false;
    for (let i = 0; i < this.toPush.length; i++) {
      const p = this.toPush[i] as Pos;
      if (isSticky(this.level.getState(p)) && !this.addBranchingBlocks(p)) return false;
    }
    return true;
  }

  private addBlockLine(fromPos: Pos, dir: Direction): boolean {
    let s = this.level.getState(fromPos);
    if (s.isAir) return true;
    if (!isPushable(this.level, s, fromPos, this.pushDirection, false, dir)) return true;
    if (samePos(fromPos, this.pistonPos)) return true;
    if (indexOfPos(this.toPush, fromPos) >= 0) return true;
    let i = 1;
    if (i + this.toPush.length > MAX_PUSH) return false;
    const back = opposite(this.pushDirection);
    while (isSticky(s)) {
      const p = rel(fromPos, back, i);
      const prev = s;
      s = this.level.getState(p);
      if (
        s.isAir ||
        !canStickToEachOther(prev, s) ||
        !isPushable(this.level, s, p, this.pushDirection, false, back) ||
        samePos(p, this.pistonPos)
      ) {
        break;
      }
      if (++i + this.toPush.length > MAX_PUSH) return false;
    }
    let j = 0;
    for (let k = i - 1; k >= 0; k--) {
      this.toPush.push(rel(fromPos, back, k));
      j++;
    }
    for (let k = 1; ; k++) {
      const p = rel(fromPos, this.pushDirection, k);
      const l = indexOfPos(this.toPush, p);
      if (l > -1) {
        this.reorderListAtCollision(j, l);
        for (let m = 0; m <= l + j; m++) {
          const p2 = this.toPush[m] as Pos;
          if (isSticky(this.level.getState(p2)) && !this.addBranchingBlocks(p2)) return false;
        }
        return true;
      }
      s = this.level.getState(p);
      if (s.isAir) return true;
      if (
        !isPushable(this.level, s, p, this.pushDirection, true, this.pushDirection) ||
        samePos(p, this.pistonPos)
      ) {
        return false;
      }
      if (pushReactionOf(this.level, s) === 'destroy') {
        this.toDestroy.push(p);
        return true;
      }
      if (this.toPush.length >= MAX_PUSH) return false;
      this.toPush.push(p);
      j++;
    }
  }

  private reorderListAtCollision(a: number, b: number): void {
    const l1 = this.toPush.slice(0, b);
    const l2 = this.toPush.slice(this.toPush.length - a);
    const l3 = this.toPush.slice(b, this.toPush.length - a);
    this.toPush.length = 0;
    this.toPush.push(...l1, ...l2, ...l3);
  }

  private addBranchingBlocks(pos: Pos): boolean {
    const s = this.level.getState(pos);
    for (const d of JAVA_DIRECTIONS) {
      if (axisOf(d) === axisOf(this.pushDirection)) continue;
      const p = rel(pos, d);
      if (canStickToEachOther(this.level.getState(p), s) && !this.addBlockLine(p, d)) return false;
    }
    return true;
  }
}

/** Java `PistonMovingBlockEntity`. */
export class MovingPistonEntity implements BlockEntity {
  readonly kind = 'moving_piston';
  removed = false;
  progress = 0;
  progressO = 0;
  lastTicked = 0;

  constructor(
    readonly pos: Pos,
    readonly movedState: BState,
    readonly direction: Direction,
    readonly extending: boolean,
    readonly isSourcePiston: boolean,
  ) {}

  tick(level: Level): void {
    this.lastTicked = level.gameTime;
    this.progressO = this.progress;
    if (this.progressO >= 1) {
      level.removeBlockEntity(this.pos);
      this.removed = true;
      if (level.getState(this.pos).is(MOVING_PISTON)) {
        let s = level.updateFromNeighbourShapes(this.movedState, this.pos);
        if (s.isAir) {
          level.setBlock(
            this.pos,
            this.movedState,
            Flags.MOVE_BY_PISTON | Flags.KNOWN_SHAPE | Flags.INVISIBLE,
          );
          level.updateOrDestroy(this.movedState, s, this.pos, Flags.ALL, SHAPE_UPDATE_LIMIT);
        } else {
          if (s.bool('waterlogged')) s = s.with('waterlogged', false);
          level.setBlock(this.pos, s, Flags.MOVE_BY_PISTON | Flags.CLIENTS | Flags.NEIGHBORS);
          level.neighborChanged(this.pos, s.id, this.pos);
        }
      }
      return;
    }
    this.progress = Math.min(1, this.progress + 0.5);
  }

  /** Java `finalTick`: finish the move immediately (only if not yet complete). */
  finalTick(level: Level): void {
    if (this.progressO >= 1) return;
    this.progress = 1;
    this.progressO = 1;
    level.removeBlockEntity(this.pos);
    this.removed = true;
    if (level.getState(this.pos).is(MOVING_PISTON)) {
      const s = this.isSourcePiston
        ? level.AIR
        : level.updateFromNeighbourShapes(this.movedState, this.pos);
      level.setBlock(this.pos, s, Flags.ALL);
      level.neighborChanged(this.pos, s.id, this.pos);
    }
  }

  busy(): boolean {
    return !this.removed;
  }
}

const movingEntityAt = (level: Level, pos: Pos): MovingPistonEntity | undefined => {
  const be = level.getBlockEntity(pos);
  return be instanceof MovingPistonEntity ? be : undefined;
};

/** Java `PistonBaseBlock.getNeighborSignal`, including quasi-connectivity. */
export function pistonNeighborSignal(level: Level, pos: Pos, facing: Direction): boolean {
  for (const d of JAVA_DIRECTIONS) if (d !== facing && level.hasSignal(rel(pos, d), d)) return true;
  if (level.hasSignal(pos, 'down')) return true;
  const up = above(pos);
  for (const d of JAVA_DIRECTIONS) if (d !== 'down' && level.hasSignal(rel(up, d), d)) return true;
  return false;
}

function checkIfExtend(level: Level, pos: Pos, s: BState): void {
  const dir = facingOf(s);
  const powered = pistonNeighborSignal(level, pos, dir);
  if (powered && !s.bool('extended')) {
    if (new PistonStructureResolver(level, pos, dir, true).resolve()) {
      level.blockEvent(pos, s.id, 0, DATA_3D[dir]);
    }
  } else if (!powered && s.bool('extended')) {
    const p2 = rel(pos, dir, 2);
    const s2 = level.getState(p2);
    let type = 1;
    if (s2.is(MOVING_PISTON) && s2.get('facing') === dir) {
      const be = movingEntityAt(level, p2);
      if (
        be &&
        be.extending &&
        (be.progressO < 0.5 || level.gameTime === be.lastTicked || level.handlingTick)
      ) {
        type = 2;
      }
    }
    level.blockEvent(pos, s.id, type, DATA_3D[dir]);
  }
}

function moveBlocks(
  level: Level,
  pos: Pos,
  dir: Direction,
  extending: boolean,
  sticky: boolean,
): boolean {
  const headPos = rel(pos, dir);
  if (!extending && level.getState(headPos).is(PISTON_HEAD)) {
    level.setBlock(headPos, level.AIR, Flags.KNOWN_SHAPE | Flags.INVISIBLE);
  }
  const r = new PistonStructureResolver(level, pos, dir, extending);
  if (!r.resolve()) return false;
  const toPush = r.toPush;
  const toDestroy = r.toDestroy;
  const pushedStates = toPush.map((p) => level.getState(p));
  // HashMap<BlockPos, BlockState> of positions to clear afterwards.
  const map = new Map<PosKey, { pos: Pos; state: BState }>();
  toPush.forEach((p, i) => map.set(posKey(p), { pos: p, state: pushedStates[i] as BState }));
  const states: BState[] = [];
  const moveDir = extending ? dir : opposite(dir);

  for (let k = toDestroy.length - 1; k >= 0; k--) {
    const p = toDestroy[k] as Pos;
    const st = level.getState(p);
    level.setBlock(p, level.AIR, Flags.KNOWN_SHAPE | Flags.CLIENTS);
    states.push(st);
  }
  for (let k = toPush.length - 1; k >= 0; k--) {
    const from = toPush[k] as Pos;
    const st = level.getState(from);
    const to = rel(from, moveDir);
    map.delete(posKey(to));
    const moving = level.table.of(MOVING_PISTON, { facing: dir, type: 'normal' });
    level.setBlock(to, moving, Flags.MOVE_BY_PISTON | Flags.INVISIBLE);
    level.setBlockEntity(
      new MovingPistonEntity(to, pushedStates[k] as BState, dir, extending, false),
    );
    states.push(st);
  }
  if (extending) {
    const type = sticky ? 'sticky' : 'normal';
    const head = level.table.of(PISTON_HEAD, { facing: dir, type, short: 'false' });
    const moving = level.table.of(MOVING_PISTON, { facing: dir, type });
    map.delete(posKey(headPos));
    level.setBlock(headPos, moving, Flags.MOVE_BY_PISTON | Flags.INVISIBLE);
    level.setBlockEntity(new MovingPistonEntity(headPos, head, dir, true, true));
  }
  const remaining = javaHashOrder(
    toPush.filter((p) => map.has(posKey(p))),
    toPush.length,
  );
  for (const p of remaining) {
    level.setBlock(p, level.AIR, Flags.MOVE_BY_PISTON | Flags.KNOWN_SHAPE | Flags.CLIENTS);
  }
  for (const p of remaining) {
    const old = (map.get(posKey(p)) as { state: BState }).state;
    level.b(old).updateIndirectNeighbourShapes?.(level, p, old, Flags.CLIENTS, SHAPE_UPDATE_LIMIT);
    level.updateNeighbourShapes(level.AIR, p, Flags.CLIENTS, SHAPE_UPDATE_LIMIT);
  }
  let j = 0;
  for (let k = toDestroy.length - 1; k >= 0; k--) {
    const st = states[j++] as BState;
    const p = toDestroy[k] as Pos;
    level.b(st).updateIndirectNeighbourShapes?.(level, p, st, Flags.CLIENTS, SHAPE_UPDATE_LIMIT);
    level.updateNeighborsAt(p, st.id);
  }
  for (let k = toPush.length - 1; k >= 0; k--) {
    level.updateNeighborsAt(toPush[k] as Pos, (states[j++] as BState).id);
  }
  if (extending) level.updateNeighborsAt(headPos, PISTON_HEAD);
  return true;
}

export const pistonBehaviour: Behaviour = {
  conductor: () => false,
  pushReaction: () => 'block',
  neighborChanged(level, pos, s) {
    checkIfExtend(level, pos, s);
  },
  onPlace(level, pos, s, old) {
    if (!old.is(s.id) && !level.getBlockEntity(pos)) checkIfExtend(level, pos, s);
  },
  setPlacedBy(level, pos, s) {
    checkIfExtend(level, pos, s);
  },
  triggerEvent(level, pos, s, id, param) {
    const dir = facingOf(s);
    const extendedState = s.with('extended', true);
    const powered = pistonNeighborSignal(level, pos, dir);
    if (powered && (id === 1 || id === 2)) {
      level.setBlock(pos, extendedState, Flags.CLIENTS);
      return false;
    }
    if (!powered && id === 0) return false;
    const sticky = s.is(STICKY_PISTON);
    if (id === 0) {
      if (!moveBlocks(level, pos, dir, true, sticky)) return false;
      level.setBlock(pos, extendedState, Flags.MOVE_BY_PISTON | Flags.CLIENTS | Flags.NEIGHBORS);
      return true;
    }
    // Retraction (id 1 = normal, id 2 = the push in front is still in progress).
    movingEntityAt(level, rel(pos, dir))?.finalTick(level);
    const moving = level.table.of(MOVING_PISTON, {
      facing: dir,
      type: sticky ? 'sticky' : 'normal',
    });
    level.setBlock(pos, moving, Flags.KNOWN_SHAPE | Flags.INVISIBLE);
    const base = level.table.of(s.id, { facing: FROM_3D[param & 7] ?? dir, extended: 'false' });
    level.setBlockEntity(new MovingPistonEntity(pos, base, dir, false, true));
    level.updateNeighborsAt(pos, MOVING_PISTON);
    level.updateNeighbourShapes(moving, pos, Flags.CLIENTS, SHAPE_UPDATE_LIMIT);
    if (sticky) {
      const p2 = rel(pos, dir, 2);
      const s2 = level.getState(p2);
      let dropped = false;
      if (s2.is(MOVING_PISTON)) {
        const be = movingEntityAt(level, p2);
        if (be && be.direction === dir && be.extending) {
          be.finalTick(level);
          dropped = true;
        }
      }
      if (!dropped) {
        const reaction = pushReactionOf(level, s2);
        if (
          id !== 1 ||
          s2.isAir ||
          !isPushable(level, s2, p2, opposite(dir), false, dir) ||
          (reaction !== 'normal' && !isPistonBase(s2))
        ) {
          level.removeBlock(rel(pos, dir), false);
        } else {
          moveBlocks(level, pos, dir, false, true);
        }
      }
    } else {
      level.removeBlock(rel(pos, dir), false);
    }
    return true;
  },
};

function headCanSurvive(level: Level, pos: Pos, s: BState): boolean {
  const base = level.getState(rel(pos, opposite(facingOf(s))));
  const want = s.get('type') === 'sticky' ? STICKY_PISTON : PISTON;
  const fitting = base.is(want) && base.bool('extended') && base.get('facing') === s.get('facing');
  return fitting || (base.is(MOVING_PISTON) && base.get('facing') === s.get('facing'));
}

export const pistonHeadBehaviour: Behaviour = {
  conductor: () => false,
  pushReaction: () => 'block',
  updateShape(level, pos, s, dir) {
    return opposite(dir) === facingOf(s) && !headCanSurvive(level, pos, s) ? level.AIR : s;
  },
  neighborChanged(level, pos, s, fromBlock, fromPos) {
    if (headCanSurvive(level, pos, s))
      level.neighborChanged(rel(pos, opposite(facingOf(s))), fromBlock, fromPos);
  },
  onRemove(level, pos, s, next) {
    if (next.is(s.id)) return;
    const bp = rel(pos, opposite(facingOf(s)));
    const base = level.getState(bp);
    const want = s.get('type') === 'sticky' ? STICKY_PISTON : PISTON;
    if (base.is(want) && base.bool('extended') && base.get('facing') === s.get('facing'))
      level.destroyBlock(bp);
  },
};

export const movingPistonBehaviour: Behaviour = {
  conductor: () => false,
  pushReaction: () => 'block',
  onRemove(level, pos, s, next) {
    if (!next.is(s.id)) movingEntityAt(level, pos)?.finalTick(level);
  },
};
