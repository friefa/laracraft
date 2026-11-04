import type { Direction } from '@laracraft/core-model';
import { NEIGHBOUR_UPDATE_ORDER, rel, type Pos } from './pos';
import type { BState } from './state';

/** Executes single updates; implemented by the level. */
export interface UpdateTarget {
  /** Java `NeighborUpdater.executeUpdate`: `state.neighborChanged(...)` on the block at `pos`. */
  executeNeighborUpdate(
    pos: Pos,
    state: BState | undefined,
    block: string,
    from: Pos,
    moving: boolean,
  ): void;
  /** Java `NeighborUpdater.executeShapeUpdate`. */
  executeShapeUpdate(
    dir: Direction,
    neighbor: BState,
    pos: Pos,
    neighborPos: Pos,
    flags: number,
    recursionLeft: number,
  ): void;
}

interface Update {
  /** Runs the next part; returns true if more parts remain. */
  runNext(t: UpdateTarget): boolean;
}

/**
 * Emulation of Java's `CollectingNeighborUpdater` (1.19+): neighbour and shape updates are
 * queued instead of recursing, but processed depth-first in exactly the order the old
 * recursive implementation used. The chain is bounded by `maxChainedNeighborUpdates`
 * (default 1 000 000); updates beyond it are skipped like Java does ("update suppression"
 * guard), counted in {@link skipped}.
 * Source: https://minecraft.wiki/w/Block_update (update order, chained update limit).
 */
export class NeighborUpdater {
  private readonly stack: Update[] = [];
  private readonly addedThisLayer: Update[] = [];
  private count = 0;
  /** Updates skipped because the chain limit was hit (Java logs an error). */
  skipped = 0;

  constructor(
    private readonly target: UpdateTarget,
    private readonly maxChained: number,
  ) {}

  neighborChanged(pos: Pos, block: string, from: Pos): void {
    this.addAndRun({
      runNext: (t) => {
        t.executeNeighborUpdate(pos, undefined, block, from, false);
        return false;
      },
    });
  }

  /** `FullNeighborUpdate`: uses the state captured now. */
  neighborChangedWithState(
    state: BState,
    pos: Pos,
    block: string,
    from: Pos,
    moving: boolean,
  ): void {
    this.addAndRun({
      runNext: (t) => {
        t.executeNeighborUpdate(pos, state, block, from, moving);
        return false;
      },
    });
  }

  shapeUpdate(
    dir: Direction,
    neighbor: BState,
    pos: Pos,
    neighborPos: Pos,
    flags: number,
    recursionLeft: number,
  ): void {
    this.addAndRun({
      runNext: (t) => {
        t.executeShapeUpdate(dir, neighbor, pos, neighborPos, flags, recursionLeft);
        return false;
      },
    });
  }

  /** `MultiNeighborUpdate`: notifies the six neighbours of `source` (W, E, D, U, N, S). */
  updateNeighborsAtExceptFromFacing(source: Pos, block: string, skip: Direction | undefined): void {
    let idx = 0;
    if (NEIGHBOUR_UPDATE_ORDER[0] === skip) idx++;
    this.addAndRun({
      runNext: (t) => {
        const d = NEIGHBOUR_UPDATE_ORDER[idx++] as Direction;
        t.executeNeighborUpdate(rel(source, d), undefined, block, source, false);
        if (idx < NEIGHBOUR_UPDATE_ORDER.length && NEIGHBOUR_UPDATE_ORDER[idx] === skip) idx++;
        return idx < NEIGHBOUR_UPDATE_ORDER.length;
      },
    });
  }

  private addAndRun(u: Update): void {
    const inRun = this.count > 0;
    const overLimit = this.maxChained >= 0 && this.count >= this.maxChained;
    this.count++;
    if (!overLimit) {
      if (inRun) this.addedThisLayer.push(u);
      else this.stack.push(u);
    } else {
      this.skipped++;
    }
    if (!inRun) this.runUpdates();
  }

  private runUpdates(): void {
    try {
      while (this.stack.length > 0 || this.addedThisLayer.length > 0) {
        for (let i = this.addedThisLayer.length - 1; i >= 0; i--) {
          this.stack.push(this.addedThisLayer[i] as Update);
        }
        this.addedThisLayer.length = 0;
        const top = this.stack[this.stack.length - 1] as Update;
        while (this.addedThisLayer.length === 0) {
          if (!top.runNext(this.target)) {
            this.stack.pop();
            break;
          }
        }
      }
    } finally {
      this.stack.length = 0;
      this.addedThisLayer.length = 0;
      this.count = 0;
    }
  }
}
