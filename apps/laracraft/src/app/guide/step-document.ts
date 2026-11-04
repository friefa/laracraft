import type { BuildPlan, BuildStep } from '@laracraft/build-order';
import {
  AIR,
  BuildDocument,
  invertChangeSet,
  type BlockChange,
  type BuildMetadata,
  type ChangeSet,
} from '@laracraft/core-model';

/** Forward change set of one step: placements write their state, removals write air. */
export function stepChangeSet(step: BuildStep): ChangeSet {
  const changes: BlockChange[] = step.actions.map((a) => ({
    pos: a.pos,
    before: AIR,
    after: a.kind === 'place' ? a.state : AIR,
  }));
  return { changes, origin: 'system', label: `step ${step.index}` };
}

/**
 * A separate `BuildDocument` holding the world as it looks after a given step
 * (temporary blocks and removals included). Navigation is incremental: moving
 * forward applies the following steps, moving back applies the recorded
 * inverse change sets.
 */
export class StepDocument {
  readonly doc: BuildDocument;
  /** `applied[i]` = effective change set of step i (with the real `before` states). */
  private readonly applied: ChangeSet[] = [];

  constructor(
    readonly plan: BuildPlan,
    metadata: BuildMetadata,
  ) {
    this.doc = new BuildDocument({ ...metadata });
  }

  /** Index of the last applied step; -1 when nothing is applied. */
  get current(): number {
    return this.applied.length - 1;
  }

  /** Brings the document to the state after step `index` (clamped; -1 = empty). */
  goTo(index: number): void {
    const target = Math.max(-1, Math.min(index, this.plan.steps.length - 1));
    while (this.applied.length - 1 < target) {
      const step = this.plan.steps[this.applied.length] as BuildStep;
      this.applied.push(this.doc.apply(stepChangeSet(step)));
    }
    while (this.applied.length - 1 > target) {
      this.doc.apply(invertChangeSet(this.applied.pop() as ChangeSet));
    }
  }
}
