import { posKey, type Pos } from './pos';

/**
 * Java tick priorities (`TickPriority`): lower runs first within the same game tick.
 * Source: https://minecraft.wiki/w/Tick#Scheduled_tick (repeater facing a diode −3,
 * depowering repeater −2, other repeaters −1, comparator facing a diode −1, others 0).
 */
export const TickPriority = {
  EXTREMELY_HIGH: -3,
  VERY_HIGH: -2,
  HIGH: -1,
  NORMAL: 0,
  LOW: 1,
  VERY_LOW: 2,
  EXTREMELY_LOW: 3,
} as const;

export interface ScheduledTick {
  readonly pos: Pos;
  readonly block: string;
  readonly triggerTick: number;
  readonly priority: number;
  readonly subTick: number;
}

const tickKey = (pos: Pos, block: string): string => `${posKey(pos)}|${block}`;

/** Maximum scheduled block ticks per game tick (Java: 65 536). */
const MAX_TICKS_PER_GAME_TICK = 65536;

/**
 * Scheduled block ticks (`LevelTicks`). One pending tick per (position, block); ticks due in
 * the current game tick are collected first, sorted by trigger time, priority and scheduling
 * order, then run. Ticks scheduled while running are never run in the same game tick.
 */
export class TickScheduler {
  private readonly pending = new Map<string, ScheduledTick>();
  private readonly runningThisTick = new Set<string>();
  private subTick = 0;

  schedule(pos: Pos, block: string, triggerTick: number, priority: number): void {
    const k = tickKey(pos, block);
    if (this.pending.has(k)) return;
    this.pending.set(k, { pos, block, triggerTick, priority, subTick: this.subTick++ });
  }

  /** Java `hasScheduledTick`: a pending (not yet collected) tick exists. */
  hasScheduledTick(pos: Pos, block: string): boolean {
    return this.pending.has(tickKey(pos, block));
  }

  /** Java `willTickThisTick`: the tick was collected for the game tick being processed. */
  willTickThisTick(pos: Pos, block: string): boolean {
    return this.runningThisTick.has(tickKey(pos, block));
  }

  get size(): number {
    return this.pending.size;
  }

  /** Runs all ticks due at `time`. `run` is called per tick (Java `ServerLevel.tickBlock`). */
  run(time: number, run: (t: ScheduledTick) => void): void {
    const due: ScheduledTick[] = [];
    for (const t of this.pending.values()) if (t.triggerTick <= time) due.push(t);
    if (due.length === 0) return;
    due.sort(
      (a, b) => a.triggerTick - b.triggerTick || a.priority - b.priority || a.subTick - b.subTick,
    );
    if (due.length > MAX_TICKS_PER_GAME_TICK) due.length = MAX_TICKS_PER_GAME_TICK;
    for (const t of due) {
      const k = tickKey(t.pos, t.block);
      this.pending.delete(k);
      this.runningThisTick.add(k);
    }
    try {
      for (const t of due) {
        this.runningThisTick.delete(tickKey(t.pos, t.block));
        run(t);
      }
    } finally {
      this.runningThisTick.clear();
    }
  }
}
