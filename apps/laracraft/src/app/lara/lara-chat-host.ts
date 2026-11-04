import type { Signal } from '@angular/core';
import type { BlockRegistry, Box3, BuildDocument, ChangeSet } from '@laracraft/core-model';

/**
 * What the Lara chat needs from the screen it is opened on (the editor). Type-only so the
 * editor can provide it without loading the (lazy) chat code.
 */
export interface LaraChatHost {
  readonly buildId: string;
  /** The live document: the agent applies operations to it while streaming. */
  readonly doc: BuildDocument;
  readonly registry: BlockRegistry;
  selection(): Box3 | null;
  /** The document changed outside the editor (operation applied or reverted): re-render. */
  previewChanged(): void;
  /** Records a finished turn's merged change set as ONE undo step (and autosaves). */
  recordTurn(changeSet: ChangeSet): void;
  /** True while the last recorded Lara turn is still the latest undo step. */
  readonly canUndoTurn: Signal<boolean>;
  /** Undoes the last Lara turn (one editor undo step); false if not possible anymore. */
  undoTurn(): boolean;
  /** Lara is working: the editor blocks its own edits meanwhile. */
  setBusy(busy: boolean): void;
}
