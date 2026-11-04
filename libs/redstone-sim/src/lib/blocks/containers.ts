import type { Direction } from '@laracraft/core-model';
import { Flags, type BlockEntity, type Level } from '../core/level';
import { above, clockWise, counterClockWise, opposite, rel, type Pos } from '../core/pos';
import type { BState } from '../core/state';
import type { Behaviour } from './behaviour';

/**
 * Containers, hoppers, droppers and dispensers, Java Edition.
 *
 * - Comparator reading: `floor(1 + 14 · Σ(count / maxStack) / slots)` for a non-empty
 *   container, 0 when empty (`AbstractContainerMenu.getRedstoneSignalFromContainer`,
 *   `Mth.lerpDiscrete`). A chest with a conductive block on top reads 0.
 *   Source: https://minecraft.wiki/w/Redstone_Comparator#Measure_block_state
 * - Hopper: 8 gt transfer cooldown (2.5 items/s), pushes one item into the container it faces,
 *   then pulls one item from the container above; disabled ("locked") while powered.
 *   A hopper receiving an item while empty from a hopper that already ticked this game tick
 *   gets 7 gt instead of 8. Source: https://minecraft.wiki/w/Hopper#Behavior
 * - Dropper/dispenser: on a rising edge of power (incl. quasi-connectivity from above) they
 *   schedule a tick 4 gt later and then fire one random non-empty slot. A dropper moves one
 *   item into the container in front of it.
 *   Source: https://minecraft.wiki/w/Dropper#Behavior, https://minecraft.wiki/w/Dispenser
 */

export interface ItemStack {
  item: string;
  count: number;
}

const MAX_1 =
  /(_sword|_pickaxe|_axe|_shovel|_hoe|_helmet|_chestplate|_leggings|_boots|_boat|minecart|potion)$/;
const ONE = new Set([
  'minecraft:water_bucket',
  'minecraft:lava_bucket',
  'minecraft:milk_bucket',
  'minecraft:shears',
  'minecraft:flint_and_steel',
  'minecraft:bow',
  'minecraft:crossbow',
  'minecraft:trident',
  'minecraft:saddle',
  'minecraft:shield',
  'minecraft:elytra',
  'minecraft:fishing_rod',
  'minecraft:totem_of_undying',
  'minecraft:enchanted_book',
]);
const SIXTEEN = new Set([
  'minecraft:bucket',
  'minecraft:ender_pearl',
  'minecraft:snowball',
  'minecraft:egg',
  'minecraft:honey_bottle',
  'minecraft:armor_stand',
  'minecraft:written_book',
]);

/** Java max stack size of an item (subset of the item registry; default 64). */
export function maxStackSize(item: string): number {
  if (ONE.has(item) || MAX_1.test(item)) return 1;
  if (SIXTEEN.has(item) || item.endsWith('_sign') || item.endsWith('_banner')) return 16;
  return 64;
}

const FUELS = /(coal|charcoal|_planks|_log|stick|blaze_rod|lava_bucket|coal_block)$/;

/** A container view (one block entity or a double chest). */
export interface Inventory {
  readonly size: number;
  get(slot: number): ItemStack | null;
  set(slot: number, stack: ItemStack | null): void;
  /** Java `WorldlyContainer.getSlotsForFace` (undefined = all slots). */
  slotsForFace?(dir: Direction): readonly number[];
  canPlaceThroughFace?(slot: number, item: string, dir: Direction | undefined): boolean;
  canTakeThroughFace?(slot: number, item: string, dir: Direction): boolean;
  setChanged(level: Level): void;
  readonly hopper?: HopperEntity;
}

export class ContainerEntity implements BlockEntity, Inventory {
  removed = false;
  readonly slots: (ItemStack | null)[];

  constructor(
    readonly pos: Pos,
    readonly blockId: string,
    readonly size: number,
  ) {
    this.slots = Array.from({ length: size }, () => null);
  }

  get(slot: number): ItemStack | null {
    return this.slots[slot] ?? null;
  }

  set(slot: number, stack: ItemStack | null): void {
    this.slots[slot] = stack && stack.count > 0 ? stack : null;
  }

  /** Java `BlockEntity.setChanged`: comparators reading this block are updated. */
  setChanged(level: Level): void {
    level.updateNeighbourForOutputSignal(this.pos, level.getState(this.pos).id);
  }
}

/** Furnace: input from the top (slot 0), fuel from the sides (slot 1), output below (slot 2). */
export class FurnaceEntity extends ContainerEntity {
  slotsForFace(dir: Direction): readonly number[] {
    return dir === 'down' ? [2, 1] : dir === 'up' ? [0] : [1];
  }
  canPlaceThroughFace(slot: number, item: string): boolean {
    if (slot === 2) return false;
    if (slot === 1) return FUELS.test(item) || item === 'minecraft:bucket';
    return true;
  }
  canTakeThroughFace(slot: number, item: string, dir: Direction): boolean {
    return (
      !(dir === 'down' && slot === 1) ||
      item === 'minecraft:water_bucket' ||
      item === 'minecraft:bucket'
    );
  }
}

