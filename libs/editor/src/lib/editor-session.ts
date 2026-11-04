import {
  AIR,
  type BlockRegistry,
  type BlockStateString,
  type Box3,
  type BuildDocument,
  type ChangeSet,
  type HorizontalDirection,
  type Vec3,
  resolveBlockState,
} from '@laracraft/core-model';
import type {
  Clipboard,
  EditorTool,
  Pick,
  PointerModifiers,
  SelectionOps,
  ToolContext,
  ToolId,
} from './api';
import { normalizeBox } from './box';
import type { LookVertical } from './placement';
import { EDITOR_ACTION, createSelectionOps, rotatedBox } from './selection-ops';
import { fillTool, pickBlockTool, removeTool, replaceTool } from './tools/basic-tools';
import { PasteTool } from './tools/paste-tool';
import { placeTool, planPlacement } from './tools/place-tool';
import { SelectTool } from './tools/select-tool';
import { ChangeSetUndoStack, DEFAULT_UNDO_DEPTH } from './undo-stack';

export type PreviewBlock = { pos: Vec3; state: BlockStateString };

/** What changed in an {@link EditorSession}. `document` events carry the applied change set. */
export type EditorEvent =
  | {
      readonly kind: 'document';
      /** Positions changed; for `undo` this is the change set that was reverted. */
      readonly changeSet: ChangeSet;
      readonly cause: 'commit' | 'undo' | 'redo';
    }
  | { readonly kind: 'history' }
  | { readonly kind: 'selection' }
  | { readonly kind: 'preview' }
  | { readonly kind: 'tool' }
  | { readonly kind: 'activeState' }
  | { readonly kind: 'clipboard' }
  | { readonly kind: 'look' };

export type EditorListener = (event: EditorEvent) => void;

export const NO_MODIFIERS: PointerModifiers = Object.freeze({
  shift: false,
  alt: false,
  primary: false,
});

export interface EditorSessionOptions {
  readonly doc: BuildDocument;
  readonly registry: BlockRegistry;
  /** Initial active block (default `minecraft:stone`). Must be registry-valid. */
  readonly activeState?: string;
  readonly maxUndoDepth?: number;
  readonly initialTool?: ToolId;
  /** Replaceable for tests; defaults to the shape-aware `createSelectionOps(registry)`. */
  readonly ops?: SelectionOps;
}

export class InvalidBlockStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBlockStateError';
  }
}

/**
 * Editor state holder (framework-free; the app wraps it in signals via
 * {@link EditorSession.subscribe}). Owns document, undo history, active tool,
 * active block, selection, preview and clipboard, and is the `ToolContext`
 * handed to tools. Every document change goes through {@link EditorSession.commit}.
 */
/** Hover feedback for the app to render (see {@link EditorSession.hoverPreview}). */
export type HoverPreview =
  | {
      readonly kind: 'place';
      readonly blocks: readonly { readonly pos: Vec3; readonly state: BlockStateString }[];
    }
  | { readonly kind: 'remove' | 'target'; readonly positions: readonly Vec3[] };

export class EditorSession implements ToolContext {
  readonly doc: BuildDocument;
  readonly registry: BlockRegistry;
  readonly undoStack: ChangeSetUndoStack;
  readonly ops: SelectionOps;

  private readonly listeners = new Set<EditorListener>();
  private readonly pasteTool = new PasteTool(() => this._clipboard);
  private readonly tools: Readonly<Record<ToolId, EditorTool>>;
  private _toolId: ToolId;
  private _activeState: BlockStateString;
  private _selection: Box3 | null = null;
  private _preview: readonly PreviewBlock[] = [];
  private _clipboard: Clipboard | null = null;
  private _lookHorizontal: HorizontalDirection | undefined;
  private _lookVertical: LookVertical | undefined;

