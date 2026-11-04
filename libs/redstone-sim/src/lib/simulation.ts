import {
  BuildDocument,
  OPPOSITE,
  type BlockRegistry,
  type BlockStateString,
  type Direction,
  type Vec3,
} from '@laracraft/core-model';
import type {
  ContainerSnapshot,
  CreateSimulationFn,
  SimOptions,
  Simulation,
  Stimulus,
} from './api';
import { levelLog, type LevelLog } from './blocks/actuators';
import { getContainerAt, insertItems, type ContainerEntity } from './blocks/containers';
import { initComparator } from './blocks/diode';
import { behaviourOf, createBlockEntity } from './blocks/index';
import { pistonNeighborSignal } from './blocks/piston';
import { calculateTargetStrength } from './blocks/wire';
import { Flags, Level } from './core/level';
import { above, below, opposite, rel, type Pos } from './core/pos';

const DEFAULT_MAX_UPDATES = 1_000_000;
const DEFAULT_SETTLE_TICKS = 1000;

/**
 * Java Edition redstone simulator.
 *
 * Loading: the document's states are loaded verbatim like a world save without pending ticks
 * (block entities are created empty). Then every block receives one neighbour update in
 * Y/Z/X order — as if a block update reached every block — so components whose stored state
 * disagrees with their inputs schedule their ticks (lamps, torches, repeaters, pistons …).
 * No shape updates are sent, so observers do not fire on load.
 */
export class JavaSimulation implements Simulation {
  readonly level: Level;
  private readonly meta: BuildDocument['metadata'];

  constructor(doc: BuildDocument, registry: BlockRegistry, options: Partial<SimOptions> = {}) {
    if (options.edition !== undefined && options.edition !== 'java') {
      throw new Error(`Unsupported edition ${String(options.edition)}`);
    }
    this.meta = { ...doc.metadata };
    const blocks: { pos: Pos; state: string }[] = [];
    let minY = Number.POSITIVE_INFINITY;
    doc.volume.forEachBlock((x, y, z, index) => {
      const state = doc.palette.stateAt(index);
      if (state === 'minecraft:air') return;
      blocks.push({ pos: { x, y, z }, state });
      if (y < minY) minY = y;
    });
    const groundY = options.groundY ?? (Number.isFinite(minY) ? minY - 1 : -1);
    this.level = new Level({
      registry,
      groundY,
      maxChainedUpdates: options.maxUpdatesPerTick ?? DEFAULT_MAX_UPDATES,
      behaviourOf,
      createBlockEntity,
    });
    blocks.sort((a, b) => a.pos.y - b.pos.y || a.pos.z - b.pos.z || a.pos.x - b.pos.x);
    for (const b of blocks) this.level.loadBlock(b.pos, this.level.table.parse(b.state));
    for (const b of blocks) {
      const s = this.level.getState(b.pos);
      if (s.is('minecraft:comparator')) initComparator(this.level, b.pos, s);
    }
    for (const b of blocks) {
      const s = this.level.getState(b.pos);
      this.level.neighborChanged(b.pos, s.id, b.pos);
    }
  }

  get tick(): number {
    return this.level.gameTime;
  }

  /** Non-state effects (notes played, TNT primed). */
  get log(): LevelLog {
    return levelLog(this.level);
  }

  /** Neighbour updates skipped by the chain limit (update suppression guard). */
  get suppressedUpdates(): number {
    return this.level.updater.skipped;
  }

  getState(pos: Vec3): BlockStateString {
    return this.level.getState(pos).key;
  }

  getEmittedPower(pos: Vec3, direction: Direction): number {
    return this.level.getSignal(pos, OPPOSITE[direction]);
  }

  getReceivedPower(pos: Vec3): number {
    const s = this.level.getState(pos);
    if (s.is('minecraft:redstone_wire')) return calculateTargetStrength(this.level, pos);
    return this.level.getBestNeighborSignal(pos);
  }

