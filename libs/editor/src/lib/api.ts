import type {
  BlockRegistry,
  BlockStateString,
  Box3,
  BuildDocument,
  ChangeSet,
  Direction,
  Vec3,
} from '@laracraft/core-model';

/**
 * Editor contract (lead-owned). The editor is pure logic: no DOM, no three.js.
 * The app feeds it voxel picks (from the renderer) and renders what it exposes
 * (selection box, ghost previews). All document mutations go through `commit`,
 * so manual tools and Lara share one undo history.
 */

export interface Pick {
  readonly pos: Vec3;
  readonly face: Direction;
}

export interface PointerModifiers {
  readonly shift: boolean;
  readonly alt: boolean;
  /** Ctrl on Windows/Linux, Cmd on macOS. */
  readonly primary: boolean;
}

export type ToolId =
  | 'place'
  | 'remove'
  | 'pick-block' // eyedropper
  | 'select' // selection box (two corners)
  | 'fill' // fill selection with active block
  | 'replace' // replace one state with active block inside selection
  | 'paste';

export interface ToolContext {
  readonly doc: BuildDocument;
  readonly registry: BlockRegistry;
  /** Block placed by `place`/`fill` (canonical, registry-valid). */
  readonly activeState: BlockStateString;
  readonly selection: Box3 | null;
  setSelection(box: Box3 | null): void;
  setActiveState(state: BlockStateString): void;
  /** Applies a change set as one undo step. */
  commit(changeSet: ChangeSet): void;
  /** Non-committed preview of upcoming changes (paste, fill) for the renderer. */
  setPreview(changes: readonly { pos: Vec3; state: BlockStateString }[]): void;
}

export interface EditorTool {
  readonly id: ToolId;
  /** Single tap/click on the build (or on empty space when pick is null). */
  tap(pick: Pick | null, ctx: ToolContext, mods: PointerModifiers): void;
  /** Called when the tool is deactivated (clear previews etc.). */
  cancel?(ctx: ToolContext): void;
}

/** Undo/redo over applied change sets. */
export interface UndoStack {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Record an *already applied* change set (as returned by `BuildDocument.apply`). */
  push(applied: ChangeSet): void;
  /** Reverts the last change set on `doc`; returns it, or undefined if nothing to undo. */
  undo(doc: BuildDocument): ChangeSet | undefined;
  redo(doc: BuildDocument): ChangeSet | undefined;
  clear(): void;
  /** Labels for UI ("Füllen", Lara summaries), newest last. */
  readonly history: readonly { readonly label?: string; readonly origin: ChangeSet['origin'] }[];
}

/** Selection operations (each returns a ChangeSet to commit, or throws on invalid input). */
export interface SelectionOps {
  fill(doc: BuildDocument, box: Box3, state: BlockStateString): ChangeSet;
  replace(doc: BuildDocument, box: Box3, from: BlockStateString, to: BlockStateString): ChangeSet;
  /** Rotates the selection content around the Y axis by 90° steps, incl. blockstates. */
  rotate(
    doc: BuildDocument,
    registry: BlockRegistry,
    box: Box3,
    quarterTurns: 1 | 2 | 3,
  ): ChangeSet;
  /** Mirrors along the X or Z axis, incl. blockstates. */
  mirror(doc: BuildDocument, registry: BlockRegistry, box: Box3, axis: 'x' | 'z'): ChangeSet;
  copy(doc: BuildDocument, box: Box3): Clipboard;
  paste(doc: BuildDocument, clip: Clipboard, at: Vec3): ChangeSet;
}

export interface Clipboard {
  readonly size: Vec3;
  /** Relative positions and states (air excluded). */
  readonly blocks: readonly { readonly offset: Vec3; readonly state: BlockStateString }[];
}

/** Safety limit for one edit (fill/paste) to keep the app responsive. */
export const MAX_EDIT_VOLUME = 256 * 1024;
