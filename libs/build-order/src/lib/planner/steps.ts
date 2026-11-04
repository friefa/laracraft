import type { Vec3 } from '@laracraft/core-model';
import type { BuildPhase, BuildStep, Hint, HintCode, MaterialCount, StepAction } from '../types';

export const F_LOOK = 1;
export const F_INTERACT = 2;
export const F_SCAFFOLD = 4;
export const F_SUPPORT = 8;
export const F_OBSERVER = 16;

/** One action in plan order, with what step formation needs to know about it. */
export interface PlanEntry {
  readonly phase: BuildPhase;
  readonly action: StepAction;
  /** Items consumed (placements only). */
  readonly count: number;
  readonly flags: number;
}

export class MaterialCounter {
  private readonly counts = new Map<string, number>();

  add(item: string, count: number): void {
    if (count <= 0) return;
    this.counts.set(item, (this.counts.get(item) ?? 0) + count);
  }

  toList(): MaterialCount[] {
    return [...this.counts]
      .map(([item, count]) => ({ item, count }))
      .sort((a, b) => b.count - a.count || (a.item < b.item ? -1 : a.item > b.item ? 1 : 0));
  }
}

const FLAG_HINTS: readonly (readonly [number, HintCode])[] = [
  [F_SUPPORT, 'temporary-support'],
  [F_SCAFFOLD, 'scaffold'],
  [F_OBSERVER, 'observer-order'],
  [F_LOOK, 'look-direction'],
  [F_INTERACT, 'interaction'],
];

const PHASE_HINT: Readonly<Partial<Record<BuildPhase, HintCode>>> = {
  redstone: 'keep-circuit-open',
  power: 'power-source-last',
  fluids: 'fluids-last',
  cleanup: 'remove-temporary',
};

function buildStep(index: number, entries: readonly PlanEntry[]): BuildStep {
  const first = entries[0] as PlanEntry;
  const materials = new MaterialCounter();
  let minY = Infinity;
  let maxY = -Infinity;
  const flagged = new Map<number, Vec3[]>();
  for (const e of entries) {
    const y = e.action.pos.y;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (e.action.kind === 'place') materials.add(e.action.item, e.count);
    for (const [flag] of FLAG_HINTS) {
      if (e.flags & flag) {
        let list = flagged.get(flag);
        if (!list) flagged.set(flag, (list = []));
        list.push(e.action.pos);
      }
    }
  }
  const hints: Hint[] = [];
  const phaseHint = PHASE_HINT[first.phase];
  if (phaseHint) hints.push({ code: phaseHint, positions: entries.map((e) => e.action.pos) });
  for (const [flag, code] of FLAG_HINTS) {
    const positions = flagged.get(flag);
    if (positions) hints.push({ code, positions });
  }
  return {
    index,
    phase: first.phase,
    actions: entries.map((e) => e.action),
    materials: materials.toList(),
    hints,
    yRange: [minY, maxY],
  };
}

/**
 * Splits the ordered actions into steps: never across phases, at most
 * `maxSize` actions, and preferably at Y-layer boundaries once `minSize` is reached.
 */
export function formSteps(
  entries: readonly PlanEntry[],
  minSize: number,
  maxSize: number,
): BuildStep[] {
  const steps: BuildStep[] = [];
  let current: PlanEntry[] = [];
  for (const e of entries) {
    const head = current[0];
    const last = current[current.length - 1];
    if (
      head &&
      last &&
      (head.phase !== e.phase ||
        current.length >= maxSize ||
        (current.length >= minSize && last.action.pos.y !== e.action.pos.y))
    ) {
      steps.push(buildStep(steps.length, current));
      current = [];
    }
    current.push(e);
  }
  if (current.length > 0) steps.push(buildStep(steps.length, current));
  return steps;
}