export class HopperEntity extends ContainerEntity {
  cooldown = -1;
  tickedGameTime = 0;
  private lastMove = Number.NEGATIVE_INFINITY;

  get hopper(): HopperEntity {
    return this;
  }

  /** Java `HopperBlockEntity.pushItemsTick`. */
  tick(level: Level): void {
    this.cooldown--;
    this.tickedGameTime = level.gameTime;
    if (this.cooldown > 0) return;
    this.cooldown = 0;
    const s = level.getState(this.pos);
    if (!s.is(HOPPER) || !s.bool('enabled')) return;
    let moved = false;
    if (!isEmpty(this)) moved = ejectItems(level, this, s);
    if (!isFull(this, undefined)) moved = suckInItems(level, this) || moved;
    if (moved) {
      this.cooldown = 8;
      this.lastMove = level.gameTime;
      this.setChanged(level);
    }
  }

  busy(level: Level): boolean {
    return level.gameTime - this.lastMove <= 8 || this.cooldown > 0;
  }
}

/** Double chest view (`CompoundContainer`): the `type=right` half holds slots 0–26. */
class CompoundInventory implements Inventory {
  readonly size: number;
  constructor(
    private readonly first: ContainerEntity,
    private readonly second: ContainerEntity,
  ) {
    this.size = first.size + second.size;
  }
  private part(slot: number): [ContainerEntity, number] {
    return slot < this.first.size ? [this.first, slot] : [this.second, slot - this.first.size];
  }
  get(slot: number): ItemStack | null {
    const [c, i] = this.part(slot);
    return c.get(i);
  }
  set(slot: number, stack: ItemStack | null): void {
    const [c, i] = this.part(slot);
    c.set(i, stack);
  }
  setChanged(level: Level): void {
    this.first.setChanged(level);
    this.second.setChanged(level);
  }
}

export const HOPPER = 'minecraft:hopper';
export const CHEST = 'minecraft:chest';

const CONTAINER_SIZES: Readonly<Record<string, number>> = {
  'minecraft:chest': 27,
  'minecraft:barrel': 27,
  'minecraft:hopper': 5,
  'minecraft:dispenser': 9,
  'minecraft:dropper': 9,
  'minecraft:furnace': 3,
};

export function createContainerEntity(pos: Pos, s: BState): ContainerEntity | undefined {
  const size = CONTAINER_SIZES[s.id];
  if (size === undefined) return undefined;
  if (s.is(HOPPER)) return new HopperEntity(pos, s.id, size);
  if (s.is('minecraft:furnace')) return new FurnaceEntity(pos, s.id, size);
  return new ContainerEntity(pos, s.id, size);
}

/** The other half of a double chest, if paired. */
function chestNeighbor(level: Level, pos: Pos, s: BState): Pos | undefined {
  const type = s.get('type');
  if (type !== 'left' && type !== 'right') return undefined;
  const f = s.get('facing') as Direction;
  const p = rel(pos, type === 'left' ? clockWise(f) : counterClockWise(f));
  const o = level.getState(p);
  if (!o.is(CHEST) || o.get('facing') !== f || o.get('type') === type || o.get('type') === 'single')
    return undefined;
  return p;
}

const chestBlocked = (level: Level, pos: Pos): boolean => level.isConductor(above(pos));

/**
 * Java `HopperBlockEntity.getContainerAt` (block containers only; entities are not simulated).
 * `ignoreBlocked=false` is the comparator view of chests.
 */
export function getContainerAt(
  level: Level,
  pos: Pos,
  ignoreBlocked = true,
): Inventory | undefined {
  const s = level.getState(pos);
  const be = level.getBlockEntity<ContainerEntity>(pos);
  if (!(be instanceof ContainerEntity)) return undefined;
  if (!s.is(CHEST)) return be;
  if (!ignoreBlocked && chestBlocked(level, pos)) return undefined;
  const np = chestNeighbor(level, pos, s);
  if (!np) return be;
  if (!ignoreBlocked && chestBlocked(level, np)) return undefined;
  const other = level.getBlockEntity<ContainerEntity>(np);
  if (!(other instanceof ContainerEntity)) return be;
  return s.get('type') === 'right'
    ? new CompoundInventory(be, other)
    : new CompoundInventory(other, be);
}

