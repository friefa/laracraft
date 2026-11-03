import { DOCUMENT, Injectable, PendingTasks, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { FALLBACK_LANG, Lang, SUPPORTED_LANGS, resolveInitialLang, writeStoredLang } from './lang';

function safeLocalStorage(win: Window | null): Storage | undefined {
  try {
    return win?.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

/** Active UI language: switches Transloco at runtime, persists the choice, syncs `<html lang>`. */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);
  private readonly pendingTasks = inject(PendingTasks);
  private readonly storage = safeLocalStorage(this.document.defaultView);
  private readonly activeLang = signal<Lang>(FALLBACK_LANG);

  readonly langs = SUPPORTED_LANGS;
  readonly lang = this.activeLang.asReadonly();

  /** Picks the initial language and waits for its translations (runs as app initializer). */
  async init(): Promise<void> {
    const nav = this.document.defaultView?.navigator;
    const navLangs = nav?.languages?.length ? nav.languages : [nav?.language ?? ''];
    await this.apply(resolveInitialLang(this.storage, navLangs));
  }

  async use(lang: Lang): Promise<void> {
    writeStoredLang(this.storage, lang);
    await this.apply(lang);
  }

  private async apply(lang: Lang): Promise<void> {
    // Keeps the app "unstable" while loading, so `whenStable()` covers a language switch.
    const done = this.pendingTasks.add();
    try {
      // Load before switching so a switch never renders raw keys.
      await firstValueFrom(this.transloco.load(lang));
    } catch (err) {
      // Keep the app usable; Transloco falls back to the fallback language.
      console.error(`Failed to load translations for "${lang}"`, err);
    }
    try {
      this.transloco.setActiveLang(lang);
      this.activeLang.set(lang);
      this.document.documentElement.lang = lang;
    } finally {
      done();
    }
  }
}
