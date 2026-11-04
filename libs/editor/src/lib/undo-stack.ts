import { type BuildDocument, type ChangeSet, invertChangeSet } from '@laracraft/core-model';
import type { UndoStack } from './api';

export const DEFAULT_UNDO_DEPTH = 200;

/**
 * Linear undo/redo history of applied change sets. Pushing a new change set
 * drops the redo branch; the oldest entries are discarded beyond `maxDepth`.
 * Assumes the document is only mutated through change sets recorded here.
 */
export class ChangeSetUndoStack implements UndoStack {
  private readonly done: ChangeSet[] = [];
  private readonly undone: ChangeSet[] = [];
  private historyCache: UndoStack['history'] | null = null;

  constructor(readonly maxDepth: number = DEFAULT_UNDO_DEPTH) {
    if (!Number.isInteger(maxDepth) || maxDepth < 1) {
      throw new RangeError(`Invalid undo depth ${maxDepth}`);
    }
  }

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  /** Number of redo steps available. */
  get redoDepth(): number {
    return this.undone.length;
  }

  get history(): UndoStack['history'] {
    this.historyCache ??= this.done.map((cs) =>
      cs.label === undefined ? { origin: cs.origin } : { label: cs.label, origin: cs.origin },
    );
    return this.historyCache;
  }

  /** Records an applied change set. Empty change sets are ignored (no undo step). */
  push(applied: ChangeSet): void {
    if (applied.changes.length === 0) return;
    this.done.push(applied);
    if (this.done.length > this.maxDepth) this.done.splice(0, this.done.length - this.maxDepth);
    this.undone.length = 0;
    this.historyCache = null;
  }

  undo(doc: BuildDocument): ChangeSet | undefined {
    const last = this.done.pop();
    if (!last) return undefined;
    doc.apply(invertChangeSet(last));
    this.undone.push(last);
    this.historyCache = null;
    return last;
  }

  redo(doc: BuildDocument): ChangeSet | undefined {
    const next = this.undone.pop();
    if (!next) return undefined;
    const applied = doc.apply(next);
    this.done.push(applied);
    this.historyCache = null;
    return applied;
  }

  clear(): void {
    this.done.length = 0;
    this.undone.length = 0;
    this.historyCache = null;
  }
}