/** Java comparator signal of a container (float arithmetic like the game). */
export function containerSignal(inv: Inventory | undefined): number {
  if (!inv) return 0;
  const f32 = Math.fround;
  let f = 0;
  for (let i = 0; i < inv.size; i++) {
    const st = inv.get(i);
    if (st) f = f32(f + f32(st.count / Math.min(64, maxStackSize(st.item))));
  }
  f = f32(f / inv.size);
  return Math.floor(f32(f * 14)) + (f > 0 ? 1 : 0);
}

/** Analog (comparator) output of the block at `pos`, or undefined if it has none. */
export function analogOutputAt(level: Level, pos: Pos, s: BState): number | undefined {
  if (s.is('minecraft:detector_rail')) return 0;
  if (CONTAINER_SIZES[s.id] === undefined) return undefined;
  return containerSignal(getContainerAt(level, pos, false));
}

const isEmpty = (inv: Inventory): boolean => {
  for (let i = 0; i < inv.size; i++) if (inv.get(i)) return false;
  return true;
};

const slotsOf = (inv: Inventory, dir: Direction | undefined): readonly number[] =>
  dir && inv.slotsForFace ? inv.slotsForFace(dir) : Array.from({ length: inv.size }, (_, i) => i);

function isFull(inv: Inventory, dir: Direction | undefined): boolean {
  for (const i of slotsOf(inv, dir)) {
    const st = inv.get(i);
    if (!st || st.count < Math.min(64, maxStackSize(st.item))) return false;
  }
  return true;
}

/** Java `HopperBlockEntity.addItem(source, dest, stack, dir)`; returns what did not fit. */
export function addItem(
  level: Level,
  source: Inventory | undefined,
  dest: Inventory,
  stack: ItemStack,
  dir: Direction | undefined,
): ItemStack | null {
  let rest: ItemStack | null = { ...stack };
  for (const slot of slotsOf(dest, dir)) {
    if (!rest) break;
    rest = tryMoveInItem(level, source, dest, rest, slot, dir);
  }
  return rest;
}

function tryMoveInItem(
  level: Level,
  source: Inventory | undefined,
  dest: Inventory,
  stack: ItemStack,
  slot: number,
  dir: Direction | undefined,
): ItemStack | null {
  if (dest.canPlaceThroughFace && !dest.canPlaceThroughFace(slot, stack.item, dir)) return stack;
  const t = dest.get(slot);
  const wasEmpty = isEmpty(dest);
  let moved = false;
  let rest: ItemStack | null = stack;
  if (!t) {
    dest.set(slot, { ...stack });
    rest = null;
    moved = true;
  } else if (t.item === stack.item) {
    const room = Math.min(64, maxStackSize(stack.item)) - t.count;
    const n = Math.min(stack.count, Math.max(0, room));
    if (n > 0) {
      t.count += n;
      rest = stack.count - n > 0 ? { item: stack.item, count: stack.count - n } : null;
      moved = true;
    }
  }
  if (moved) {
    const h = dest.hopper;
    if (wasEmpty && h) {
      const src = source?.hopper;
      const k = src && h.tickedGameTime >= src.tickedGameTime ? 1 : 0;
      h.cooldown = 8 - k;
    }
    dest.setChanged(level);
  }
  return rest;
}

function ejectItems(level: Level, hopper: HopperEntity, s: BState): boolean {
  const facing = s.get('facing') as Direction;
  const target = getContainerAt(level, rel(hopper.pos, facing));
  if (!target) return false;
  const d = opposite(facing);
  if (isFull(target, d)) return false;
  for (let i = 0; i < hopper.size; i++) {
    const st = hopper.get(i);
    if (!st) continue;
    const before = st.count;
    hopper.set(i, before > 1 ? { item: st.item, count: before - 1 } : null);
    const rest = addItem(level, hopper, target, { item: st.item, count: 1 }, d);
    if (!rest) {
      target.setChanged(level);
      return true;
    }
    hopper.set(i, { item: st.item, count: before });
  }
  return false;
}

function suckInItems(level: Level, hopper: HopperEntity): boolean {
  const source = getContainerAt(level, above(hopper.pos));
  if (!source) return false;
  for (const slot of slotsOf(source, 'down')) {
    const st = source.get(slot);
    if (!st) continue;
    if (source.canTakeThroughFace && !source.canTakeThroughFace(slot, st.item, 'down')) continue;
    const before = st.count;
    source.set(slot, before > 1 ? { item: st.item, count: before - 1 } : null);
    const rest = addItem(level, source, hopper, { item: st.item, count: 1 }, undefined);
    if (!rest) {
      source.setChanged(level);
      return true;
    }
    source.set(slot, { item: st.item, count: before });
  }
  return false;
}

