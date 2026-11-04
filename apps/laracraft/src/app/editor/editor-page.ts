import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  InjectionToken,
  Injector,
  PendingTasks,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ChangeSet } from '@laracraft/core-model';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  type BlockDefinition,
  type Box3,
  type BuildDocument,
  createJavaBlockRegistry,
  defaultState,
  parseBlockState,
} from '@laracraft/core-model';
import {
  EditVolumeError,
  EditorSession,
  type EditorEvent,
  type Pick,
  type ToolId,
  pickBlockTool,
  removeTool,
} from '@laracraft/editor';
import { injectAutosave } from '../storage/autosave';
import { BuildStore } from '../storage/build-store';
import {
  MAX_IMPORT_BYTES,
  STORAGE_ERROR_KEYS,
  buildFileName,
  buildStoreErrorCode,
} from '../storage/build-store.types';
import { saveFile } from '../storage/save-file';
import { type EditorCommand, isTextInput, shortcutFor } from './editor-commands';
import {
  FIRST_RUN_HINT_KEY,
  chromeInsets,
  readFlag,
  safeLocalStorage,
  writeFlag,
} from './editor-chrome';
import { Icon, type IconName } from './icon';
import { LayerSlider } from './layer-slider';
import { Lara } from '../shared/lara/lara';
import { type ChatSize, LaraChat } from '../lara/lara-chat';
import type { LaraChatHost } from '../lara/lara-chat-host';
import { BlockIcon } from './palette/block-icon';
import { BlockPalette } from './palette/block-palette';
import { blockNameKey } from './palette/palette-model';
import type { HighlightGroup } from '@laracraft/renderer';
import { type EditorRenderer, RENDERER_FACTORY, RendererLoadError } from './renderer-loader';

/** Quiet period before an autosave (overridable in tests). */
/** Hover preview outline colours. */
const HOVER_PLACE_COLOR = 0xffffff;
const HOVER_REMOVE_COLOR = 0xe53935;
const HOVER_TARGET_COLOR = 0xffd54f;

export const EDITOR_AUTOSAVE_DELAY = new InjectionToken<number>('EDITOR_AUTOSAVE_DELAY', {
  providedIn: 'root',
  factory: () => 1000,
});

interface Message {
  readonly key: string;
  readonly params?: Record<string, unknown>;
}

interface ToolButton {
  readonly tool: 'place' | 'remove' | 'pick-block' | 'select';
  readonly icon: IconName;
  readonly label: string;
  readonly shortcut: string;
}

interface ActionButton {
  readonly command: EditorCommand;
  readonly icon: IconName;
  readonly label: string;
  readonly needsClipboard?: boolean;
  /** Colour meaning: green = adds blocks, blue = transforms, red = removes. */
  readonly tone?: 'green' | 'blue' | 'red';
}

const TOOLS: readonly ToolButton[] = [
  { tool: 'place', icon: 'place', label: 'editor.tool.place', shortcut: '1' },
  { tool: 'remove', icon: 'remove', label: 'editor.tool.remove', shortcut: '2' },
  { tool: 'pick-block', icon: 'pick', label: 'editor.tool.pickBlock', shortcut: '3' },
  { tool: 'select', icon: 'select', label: 'editor.tool.select', shortcut: '4' },
];

const SELECTION_ACTIONS: readonly ActionButton[] = [
  { command: { kind: 'fill' }, icon: 'fill', label: 'editor.selection.fill', tone: 'green' },
  { command: { kind: 'replace' }, icon: 'replace', label: 'editor.selection.replace' },
  {
    command: { kind: 'rotate', turns: 3 },
    icon: 'rotateLeft',
    label: 'editor.selection.rotateLeft',
    tone: 'blue',
  },
  {
    command: { kind: 'rotate', turns: 1 },
    icon: 'rotateRight',
    label: 'editor.selection.rotateRight',
    tone: 'blue',
  },
  {
    command: { kind: 'mirror', axis: 'x' },
    icon: 'mirrorX',
    label: 'editor.selection.mirrorX',
    tone: 'blue',
  },
  {
    command: { kind: 'mirror', axis: 'z' },
    icon: 'mirrorZ',
    label: 'editor.selection.mirrorZ',
    tone: 'blue',
  },
  { command: { kind: 'copy' }, icon: 'copy', label: 'editor.selection.copy' },
  { command: { kind: 'cut' }, icon: 'cut', label: 'editor.selection.cut' },
  { command: { kind: 'delete' }, icon: 'delete', label: 'editor.selection.delete', tone: 'red' },
];

