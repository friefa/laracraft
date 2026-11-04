import type { StepAction } from '@laracraft/build-order';
import type { BlockStateString } from '@laracraft/core-model';

/** Consecutive actions of the same kind and blockstate, shown as one compact row. */
export interface ActionGroup {
  readonly kind: StepAction['kind'];
  readonly state: BlockStateString;
  readonly temporary: boolean;
  /** Indices into `step.actions`. */
  readonly indices: readonly number[];
}

export function groupActions(actions: readonly StepAction[]): ActionGroup[] {
  const groups: {
    kind: StepAction['kind'];
    state: BlockStateString;
    temporary: boolean;
    indices: number[];
  }[] = [];
  actions.forEach((a, i) => {
    const temporary = a.kind === 'place' ? !!a.temporary : true;
    const last = groups[groups.length - 1];
    if (last && last.kind === a.kind && last.state === a.state && last.temporary === temporary) {
      last.indices.push(i);
    } else {
      groups.push({ kind: a.kind, state: a.state, temporary, indices: [i] });
    }
  });
  return groups;
}
