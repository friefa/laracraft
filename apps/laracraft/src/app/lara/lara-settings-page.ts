import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { LaraErrorCode, ProviderKind } from '@laracraft/lara-agent';
import { Icon } from '../editor/icon';
import { LanguageService } from '../i18n/language.service';
import { Lara } from '../shared/lara/lara';
import { errorKey } from './chat-model';
import { LARA_AGENT } from './lara-agent';
import {
  DEFAULT_ANTHROPIC_MODEL,
  type LaraPrefs,
  type LaraPrefsError,
  LaraSettings,
  toProviderConfig,
  validatePrefs,
} from './lara-settings';
import { environment } from '../../environments/environment';

type TestState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'testing' }
  | { readonly kind: 'ok'; readonly model: string }
  | { readonly kind: 'failed'; readonly code: LaraErrorCode };

/**
 * Lara settings (`settings/lara`, ADR-0008): provider, model, base URL, the user's own API
 * key (masked, show/hide), "test connection", optional daily token limit, clear key, and
 * the cost / privacy / storage notes. `?from=<buildId>` returns to that build.
 */
@Component({
  selector: 'lc-lara-settings-page',
  imports: [RouterLink, TranslocoPipe, Icon, Lara],
  templateUrl: './lara-settings-page.html',
  styleUrl: './lara-settings-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LaraSettingsPage {
  private readonly settings = inject(LaraSettings);
  private readonly loadAgent = inject(LARA_AGENT);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  private testAbort: AbortController | null = null;

  /** Build to return to (query parameter, component input binding). */
  readonly from = input<string | undefined>(undefined);

  protected readonly errorKey = errorKey;
  protected readonly sandboxedPreview = environment.sandboxedPreview;
  protected readonly secretKind = this.settings.secretKind;
  protected readonly hasKey = this.settings.hasKey;
  protected readonly tokensToday = computed(() =>
    new Intl.NumberFormat(this.language.lang()).format(this.settings.tokensToday()),
  );

  protected readonly kind = signal<ProviderKind>(this.settings.prefs().kind);
  protected readonly model = signal(this.settings.prefs().model);
  protected readonly baseUrl = signal(this.settings.prefs().baseUrl);
  protected readonly apiKey = signal('');
  protected readonly showKey = signal(false);
  protected readonly remember = signal(this.settings.prefs().rememberKey);
  protected readonly limit = signal(String(this.settings.prefs().dailyTokenLimit ?? ''));
  protected readonly submitted = signal(false);
  protected readonly test = signal<TestState>({ kind: 'idle' });
  protected readonly status = signal<string | null>(null);
  protected readonly testOkModel = computed(() => {
    const t = this.test();
    return t.kind === 'ok' ? t.model : null;
  });
  protected readonly testError = computed(() => {
    const t = this.test();
    return t.kind === 'failed' ? t.code : null;
  });

  protected readonly backLink = computed(() => {
    const from = this.from();
    return from ? ['/build', from] : ['/'];
  });

  private readonly prefs = computed<LaraPrefs>(() => ({
    kind: this.kind(),
    model: this.model(),
    baseUrl: this.baseUrl(),
    dailyTokenLimit: this.limit().trim() === '' ? null : Number(this.limit()),
    rememberKey: this.remember(),
  }));

  /** Field errors; the stored key counts when the key field is left empty. */
  protected readonly errors = computed<ReadonlySet<LaraPrefsError>>(
    () => new Set(validatePrefs(this.prefs(), this.apiKey() || (this.hasKey() ? 'stored' : ''))),
  );

  protected showError(field: LaraPrefsError): boolean {
    return this.submitted() && this.errors().has(field);
  }

  constructor() {
    void this.settings.load();
    inject(DestroyRef).onDestroy(() => this.testAbort?.abort());
  }

  protected setKind(kind: ProviderKind): void {
    if (kind === this.kind()) return;
    // Swap the default model, keep anything the user typed.
    if (kind === 'openai-compatible' && this.model() === DEFAULT_ANTHROPIC_MODEL)
      this.model.set('');
    if (kind === 'anthropic' && !this.model().trim()) this.model.set(DEFAULT_ANTHROPIC_MODEL);
    this.kind.set(kind);
    this.test.set({ kind: 'idle' });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected async testConnection(): Promise<void> {
    this.submitted.set(true);
    if (this.errors().size > 0) return;
    const key = this.apiKey().trim() || (await this.settings.key());
    if (!key) return;
    this.testAbort?.abort();
    const abort = new AbortController();
    this.testAbort = abort;
    this.test.set({ kind: 'testing' });
    try {
      const agent = await this.loadAgent();
      const result = await agent.testProvider(toProviderConfig(this.prefs(), key), abort.signal);
      if (abort.signal.aborted) return;
      this.test.set(
        result.ok
          ? { kind: 'ok', model: result.model }
          : { kind: 'failed', code: result.error.code },
      );
    } catch {
      if (!abort.signal.aborted) this.test.set({ kind: 'failed', code: 'network' });
    }
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    this.submitted.set(true);
    if (this.errors().size > 0) return;
    try {
      await this.settings.save(this.prefs(), this.apiKey() || undefined);
    } catch {
      this.status.set('lara.settings.saveError');
      return;
    }
    this.apiKey.set('');
    this.showKey.set(false);
    this.status.set('lara.settings.saved');
    if (this.from()) await this.router.navigate(this.backLink());
  }

  protected async clearKey(): Promise<void> {
    await this.settings.clearKey();
    this.apiKey.set('');
    this.test.set({ kind: 'idle' });
    this.status.set('lara.settings.cleared');
  }
}