const PASTE_ACTION: ActionButton = {
  command: { kind: 'paste' },
  icon: 'paste',
  label: 'editor.selection.paste',
  needsClipboard: true,
  tone: 'green',
};

/** Save status pill colour: green = saved, blue = pending, red = failed. */
const SAVE_STATE_PILLS = {
  idle: '',
  saved: '',
  dirty: 'lc-pill--blue',
  saving: 'lc-pill--blue',
  error: 'lc-pill--red',
} as const;

const SAVE_STATE_KEYS = {
  idle: 'editor.save.saved',
  saved: 'editor.save.saved',
  dirty: 'editor.save.dirty',
  saving: 'editor.save.saving',
  error: 'editor.save.error',
} as const;

/** Mouse buttons with a fixed meaning on desktop (`PointerEvent.button`). */
const MIDDLE_BUTTON = 1;
const RIGHT_BUTTON = 2;

let sharedRegistry: ReturnType<typeof createJavaBlockRegistry> | undefined;
const javaRegistry = () => (sharedRegistry ??= createJavaBlockRegistry());

/**
 * Editor screen (`build/:id`): full-screen 3D view, tools, block palette,
 * layer slider and autosave. The page owns one {@link EditorSession} and keeps
 * the renderer in sync with its events.
 */
@Component({
  selector: 'lc-editor-page',
  imports: [RouterLink, TranslocoPipe, Icon, BlockIcon, BlockPalette, LayerSlider, Lara, LaraChat],
  templateUrl: './editor-page.html',
  styleUrl: './editor-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.lc-dock-open]': 'chatOpen()',
    '(document:keydown)': 'onKeydown($event)',
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
  },
})
export class EditorPage {
  private readonly store = inject(BuildStore);
  private readonly createRenderer = inject(RENDERER_FACTORY);
  private readonly pendingTasks = inject(PendingTasks);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly palette = viewChild(BlockPalette);
  private readonly menuRoot = viewChild<ElementRef<HTMLElement>>('menuRoot');
  private readonly topBar = viewChild<ElementRef<HTMLElement>>('topBar');
  private readonly bottomBar = viewChild<ElementRef<HTMLElement>>('bottomBar');
  private readonly layersPanel = viewChild('layersPanel', {
    read: ElementRef<HTMLElement>,
  });
  private readonly chatPanel = viewChild<ElementRef<HTMLElement>>('chatPanel');
  private readonly laraFab = viewChild<ElementRef<HTMLElement>>('laraFab');
  private readonly storage = safeLocalStorage(this.document);

  private session: EditorSession | null = null;
  /** Voxel under the mouse (desktop hover preview); null when not hovering. */
  private hoverPick: Pick | null = null;
  private renderer: EditorRenderer | null = null;
  /** The id the document was loaded from (saving never follows a later route change). */
  private loadedId: string | null = null;
  private destroyed = false;

  /** Route parameter (component input binding). */
  readonly id = input.required<string>();

  protected readonly registry = javaRegistry();
  protected readonly tools = TOOLS;
  protected readonly selectionActions = SELECTION_ACTIONS;
  protected readonly pasteAction = PASTE_ACTION;
  protected readonly blockNameKey = blockNameKey;

  protected readonly phase = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadError = signal<Message | null>(null);
  protected readonly rendererError = signal<Message | null>(null);
  protected readonly error = signal<Message | null>(null);
  protected readonly status = signal<Message | null>(null);
  protected readonly menuOpen = signal(false);

  protected readonly name = signal('');
  protected readonly tool = signal<ToolId>('place');
  protected readonly activeState = signal<string | null>(null);
  protected readonly hasSelection = signal(false);
  protected readonly hasClipboard = signal(false);
  protected readonly pastePending = signal(false);
  protected readonly canUndo = signal(false);
  protected readonly canRedo = signal(false);
  protected readonly bounds = signal<Box3 | undefined>(undefined);
  protected readonly layer = signal<number | null>(null);