  constructor(options: EditorSessionOptions) {
    this.doc = options.doc;
    this.registry = options.registry;
    this.ops = options.ops ?? createSelectionOps(options.registry);
    this.undoStack = new ChangeSetUndoStack(options.maxUndoDepth ?? DEFAULT_UNDO_DEPTH);
    this.tools = {
      place: placeTool,
      remove: removeTool,
      'pick-block': pickBlockTool,
      select: new SelectTool(),
      fill: fillTool,
      replace: replaceTool,
      paste: this.pasteTool,
    };
    this._toolId = options.initialTool ?? 'place';
    this._activeState = this.resolve(options.activeState ?? 'minecraft:stone');
  }

  // --- state -------------------------------------------------------------

  get activeState(): BlockStateString {
    return this._activeState;
  }
  get selection(): Box3 | null {
    return this._selection;
  }
  get preview(): readonly PreviewBlock[] {
    return this._preview;
  }
  get clipboard(): Clipboard | null {
    return this._clipboard;
  }
  get toolId(): ToolId {
    return this._toolId;
  }
  get tool(): EditorTool {
    return this.tools[this._toolId];
  }
  get lookHorizontal(): HorizontalDirection | undefined {
    return this._lookHorizontal;
  }

  get lookVertical(): LookVertical | undefined {
    return this._lookVertical;
  }
  get canUndo(): boolean {
    return this.undoStack.canUndo;
  }
  get canRedo(): boolean {
    return this.undoStack.canRedo;
  }
  get history() {
    return this.undoStack.history;
  }
  /** Pending paste position of the paste tool, if any. */
  get pastePosition(): Vec3 | null {
    return this.pasteTool.position;
  }