/** Player inserts items (like shift-clicking into the GUI): merge first, then empty slots. */
export function insertItems(level: Level, pos: Pos, item: string, count: number): number {
  const inv = getContainerAt(level, pos);
  if (!inv) return 0;
  const max = Math.min(64, maxStackSize(item));
  let left = count;
  for (let i = 0; i < inv.size && left > 0; i++) {
    const st = inv.get(i);
    if (st && st.item === item && st.count < max) {
      const n = Math.min(left, max - st.count);
      st.count += n;
      left -= n;
    }
  }
  for (let i = 0; i < inv.size && left > 0; i++) {
    if (inv.get(i)) continue;
    if (inv.canPlaceThroughFace && !inv.canPlaceThroughFace(i, item, undefined)) continue;
    const n = Math.min(left, max);
    inv.set(i, { item, count: n });
    left -= n;
  }
  if (left !== count) inv.setChanged(level);
  return count - left;
}

// --- block behaviours --------------------------------------------------------------------

function checkHopperPower(level: Level, pos: Pos, s: BState): void {
  const enabled = !level.hasNeighborSignal(pos);
  if (enabled !== s.bool('enabled')) level.setBlock(pos, s.with('enabled', enabled), Flags.CLIENTS);
}

export const hopperBehaviour: Behaviour = {
  neighborChanged(level, pos, s) {
    checkHopperPower(level, pos, s);
  },
  onPlace(level, pos, s, old) {
    if (!old.is(s.id)) checkHopperPower(level, pos, s);
  },
  placementState(level, pos, s) {
    return s.with('enabled', !level.hasNeighborSignal(pos));
  },
};

export const containerBehaviour: Behaviour = {};

/** Java `DispenserBlockEntity.getRandomSlot`. */
function randomSlot(level: Level, be: ContainerEntity): number {
  let i = -1;
  let j = 1;
  for (let k = 0; k < be.size; k++) {
    if (be.get(k) && level.random.nextInt(j++) === 0) i = k;
  }
  return i;
}

const FLUID_BUCKETS: Readonly<Record<string, string>> = {
  'minecraft:water_bucket': 'minecraft:water',
  'minecraft:lava_bucket': 'minecraft:lava',
};

function dispense(level: Level, pos: Pos, s: BState): void {
  const be = level.getBlockEntity<ContainerEntity>(pos);
  if (!(be instanceof ContainerEntity)) return;
  const i = randomSlot(level, be);
  if (i < 0) return;
  const st = be.get(i) as ItemStack;
  const dir = s.get('facing') as Direction;
  const front = rel(pos, dir);
  if (s.is('minecraft:dropper')) {
    const target = getContainerAt(level, front);
    if (!target) {
      be.set(i, st.count > 1 ? { item: st.item, count: st.count - 1 } : null);
    } else {
      const rest = addItem(level, be, target, { item: st.item, count: 1 }, opposite(dir));
      if (!rest) be.set(i, st.count > 1 ? { item: st.item, count: st.count - 1 } : null);
    }
    be.setChanged(level);
    return;
  }
  // Dispenser: minimal item behaviours (fluid buckets, empty bucket, otherwise drop the item).
  const fluid = FLUID_BUCKETS[st.item];
  const target = level.getState(front);
  if (fluid !== undefined) {
    if (target.isAir) {
      level.setBlock(front, level.table.of(fluid, { level: '0' }), Flags.ALL);
      be.set(i, { item: 'minecraft:bucket', count: 1 });
    } else {
      be.set(i, null);
    }
  } else if (st.item === 'minecraft:bucket') {
    const filled = target.is('minecraft:water')
      ? 'minecraft:water_bucket'
      : target.is('minecraft:lava')
        ? 'minecraft:lava_bucket'
        : undefined;
    if (filled && target.get('level') === '0') {
      level.setBlock(front, level.AIR, Flags.ALL);
      if (st.count === 1) be.set(i, { item: filled, count: 1 });
      else {
        be.set(i, { item: st.item, count: st.count - 1 });
        addItem(level, undefined, be, { item: filled, count: 1 }, undefined);
      }
    } else {
      be.set(i, st.count > 1 ? { item: st.item, count: st.count - 1 } : null);
    }
  } else {
    be.set(i, st.count > 1 ? { item: st.item, count: st.count - 1 } : null);
  }
  be.setChanged(level);
}

export const dispenserBehaviour: Behaviour = {
  neighborChanged(level, pos, s) {
    const powered = level.hasNeighborSignal(pos) || level.hasNeighborSignal(above(pos));
    const triggered = s.bool('triggered');
    if (powered && !triggered) {
      level.scheduleTick(pos, s.id, 4);
      level.setBlock(pos, s.with('triggered', true), Flags.INVISIBLE);
    } else if (!powered && triggered) {
      level.setBlock(pos, s.with('triggered', false), Flags.INVISIBLE);
    }
  },
  tick(level, pos, s) {
    dispense(level, pos, s);
  },
};