  // --- Lara chat (L2) ---
  protected readonly chatOpen = signal(false);
  protected readonly chatSize = signal<ChatSize>('half');
  /** Lara is streaming into the document: the editor's own edits wait meanwhile. */
  protected readonly laraBusy = signal(false);
  protected readonly laraHost = signal<LaraChatHost | null>(null);
  /** Undo depth right after the last recorded Lara turn (null = none in this session). */
  private readonly laraStep = signal<number | null>(null);
  private readonly historyTop = signal<{ depth: number; origin: string | undefined }>({
    depth: 0,
    origin: undefined,
  });
  private readonly canUndoLaraTurn = computed(() => {
    const top = this.historyTop();
    return this.laraStep() === top.depth && top.origin === 'lara';
  });

  protected readonly activeBlock = computed<BlockDefinition | undefined>(() => {
    const state = this.activeState();
    return state ? this.registry.get(parseBlockState(state).id) : undefined;
  });

  protected readonly layerMin = computed(() => this.bounds()?.min.y ?? 0);
  protected readonly layerMax = computed(() => this.bounds()?.max.y ?? 0);
  protected readonly showLayers = computed(() => this.layerMax() > this.layerMin());

  /** One-line "how to start" hint, shown until dismissed once (persisted). */
  protected readonly firstRunHint = signal(!readFlag(this.storage, FIRST_RUN_HINT_KEY));
  /** "Click" with a mouse, "tap" on touch screens. */
  protected readonly firstRunKey = this.document.defaultView?.matchMedia?.('(pointer: fine)')
    .matches
    ? 'editor.firstRun.textMouse'
    : 'editor.firstRun.text';

  protected readonly hint = computed(() => {
    if (this.phase() !== 'ready') return null;
    switch (this.tool()) {
      case 'replace':
        return 'editor.hint.replace';
      case 'paste':
        return 'editor.hint.paste';
      case 'select':
        return this.hasSelection() ? null : 'editor.hint.select';
      default:
        // The first-run hint already says how to place a block.
        return this.bounds() || this.firstRunHint() ? null : 'editor.hint.empty';
    }
  });

  protected readonly autosave = injectAutosave(() => this.saveNow(), {
    delayMs: inject(EDITOR_AUTOSAVE_DELAY),
    onError: (err) => console.error('Autosave failed', err),
  });
  protected readonly saveStateKey = computed(() => SAVE_STATE_KEYS[this.autosave.state()]);
  protected readonly saveStatePill = computed(() => SAVE_STATE_PILLS[this.autosave.state()]);