  /** Registers a listener; returns the unsubscribe function. */
  subscribe(listener: EditorListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // --- ToolContext ---------------------------------------------------------

  setSelection(box: Box3 | null): void {
    this._selection = box ? normalizeBox(box) : null;
    this.emit({ kind: 'selection' });
  }

  /** Sets the active block. Accepts any spelling; throws {@link InvalidBlockStateError}. */
  setActiveState(state: string): void {
    const resolved = this.resolve(state);
    if (resolved === this._activeState) return;
    this._activeState = resolved;
    this.emit({ kind: 'activeState' });
  }

  setPreview(changes: readonly { pos: Vec3; state: BlockStateString }[]): void {
    if (changes.length === 0 && this._preview.length === 0) return;
    this._preview = changes.map((c) => ({ pos: c.pos, state: c.state }));
    this.emit({ kind: 'preview' });
  }

  /** Applies a change set as one undo step; returns what was effectively applied. */
  commit(changeSet: ChangeSet): ChangeSet {
    const applied = this.doc.apply(changeSet);
    if (applied.changes.length === 0) return applied;
    this.undoStack.push(applied);
    this.emit({ kind: 'document', changeSet: applied, cause: 'commit' });
    this.emit({ kind: 'history' });
    return applied;
  }

  // --- tools ---------------------------------------------------------------

  setTool(id: ToolId): void {
    if (id === this._toolId) return;
    this.tool.cancel?.(this);
    this._toolId = id;
    this.emit({ kind: 'tool' });
  }

  /** Forwards a tap to the active tool. Errors (e.g. `EditVolumeError`) propagate. */
  tap(pick: Pick | null, mods: PointerModifiers = NO_MODIFIERS): void {
    this.tool.tap(pick, this, mods);
  }

  /**
   * What the active tool would do at `pick`, for a hover preview (mouse only):
   * `place` → ghost blocks exactly as a tap would place them (same orientation
   * logic); `remove` → the block that would disappear; `pick-block`/`replace` →
   * the block under the pointer; other tools → the targeted cell. Never mutates.
   */
  hoverPreview(pick: Pick | null): HoverPreview | null {
    if (!pick) return null;
    switch (this._toolId) {
      case 'place': {
        const changes = planPlacement(this, pick);
        if (!changes) return null;
        return { kind: 'place', blocks: changes.map((c) => ({ pos: c.pos, state: c.after })) };
      }
      case 'remove':
        return { kind: 'remove', positions: [pick.pos] };
      default:
        return { kind: 'target', positions: [pick.pos] };
    }
  }

  /** Camera look direction from the app, used to orient placed blocks. */
  setLookHorizontal(dir: HorizontalDirection | undefined): void {
    if (dir === this._lookHorizontal) return;
    this._lookHorizontal = dir;
    this.emit({ kind: 'look' });
  }

  /**
   * Camera pitch class from the app (`up`/`down` when looking steeply up or
   * down), used for 3D-facing blocks such as pistons and observers.
   */
  setLookVertical(pitch: LookVertical | undefined): void {
    if (pitch === this._lookVertical) return;
    this._lookVertical = pitch;
    this.emit({ kind: 'look' });
  }

  // --- history -------------------------------------------------------------

  undo(): ChangeSet | undefined {
    const cs = this.undoStack.undo(this.doc);
    if (cs) this.afterHistoryMove(cs, 'undo');
    return cs;
  }

  redo(): ChangeSet | undefined {
    const cs = this.undoStack.redo(this.doc);
    if (cs) this.afterHistoryMove(cs, 'redo');
    return cs;
  }

  // --- selection actions ---------------------------------------------------

  fillSelection(state: BlockStateString = this._activeState): ChangeSet | undefined {
    const box = this._selection;
    return box ? this.commit(this.ops.fill(this.doc, box, state)) : undefined;
  }

  deleteSelection(): ChangeSet | undefined {
    const box = this._selection;
    if (!box) return undefined;
    return this.commit({ ...this.ops.fill(this.doc, box, AIR), label: EDITOR_ACTION.delete });
  }

  replaceInSelection(
    from: BlockStateString,
    to: BlockStateString = this._activeState,
  ): ChangeSet | undefined {
    const box = this._selection;
    return box ? this.commit(this.ops.replace(this.doc, box, from, to)) : undefined;
  }

  /** Rotates the selection content; the selection follows the rotated box. */
  rotateSelection(quarterTurns: 1 | 2 | 3): ChangeSet | undefined {
    const box = this._selection;
    if (!box) return undefined;
    const applied = this.commit(this.ops.rotate(this.doc, this.registry, box, quarterTurns));
    this.setSelection(rotatedBox(box, quarterTurns));
    return applied;
  }

  mirrorSelection(axis: 'x' | 'z'): ChangeSet | undefined {
    const box = this._selection;
    return box ? this.commit(this.ops.mirror(this.doc, this.registry, box, axis)) : undefined;
  }

  copySelection(): Clipboard | null {
    const box = this._selection;
    if (!box) return null;
    this._clipboard = this.ops.copy(this.doc, box);
    this.emit({ kind: 'clipboard' });
    return this._clipboard;
  }

  cutSelection(): ChangeSet | undefined {
    const box = this._selection;
    if (!box || !this.copySelection()) return undefined;
    return this.commit({ ...this.ops.fill(this.doc, box, AIR), label: EDITOR_ACTION.cut });
  }

  setClipboard(clip: Clipboard | null): void {
    this._clipboard = clip;
    this.emit({ kind: 'clipboard' });
  }

  /** Commits a paste pending in the paste tool. */
  confirmPaste(): boolean {
    return this.pasteTool.confirm(this);
  }

  // --- internals -----------------------------------------------------------

  private afterHistoryMove(cs: ChangeSet, cause: 'undo' | 'redo'): void {
    this.emit({ kind: 'document', changeSet: cs, cause });
    this.emit({ kind: 'history' });
  }

  private resolve(state: string): BlockStateString {
    const r = resolveBlockState(this.registry, state);
    if (!r.ok) throw new InvalidBlockStateError(r.error);
    return r.state;
  }

  private emit(event: EditorEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}
