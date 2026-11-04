import { DOCUMENT, DestroyRef, inject, signal } from '@angular/core';

export type AutosaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface AutosaveOptions {
  /** Quiet period after the last change before saving. Default 1000 ms. */
  delayMs?: number;
  /** Saves immediately when the page is hidden or unloaded (`visibilitychange`, `pagehide`). */
  document?: Document | null;
  onError?: (err: unknown) => void;
}

/**
 * Debounced autosave. Call {@link markDirty} after every change; the save
 * function runs `delayMs` after the last change, right away when the page is
 * hidden/closed (mobile apps are often killed in the background), and on
 * {@link flush}. Saves never overlap: changes made while saving trigger one
 * follow-up save.
 */
export class AutosaveController {
  private readonly delayMs: number;
  private readonly doc: Document | null;
  private readonly onError: (err: unknown) => void;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;
  private running: Promise<void> | undefined;
  private disposed = false;
  private readonly stateSignal = signal<AutosaveState>('idle');

  /** For UI ("Saved", "Saving…", "Not saved"). */
  readonly state = this.stateSignal.asReadonly();

  private readonly onHide = () => {
    if (this.doc?.visibilityState === 'hidden') void this.flush();
  };
  private readonly onPageHide = () => void this.flush();

  constructor(
    private readonly save: () => Promise<unknown>,
    options: AutosaveOptions = {},
  ) {
    this.delayMs = options.delayMs ?? 1000;
    this.doc = options.document ?? null;
    this.onError = options.onError ?? ((err) => console.error('Autosave failed', err));
    this.doc?.addEventListener('visibilitychange', this.onHide);
    this.doc?.defaultView?.addEventListener('pagehide', this.onPageHide);
  }

  get isDirty(): boolean {
    return this.dirty;
  }

  markDirty(): void {
    if (this.disposed) return;
    this.dirty = true;
    if (this.stateSignal() !== 'saving') this.stateSignal.set('dirty');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  /** Saves now if there are unsaved changes; resolves when everything is saved. */
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    while (this.running) await this.running;
    if (!this.dirty) return;
    this.dirty = false;
    this.stateSignal.set('saving');
    this.running = (async () => {
      try {
        await this.save();
        this.stateSignal.set(this.dirty ? 'dirty' : 'saved');
      } catch (err) {
        // Keep the changes marked unsaved so the next change or flush retries.
        this.dirty = true;
        this.stateSignal.set('error');
        this.onError(err);
      }
    })();
    try {
      await this.running;
    } finally {
      this.running = undefined;
    }
    // Changes arrived while saving and no timer is pending (e.g. a flush on pagehide).
    if (this.dirty && this.stateSignal() !== 'error' && !this.timer && !this.disposed) {
      await this.flush();
    }
  }

  /** Removes listeners and saves pending changes one last time. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.doc?.removeEventListener('visibilitychange', this.onHide);
    this.doc?.defaultView?.removeEventListener('pagehide', this.onPageHide);
    await this.flush();
  }
}

/**
 * Creates an {@link AutosaveController} bound to the current injection context:
 * listens on the app document and flushes + disposes when the owner is destroyed.
 */
export function injectAutosave(
  save: () => Promise<unknown>,
  options: Omit<AutosaveOptions, 'document'> = {},
): AutosaveController {
  const controller = new AutosaveController(save, { ...options, document: inject(DOCUMENT) });
  inject(DestroyRef).onDestroy(() => void controller.dispose());
  return controller;
}