  isPowered(pos: Vec3): boolean {
    const l = this.level;
    const s = l.getState(pos);
    if (s.is('minecraft:piston') || s.is('minecraft:sticky_piston')) {
      return pistonNeighborSignal(l, pos, s.get('facing') as Direction);
    }
    if (s.is('minecraft:dispenser') || s.is('minecraft:dropper')) {
      return l.hasNeighborSignal(pos) || l.hasNeighborSignal(above(pos));
    }
    if (s.is('minecraft:redstone_wire')) return s.int('power') > 0;
    if (s.is('minecraft:repeater') || s.is('minecraft:comparator')) {
      const d = s.get('facing') as Direction;
      return l.getSignal(rel(pos, d), d) > 0 || l.getState(rel(pos, d)).int('power') > 0;
    }
    if (s.is('minecraft:redstone_torch')) return l.hasSignal(below(pos), 'down');
    if (s.is('minecraft:redstone_wall_torch')) {
      const d = opposite(s.get('facing') as Direction);
      return l.hasSignal(rel(pos, d), d);
    }
    if (s.def?.render.modelId === 'door') {
      const other = s.get('half') === 'lower' ? above(pos) : below(pos);
      return l.hasNeighborSignal(pos) || l.hasNeighborSignal(other);
    }
    return l.hasNeighborSignal(pos);
  }

  getContainer(pos: Vec3): ContainerSnapshot | undefined {
    const be = this.level.getBlockEntity<ContainerEntity>(pos);
    if (!be || !('slots' in be)) return undefined;
    return { pos, slots: be.slots.map((st) => (st ? { item: st.item, count: st.count } : null)) };
  }

  apply(stimulus: Stimulus): void {
    const l = this.level;
    switch (stimulus.kind) {
      case 'use': {
        const s = l.getState(stimulus.pos);
        l.b(s).use?.(l, stimulus.pos, s);
        return;
      }
      case 'step-on': {
        const s = l.getState(stimulus.pos);
        l.b(s).stepOn?.(l, stimulus.pos, s);
        return;
      }
      case 'step-off': {
        const s = l.getState(stimulus.pos);
        l.b(s).stepOff?.(l, stimulus.pos, s);
        return;
      }
      case 'place': {
        const pos = stimulus.pos;
        let s = l.table.parse(stimulus.state);
        const b = l.b(s);
        if (b.placementState) s = b.placementState(l, pos, s);
        // Java: `BlockItem.place` → setBlock(flags 11), then `setPlacedBy`.
        l.setBlock(pos, s, Flags.ALL | Flags.IMMEDIATE);
        if (s.def?.render.modelId === 'door' && s.get('half') === 'lower') {
          l.setBlock(above(pos), s.with('half', 'upper'), Flags.ALL);
        }
        b.setPlacedBy?.(l, pos, l.getState(pos));
        return;
      }
      case 'break':
        l.removeBlock(stimulus.pos, false);
        return;
      case 'insert-items':
        if (!getContainerAt(l, stimulus.pos)) {
          throw new Error(`No container at ${stimulus.pos.x},${stimulus.pos.y},${stimulus.pos.z}`);
        }
        insertItems(l, stimulus.pos, stimulus.item, stimulus.count);
        return;
      case 'set-daylight':
        l.daylight = stimulus.level;
        return;
    }
  }

  step(ticks = 1): void {
    for (let i = 0; i < ticks; i++) this.level.step();
  }

  settle(maxTicks = DEFAULT_SETTLE_TICKS): number {
    let n = 0;
    while (n < maxTicks && this.level.busy) {
      this.level.step();
      n++;
    }
    return n;
  }

  toDocument(): BuildDocument {
    const doc = new BuildDocument({ ...this.meta });
    for (const { pos, state } of this.level.storedBlocks()) doc.setBlock(pos, state.key);
    return doc;
  }
}

/** Creates a Java Edition redstone simulation of `doc` (see {@link JavaSimulation}). */
export const createSimulation: CreateSimulationFn = (doc, registry, options) =>
  new JavaSimulation(doc, registry, options);
