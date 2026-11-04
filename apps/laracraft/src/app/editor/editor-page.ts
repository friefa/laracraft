import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  InjectionToken,
  PendingTasks,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
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
import { Icon, type IconName } from './icon';
import { BlockIcon } from './palette/block-icon';
import { BlockPalette } from './palette/block-palette';
import {
  type EditorRenderer,
  type LookDirection,
  RENDERER_FACTORY,
  RendererLoadError,
} from './renderer-loader';

/** Quiet period before an autosave (overridable in tests). */
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
}

const TOOLS: readonly ToolButton[] = [
  { tool: 'place', icon: 'place', label: 'editor.tool.place', shortcut: '1' },
  { tool: 'remove', icon: 'remove', label: 'editor.tool.remove', shortcut: '2' },
  { tool: 'pick-block', icon: 'pick', label: 'editor.tool.pickBlock', shortcut: '3' },
  { tool: 'select', icon: 'select', label: 'editor.tool.select', shortcut: '4' },
];

const SELECTION_ACTIONS: readonly ActionButton[] = [
  { command: { kind: 'fill' }, icon: 'fill', label: 'editor.selection.fill' },
  { command: { kind: 'replace' }, icon: 'replace', label: 'editor.selection.replace' },
  {
    command: { kind: 'rotate', turns: 3 },
    icon: 'rotateLeft',
    label: 'editor.selection.rotateLeft',
  },
  {
    command: { kind: 'rotate', turns: 1 },
    icon: 'rotateRight',
    label: 'editor.selection.rotateRight',
  },
  { command: { kind: 'mirror', axis: 'x' }, icon: 'mirrorX', label: 'editor.selection.mirrorX' },
  { command: { kind: 'mirror', axis: 'z' }, icon: 'mirrorZ', label: 'editor.selection.mirrorZ' },
  { command: { kind: 'copy' }, icon: 'copy', label: 'editor.selection.copy' },
  { command: { kind: 'cut' }, icon: 'cut', label: 'editor.selection.cut' },
  { command: { kind: 'delete' }, icon: 'delete', label: 'editor.selection.delete' },
];

const PASTE_ACTION: ActionButton = {
  command: { kind: 'paste' },
  icon: 'paste',
  label: 'editor.selection.paste',
  needsClipboard: true,
};

const SAVE_STATE_KEYS = {
  idle: 'editor.save.saved',
  saved: 'editor.save.saved',
  dirty: 'editor.save.dirty',
  saving: 'editor.save.saving',
  error: 'editor.save.error',
} as const;

/** Session extension added in parallel (3D look for pistons/observers); optional here. */
type LookAwareSession = EditorSession & {
  setLookVertical?(vertical: LookDirection['pitch'] | undefined): void;
};

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
  imports: [RouterLink, TranslocoPipe, Icon, BlockIcon, BlockPalette],
  templateUrl: './editor-page.html',
  styleUrl: './editor-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
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
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly palette = viewChild(BlockPalette);
  private readonly menuRoot = viewChild<ElementRef<HTMLElement>>('menuRoot');

  private session: LookAwareSession | null = null;
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

  protected readonly activeBlock = computed<BlockDefinition | undefined>(() => {
    const state = this.activeState();
    return state ? this.registry.get(parseBlockState(state).id) : undefined;
  });

  protected readonly layerMin = computed(() => this.bounds()?.min.y ?? 0);
  protected readonly layerMax = computed(() => this.bounds()?.max.y ?? 0);
  protected readonly showLayers = computed(() => this.layerMax() > this.layerMin());
  protected readonly layerValue = computed(() => this.layer() ?? this.layerMax());

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
        return this.bounds() ? null : 'editor.hint.empty';
    }
  });

  protected readonly autosave = injectAutosave(() => this.saveNow(), {
    delayMs: inject(EDITOR_AUTOSAVE_DELAY),
    onError: (err) => console.error('Autosave failed', err),
  });
  protected readonly saveStateKey = computed(() => SAVE_STATE_KEYS[this.autosave.state()]);

  constructor() {
    afterNextRender(() => void this.init());
    this.destroyRef.onDestroy(() => {
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
    renderer.setDocument(session.doc);
    renderer.setLayerLimit(this.layer());
    renderer.setSelectionBox(session.selection);
    renderer.setGhosts(session.preview);
    const off = renderer.onTap((pick, event) => this.onTap(pick, event));
    this.destroyRef.onDestroy(off);
  }

  private onSessionEvent(session: EditorSession, event: EditorEvent): void {
    switch (event.kind) {
      case 'document':
        this.renderer?.update();
        this.bounds.set(session.doc.volume.bounds());
        this.autosave.markDirty();
        break;
      case 'history':
        this.canUndo.set(session.canUndo);
        this.canRedo.set(session.canRedo);
        break;
      case 'selection':
        this.hasSelection.set(session.selection !== null);
        this.renderer?.setSelectionBox(session.selection);
        break;
      case 'preview':
        this.renderer?.setGhosts(session.preview);
        this.pastePending.set(session.pastePosition !== null);
        break;
      case 'tool':
        this.tool.set(session.toolId);
        this.pastePending.set(session.pastePosition !== null);
        break;
      case 'activeState':
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

  // --- input -------------------------------------------------------------------

  private onTap(pick: Pick | null, event: PointerEvent): void {
    const session = this.session;
    if (!session) return;
    this.menuOpen.set(false);
    const look = this.renderer?.lookDirection();
    if (look) {
      session.setLookHorizontal(look.facing);
      if ('setLookVertical' in session) session.setLookVertical?.(look.pitch);
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

  protected onLayerInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    const limit = value >= this.layerMax() ? null : value;
    this.layer.set(limit);
    this.renderer?.setLayerLimit(limit);
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
}
