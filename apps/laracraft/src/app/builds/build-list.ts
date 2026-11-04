import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MAX_NAME_LENGTH } from '@laracraft/core-model';
import { LanguageService } from '../i18n/language.service';
import { Lara } from '../shared/lara/lara';
import { BuildStore } from '../storage/build-store';
import {
  BuildSummary,
  MAX_IMPORT_BYTES,
  STORAGE_ERROR_KEYS,
  buildFileName,
  buildStoreErrorCode,
} from '../storage/build-store.types';
import { saveFile } from '../storage/save-file';
import {
  EXAMPLE_IDS,
  EXAMPLE_LOADER,
  type ExampleId,
  exampleCopy,
  exampleDescriptionKey,
  exampleNameKey,
} from './examples';

/** An example file could not be fetched or parsed (offline, missing file …). */
class ExampleLoadError extends Error {
  override readonly name = 'ExampleLoadError';
}

type DialogState =
  | { readonly kind: 'create' }
  | { readonly kind: 'examples' }
  | { readonly kind: 'rename'; readonly build: BuildSummary }
  | { readonly kind: 'delete'; readonly build: BuildSummary };

/** Tile colours for build cards (picked from the id) and examples. */
const TONES = ['green', 'blue', 'orange', 'purple', 'yellow', 'red'] as const;
type Tone = (typeof TONES)[number];

const EXAMPLE_TONES: Record<ExampleId, Tone> = {
  house: 'orange',
  tower: 'purple',
  'sand-arch': 'yellow',
  'piston-door': 'green',
  'observer-clock': 'red',
  waterfall: 'blue',
};

/** How long a status toast stays visible. */
const TOAST_MS = 4000;

interface Message {
  readonly key: string;
  readonly params?: Record<string, unknown>;
}

