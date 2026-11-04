import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
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
import { BuildStore } from '../storage/build-store';
import {
  BuildStoreErrorCode,
  BuildSummary,
  MAX_IMPORT_BYTES,
  buildFileName,
  buildStoreErrorCode,
} from '../storage/build-store.types';
import { saveFile } from '../storage/save-file';

type DialogState =
  | { readonly kind: 'create' }
  | { readonly kind: 'rename'; readonly build: BuildSummary }
  | { readonly kind: 'delete'; readonly build: BuildSummary };

interface Message {
  readonly key: string;
  readonly params?: Record<string, unknown>;
}

const ERROR_KEYS: Record<BuildStoreErrorCode, string> = {
  unavailable: 'storage.errors.unavailable',
  quota: 'storage.errors.quota',
  'not-found': 'storage.errors.notFound',
  'invalid-name': 'storage.errors.invalidName',
  'too-large': 'storage.errors.tooLarge',
  'invalid-file': 'storage.errors.invalidFile',
  'unsupported-version': 'storage.errors.unsupportedVersion',
  unknown: 'storage.errors.unknown',
};

/** Home page: the builds stored on this device ("My builds"). */
@Component({
  selector: 'lc-build-list',
  imports: [RouterLink, TranslocoPipe],
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

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('modal');
  private readonly initialFocus = viewChild<ElementRef<HTMLElement>>('initialFocus');
  private readonly injector = inject(Injector);
  private returnFocus: HTMLElement | null = null;

  protected readonly builds = resource({ loader: () => this.store.list() });
  protected readonly dialog = signal<DialogState | null>(null);
  protected readonly nameDraft = signal('');
  protected readonly busy = signal(false);
  protected readonly status = signal<Message | null>(null);
  protected readonly error = signal<Message | null>(null);
  protected readonly maxNameLength = MAX_NAME_LENGTH;

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
      if (message) this.status.set(message);
    } catch (err) {
      const code = buildStoreErrorCode(err);
      if (code === 'unknown') console.error(err);
      this.error.set({
        key: ERROR_KEYS[code],
        params: { max: Math.round(MAX_IMPORT_BYTES / (1024 * 1024)) },
      });
    } finally {
      this.busy.set(false);
      if (reload) this.builds.reload();
    }
  }
}