  constructor() {
    afterNextRender(() => void this.init());
    const onResize = () => this.updateViewInsets();
    this.document.defaultView?.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => {
      this.document.defaultView?.removeEventListener('resize', onResize);
      this.destroyed = true;
      this.renderer?.dispose();
      this.renderer = null;
    });
  }

  // --- lifecycle -------------------------------------------------------------

  private async init(): Promise<void> {
    // Keeps the app "unstable" while loading, so tests (and SSR) wait for it.
    const done = this.pendingTasks.add();
    try {
      const id = this.id();
      let doc: BuildDocument;
      try {
        doc = await this.store.load(id);
      } catch (err) {
        const code = buildStoreErrorCode(err);
        if (code === 'unknown') console.error(err);
        this.loadError.set({ key: STORAGE_ERROR_KEYS[code] });
        this.phase.set('error');
        return;
      }
      if (this.destroyed) return;
      this.loadedId = id;
      this.attachSession(new EditorSession({ doc, registry: this.registry }));
      this.phase.set('ready');
      await this.startRenderer();
    } finally {
      done();
    }
  }

  private attachSession(session: EditorSession): void {
    this.session = session;
    this.name.set(session.doc.metadata.name);
    this.tool.set(session.toolId);
    this.activeState.set(session.activeState);
    this.canUndo.set(session.canUndo);
    this.canRedo.set(session.canRedo);
    this.bounds.set(session.doc.volume.bounds());
    const unsubscribe = session.subscribe((event) => this.onSessionEvent(session, event));
    this.destroyRef.onDestroy(unsubscribe);
    if (this.loadedId) this.laraHost.set(this.createLaraHost(session, this.loadedId));
  }

  /** The editor side of the Lara chat: live preview, one undo step per turn, busy lock. */
  private createLaraHost(session: EditorSession, buildId: string): LaraChatHost {
    // Bounds before Lara's turn: frame the view at the end when the build grew.
    let turnStartBounds: Box3 | undefined;
    return {
      buildId,
      doc: session.doc,
      registry: this.registry,
      selection: () => session.selection,
      previewChanged: () => {
        this.renderer?.update();
        this.bounds.set(session.doc.volume.bounds());
      },
      recordTurn: (changeSet: ChangeSet) => {
        const before = turnStartBounds;
        session.recordExternal(changeSet);
        this.laraStep.set(session.history.length);
        // Show what Lara built when it reaches outside the previous build.
        if (grew(before, this.bounds())) this.renderer?.frame();
      },
      canUndoTurn: this.canUndoLaraTurn,
      undoTurn: () => {
        if (!this.canUndoLaraTurn() || this.laraBusy()) return false;
        session.undo();
        return true;
      },
      setBusy: (busy: boolean) => {
        if (busy && !this.laraBusy()) turnStartBounds = session.doc.volume.bounds();
        this.laraBusy.set(busy);
      },
    };
  }

  private async startRenderer(): Promise<void> {
    const session = this.session;
    if (!session) return;
    let renderer: EditorRenderer;
    try {
      renderer = await this.createRenderer(this.canvas().nativeElement, this.registry);
    } catch (err) {
      const code = err instanceof RendererLoadError ? err.code : 'failed';
      if (code !== 'webgl') console.error(err);
      this.rendererError.set({ key: `editor.errors.renderer.${code}` });
      return;
    }
    if (this.destroyed) {
      renderer.dispose();
      return;
    }
    this.renderer = renderer;
    // Before setDocument: it frames the build in the part of the canvas the UI leaves free.
    this.updateViewInsets();
    renderer.setDocument(session.doc);
    renderer.setLayerLimit(this.layer());
    renderer.setSelectionBox(session.selection);
    renderer.setGhosts(session.preview);
    const off = renderer.onTap((pick, event) => this.onTap(pick, event));
    this.destroyRef.onDestroy(off);
    const offHover = renderer.onHover?.((pick) => {
      this.hoverPick = pick;
      this.renderPreview();
    });
    if (offHover) this.destroyRef.onDestroy(offHover);
  }

  private onSessionEvent(session: EditorSession, event: EditorEvent): void {
    switch (event.kind) {
      case 'document':
        this.renderer?.update();
        this.bounds.set(session.doc.volume.bounds());
        // The layer slider appears once the build has more than one layer.
        afterNextRender(() => this.updateViewInsets(), { injector: this.injector });
        this.autosave.markDirty();
        break;
      case 'history':
        this.canUndo.set(session.canUndo);
        this.canRedo.set(session.canRedo);
        this.historyTop.set({
          depth: session.history.length,
          origin: session.history.at(-1)?.origin,
        });
        break;
      case 'selection':
        this.hasSelection.set(session.selection !== null);
        this.renderer?.setSelectionBox(session.selection);
        break;
      case 'preview':
        this.renderPreview();
        this.pastePending.set(session.pastePosition !== null);
        break;
      case 'tool':
        this.renderPreview();
        this.tool.set(session.toolId);
        this.pastePending.set(session.pastePosition !== null);
        break;
      case 'activeState':
        this.renderPreview();
        this.activeState.set(session.activeState);
        break;
      case 'clipboard':
        this.hasClipboard.set(session.clipboard !== null);
        break;
      case 'look':
        break;
    }
  }

  private saveNow(): Promise<unknown> {
    const session = this.session;
    const id = this.loadedId;
    return session && id ? this.store.save(id, session.doc) : Promise.resolve();
  }

  /**
   * Ghosts and outlines for the renderer: the session's own preview (paste) plus the
   * hover preview — where and how the active block would be placed, or which block a
   * remove would delete. Uses the same placement logic as a real tap.
   */
  private renderPreview(): void {
    const session = this.session;
    const renderer = this.renderer;
    if (!session || !renderer) return;
    const look = renderer.lookDirection();
    session.setLookHorizontal(look.facing);
    session.setLookVertical(look.pitch);
    const hover = session.hoverPreview(this.hoverPick);
    const ghosts = [...session.preview];
    const highlights: HighlightGroup[] = [];
    if (hover?.kind === 'place') {
      ghosts.push(...hover.blocks);
      highlights.push({
        id: 'hover',
        positions: hover.blocks.map((b) => b.pos),
        color: HOVER_PLACE_COLOR,
        style: 'outline',
      });
    } else if (hover) {
      highlights.push({
        id: 'hover',
        positions: hover.positions,
        color: hover.kind === 'remove' ? HOVER_REMOVE_COLOR : HOVER_TARGET_COLOR,
        style: 'outline',
      });
    }
    renderer.setGhosts(ghosts);
    renderer.setHighlights(highlights);
  }

  // --- input -------------------------------------------------------------------

  private onTap(pick: Pick | null, event: PointerEvent): void {
    const session = this.session;
    if (!session || this.laraBusy()) return;
    this.menuOpen.set(false);
    const look = this.renderer?.lookDirection();
    if (look) {
      session.setLookHorizontal(look.facing);
      session.setLookVertical(look.pitch);
    }
    const mods = {
      shift: event.shiftKey,
      alt: event.altKey,
      primary: event.ctrlKey || event.metaKey,
    };
    // Desktop: right click removes, middle click picks the block, whatever the tool.
    const buttonTool =
      event.button === RIGHT_BUTTON
        ? removeTool
        : event.button === MIDDLE_BUTTON
          ? pickBlockTool
          : null;
    if (buttonTool) {
      this.guard(() => buttonTool.tap(pick, session, mods));
      return;
    }
    // An empty build has nothing to click on: the first block goes to the origin.
    const target =
      pick ??
      (session.toolId === 'place' && session.doc.volume.blockCount === 0
        ? ({ pos: { x: 0, y: -1, z: 0 }, face: 'up' } satisfies Pick)
        : null);
    this.guard(() => session.tap(target, mods));
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.phase() !== 'ready' || this.palette()?.isOpen()) return;
    if (isTextInput(event.target)) return;
    const command = shortcutFor(event);
    if (!command) return;
    const onControl =
      event.target instanceof HTMLElement && !!event.target.closest('button, a, input');
    // Let Enter/Backspace/Delete act on focused buttons and links as usual.
    if (onControl && (command.kind === 'confirmPaste' || command.kind === 'delete')) return;
    event.preventDefault();
    this.run(command);
  }

  /** Closes the "more" menu on outside pointer presses. */
  protected onDocumentPointerDown(event: Event): void {
    if (!this.menuOpen()) return;
    const root = this.menuRoot()?.nativeElement;
    if (root && event.target instanceof Node && root.contains(event.target)) return;
    this.menuOpen.set(false);
  }

  // --- commands ----------------------------------------------------------------

  protected run(command: EditorCommand): void {
    const session = this.session;
    if (!session) return;
    // While Lara streams into the document only view commands run.
    if (this.laraBusy() && command.kind !== 'frame' && command.kind !== 'cancel') return;
    this.guard(() => {
      switch (command.kind) {
        case 'tool':
          session.setTool(command.tool);
          break;
        case 'undo':
          session.undo();
          break;
        case 'redo':
          session.redo();
          break;
        case 'fill':
          session.fillSelection();
          break;
        case 'replace':
          if (session.selection) session.setTool('replace');
          break;
        case 'rotate':
          session.rotateSelection(command.turns);
          break;
        case 'mirror':
          session.mirrorSelection(command.axis);
          break;
        case 'copy':
          if (session.copySelection()) this.status.set({ key: 'editor.status.copied' });
          break;
        case 'cut':
          session.cutSelection();
          break;
        case 'delete':
          session.deleteSelection();
          break;
        case 'paste':
          if (session.clipboard) session.setTool('paste');
          break;
        case 'confirmPaste':
          session.confirmPaste();
          break;
        case 'frame':
          this.renderer?.frame(session.selection ?? undefined);
          break;
        case 'cancel':
          this.cancel(session);
          break;
      }
    });
  }

  private cancel(session: EditorSession): void {
    if (this.menuOpen()) this.menuOpen.set(false);
    else if (session.toolId === 'paste' || session.toolId === 'replace') session.setTool('select');
    else if (session.selection) session.setSelection(null);
  }

  /** Runs an editor action and turns failures into a friendly message. */
  private guard(action: () => void): void {
    try {
      action();
    } catch (err) {
      if (err instanceof EditVolumeError) {
        this.error.set({
          key: 'editor.errors.volume',
          params: { volume: err.volume, limit: err.limit },
        });
      } else {
        console.error(err);
        this.error.set({ key: 'editor.errors.unknown' });
      }
    }
  }

  protected isActionDisabled(action: ActionButton): boolean {
    return action.needsClipboard ? !this.hasClipboard() : !this.hasSelection();
  }

  protected openPalette(): void {
    this.palette()?.show();
  }

  protected onBlockSelected(def: BlockDefinition): void {
    const session = this.session;
    if (!session) return;
    this.guard(() => {
      session.setActiveState(defaultState(def));
      if (session.toolId === 'remove' || session.toolId === 'pick-block') {
        session.setTool('place');
      }
    });
  }

  protected onLayerChange(limit: number | null): void {
    this.layer.set(limit);
    this.renderer?.setLayerLimit(limit);
  }

  protected openChat(): void {
    this.menuOpen.set(false);
    this.chatOpen.set(true);
    afterNextRender(() => this.updateViewInsets(), { injector: this.injector });
  }

  protected closeChat(): void {
    this.chatOpen.set(false);
    afterNextRender(
      () => {
        this.updateViewInsets();
        this.laraFab()?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  protected setChatSize(size: ChatSize): void {
    this.chatSize.set(size);
    afterNextRender(() => this.updateViewInsets(), { injector: this.injector });
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected frameFromMenu(): void {
    this.menuOpen.set(false);
    this.run({ kind: 'frame' });
  }

  protected async exportBuild(): Promise<void> {
    this.menuOpen.set(false);
    const id = this.loadedId;
    if (!id) return;
    this.error.set(null);
    try {
      await this.autosave.flush();
      const blob = await this.store.exportFile(id);
      const result = await saveFile(blob, buildFileName(this.name()), this.document);
      if (result !== 'cancelled') {
        this.status.set({ key: 'editor.status.exported', params: { name: this.name() } });
      }
    } catch (err) {
      const code = buildStoreErrorCode(err);
      if (code === 'unknown') console.error(err);
      this.error.set({
        key: STORAGE_ERROR_KEYS[code],
        params: { max: Math.round(MAX_IMPORT_BYTES / (1024 * 1024)) },
      });
    }
  }

  protected retrySave(): void {
    this.autosave.markDirty();
    void this.autosave.flush();
  }

  protected dismissError(): void {
    this.error.set(null);
  }

  protected dismissFirstRunHint(): void {
    this.firstRunHint.set(false);
    writeFlag(this.storage, FIRST_RUN_HINT_KEY);
  }

  /** Tells the renderer which canvas edges the toolbars and the layer slider cover. */
  private updateViewInsets(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    const rect = (ref: ElementRef<HTMLElement> | undefined) =>
      ref?.nativeElement.getBoundingClientRect();
    const canvas = this.canvas().nativeElement.getBoundingClientRect();
    const chat = rect(this.chatPanel());
    // Phone: the chat is a bottom sheet; desktop: a side panel on the right.
    const chatIsSheet = !!chat && chat.left <= canvas.left + 1;
    renderer.setViewInsets(
      chromeInsets(canvas, {
        top: rect(this.topBar()),
        bottom: chat && chatIsSheet ? chat : rect(this.bottomBar()),
        right: chat && !chatIsSheet ? chat : rect(this.layersPanel()),
      }),
    );
  }
}

/** True when `after` reaches outside `before` (or the build was empty). */
function grew(before: Box3 | undefined, after: Box3 | undefined): boolean {
  if (!after) return false;
  if (!before) return true;
  return (
    after.min.x < before.min.x ||
    after.min.y < before.min.y ||
    after.min.z < before.min.z ||
    after.max.x > before.max.x ||
    after.max.y > before.max.y ||
    after.max.z > before.max.z
  );
}