/** Home page: the builds stored on this device ("My builds"). */
@Component({
  selector: 'lc-build-list',
  imports: [RouterLink, TranslocoPipe, Lara],
  templateUrl: './build-list.html',
  styleUrl: './build-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BuildListPage {
  private readonly store = inject(BuildStore);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  private readonly document = inject(DOCUMENT);
  private readonly loadExample = inject(EXAMPLE_LOADER);

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('modal');
  private readonly initialFocus = viewChild<ElementRef<HTMLElement>>('initialFocus');
  private readonly injector = inject(Injector);
  private returnFocus: HTMLElement | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly builds = resource({ loader: () => this.store.list() });
  protected readonly dialog = signal<DialogState | null>(null);
  protected readonly nameDraft = signal('');
  protected readonly busy = signal(false);
  protected readonly status = signal<Message | null>(null);
  protected readonly error = signal<Message | null>(null);
  protected readonly maxNameLength = MAX_NAME_LENGTH;
  protected readonly examples = EXAMPLE_IDS;
  protected readonly exampleNameKey = exampleNameKey;
  protected readonly exampleDescriptionKey = exampleDescriptionKey;
  protected readonly exampleTone = EXAMPLE_TONES;
  protected readonly isEmpty = computed(
    () => this.builds.hasValue() && this.builds.value().length === 0,
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.toastTimer));
  }

  /** A stable colour per build, so cards are easy to tell apart. */
  protected toneOf(id: string): Tone {
    let hash = 0;
    for (const ch of id) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
    return TONES[hash % TONES.length] as Tone;
  }

  /** Places a card's overflow menu next to its trigger (no CSS anchor positioning needed). */
  protected placeMenu(event: Event, trigger: HTMLElement): void {
    if ((event as ToggleEvent).newState !== 'open') return;
    const menu = event.target as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    const view = this.document.documentElement;
    const below = rect.bottom < view.clientHeight / 2;
    menu.style.right = `${Math.max(8, view.clientWidth - rect.right)}px`;
    menu.style.top = below ? `${rect.bottom + 8}px` : 'auto';
    menu.style.bottom = below ? 'auto' : `${view.clientHeight - rect.top + 8}px`;
  }

  /** Closes an overflow menu before its action and returns focus to the menu button. */
  protected fromMenu(menu: HTMLElement, trigger: HTMLElement): void {
    try {
      menu.hidePopover?.();
    } catch {
      // Not open (or popovers unsupported): nothing to close.
    }
    trigger.focus();
  }

  private readonly dateFormat = computed(
    () =>
      new Intl.DateTimeFormat(this.language.lang(), { dateStyle: 'medium', timeStyle: 'short' }),
  );

  protected formatDate(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : this.dateFormat().format(date);
  }

  protected openCreate(): void {
    this.nameDraft.set(this.transloco.translate('builds.defaultName'));
    this.showDialog({ kind: 'create' });
  }

  protected openExamples(): void {
    this.showDialog({ kind: 'examples' });
  }

  /** Copies an example build into the user's store and opens it in the editor. */
  protected async openExample(id: ExampleId): Promise<void> {
    this.closeDialog();
    await this.act(async () => {
      let file: Blob;
      try {
        file = exampleCopy(await this.loadExample(id), {
          name: this.transloco.translate(exampleNameKey(id)),
          description: this.transloco.translate(exampleDescriptionKey(id)),
          now: new Date(),
        });
      } catch (err) {
        throw new ExampleLoadError(`Example ${id} could not be loaded`, { cause: err });
      }
      const buildId = await this.store.importFile(file);
      await this.router.navigate(['/build', buildId]);
    });
  }

  protected openRename(build: BuildSummary): void {
    this.nameDraft.set(build.name);
    this.showDialog({ kind: 'rename', build });
  }

  protected openDelete(build: BuildSummary): void {
    this.showDialog({ kind: 'delete', build });
  }

  protected onNameInput(event: Event): void {
    this.nameDraft.set((event.target as HTMLInputElement).value);
  }

  protected closeDialog(): void {
    const el = this.dialogRef().nativeElement;
    if (typeof el.close === 'function') el.close();
    else el.removeAttribute('open');
    this.onDialogClosed();
  }

  /** Also fires for Escape (native `close` event). */
  protected onDialogClosed(): void {
    if (!this.dialog()) return;
    this.dialog.set(null);
    const target = this.returnFocus;
    this.returnFocus = null;
    if (target?.isConnected) target.focus();
  }

  protected async submitDialog(event: Event): Promise<void> {
    event.preventDefault();
    const state = this.dialog();
    if (!state || this.busy()) return;
    const name = this.nameDraft().trim();
    if (state.kind !== 'delete' && !name) return;
    this.closeDialog();
    switch (state.kind) {
      case 'create':
        await this.act(async () => {
          const id = await this.store.create(name);
          await this.router.navigate(['/build', id]);
        });
        break;
      case 'rename':
        await this.act(async () => {
          const summary = await this.store.rename(state.build.id, name);
          return { key: 'builds.status.renamed', params: { name: summary.name } };
        });
        break;
      case 'delete':
        await this.act(async () => {
          await this.store.delete(state.build.id);
          return { key: 'builds.status.deleted', params: { name: state.build.name } };
        });
        break;
    }
  }

  protected duplicate(build: BuildSummary): Promise<void> {
    return this.act(async () => {
      const name = this.transloco
        .translate('builds.copyName', { name: build.name })
        .slice(0, MAX_NAME_LENGTH);
      await this.store.duplicate(build.id, name);
      return { key: 'builds.status.duplicated', params: { name } };
    });
  }

  protected exportBuild(build: BuildSummary): Promise<void> {
    return this.act(async () => {
      const blob = await this.store.exportFile(build.id);
      const result = await saveFile(blob, buildFileName(build.name), this.document);
      return result === 'cancelled'
        ? undefined
        : { key: 'builds.status.exported', params: { name: build.name } };
    }, false);
  }

  protected async onImport(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset so choosing the same file again fires `change` again.
    input.value = '';
    if (!file) return;
    await this.act(async () => {
      const id = await this.store.importFile(file);
      const summary = (await this.store.list()).find((b) => b.id === id);
      return { key: 'builds.status.imported', params: { name: summary?.name ?? file.name } };
    });
  }

  protected dismissError(): void {
    this.error.set(null);
  }

  private showDialog(state: DialogState): void {
    const active = this.document.activeElement;
    this.returnFocus = active instanceof HTMLElement ? active : null;
    this.error.set(null);
    this.dialog.set(state);
    const el = this.dialogRef().nativeElement;
    if (!el.open) {
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
    }
    // The dialog content renders on the next change detection; focus its first control then.
    afterNextRender(
      () => {
        const target = this.initialFocus()?.nativeElement;
        target?.focus();
        if (target instanceof HTMLInputElement) target.select();
      },
      { injector: this.injector },
    );
  }

  private showStatus(message: Message): void {
    clearTimeout(this.toastTimer);
    this.status.set(message);
    this.toastTimer = setTimeout(() => this.status.set(null), TOAST_MS);
  }

  /** Runs a store action with busy state, error mapping and an optional status message. */
  private async act(
    action: () => Promise<Message | void | undefined>,
    reload = true,
  ): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.status.set(null);
    try {
      const message = await action();
      if (message) this.showStatus(message);
    } catch (err) {
      if (err instanceof ExampleLoadError) {
        console.error(err);
        this.error.set({ key: 'builds.examples.loadError' });
        return;
      }
      const code = buildStoreErrorCode(err);
      if (code === 'unknown') console.error(err);
      this.error.set({
        key: STORAGE_ERROR_KEYS[code],
        params: { max: Math.round(MAX_IMPORT_BYTES / (1024 * 1024)) },
      });
    } finally {
      this.busy.set(false);
      if (reload) this.builds.reload();
    }
  }
}
