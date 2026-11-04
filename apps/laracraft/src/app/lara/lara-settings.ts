import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import type { ProviderConfig, ProviderKind, Usage } from '@laracraft/lara-agent';
import { LARA_SECRET_STORE } from './secret-store';

/** Lara provider settings WITHOUT the API key (stored in plain `localStorage`). */
export interface LaraPrefs {
  readonly kind: ProviderKind;
  readonly model: string;
  /** Only used for `openai-compatible`. */
  readonly baseUrl: string;
  /** Optional local limit of input + output tokens per day; null = no limit. */
  readonly dailyTokenLimit: number | null;
  /** Web only: keep the key in `localStorage` instead of `sessionStorage`. */
  readonly rememberKey: boolean;
}

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

export const DEFAULT_PREFS: LaraPrefs = Object.freeze({
  kind: 'anthropic',
  model: DEFAULT_ANTHROPIC_MODEL,
  baseUrl: '',
  dailyTokenLimit: null,
  rememberKey: false,
});

export const PREFS_KEY = 'laracraft.lara.settings';
export const USAGE_KEY = 'laracraft.lara.usage';

export type LaraPrefsError = 'model' | 'baseUrl' | 'apiKey' | 'limit';

/** Field errors of a settings form (empty when valid). */
export function validatePrefs(prefs: LaraPrefs, apiKey: string): LaraPrefsError[] {
  const errors: LaraPrefsError[] = [];
  if (!prefs.model.trim()) errors.push('model');
  if (prefs.kind === 'openai-compatible' && !isHttpUrl(prefs.baseUrl)) errors.push('baseUrl');
  if (!apiKey.trim()) errors.push('apiKey');
  const limit = prefs.dailyTokenLimit;
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) errors.push('limit');
  return errors;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Builds the agent's provider config from the stored settings and the key. */
export function toProviderConfig(prefs: LaraPrefs, apiKey: string): ProviderConfig {
  const base = { kind: prefs.kind, model: prefs.model.trim(), apiKey: apiKey.trim() };
  return prefs.kind === 'openai-compatible'
    ? { ...base, baseUrl: prefs.baseUrl.trim().replace(/\/+$/, '') }
    : base;
}

/** Parses stored prefs defensively (old or hand-edited values fall back to defaults). */
export function parsePrefs(raw: string | null): LaraPrefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof LaraPrefs, unknown>>;
    const kind: ProviderKind = v.kind === 'openai-compatible' ? 'openai-compatible' : 'anthropic';
    const limit = v.dailyTokenLimit;
    return {
      kind,
      model: typeof v.model === 'string' ? v.model : DEFAULT_PREFS.model,
      baseUrl: typeof v.baseUrl === 'string' ? v.baseUrl : '',
      dailyTokenLimit:
        typeof limit === 'number' && Number.isInteger(limit) && limit > 0 ? limit : null,
      rememberKey: v.rememberKey === true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

interface DailyUsage {
  readonly day: string;
  readonly tokens: number;
}

/** Local calendar day (the daily limit resets at local midnight). */
export function localDay(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/**
 * Lara's provider settings (ADR-0008): provider, model, base URL and the user's own API
 * key (kept in {@link LARA_SECRET_STORE}, never in logs, exports or build files), plus
 * the optional local daily token limit.
 */
@Injectable({ providedIn: 'root' })
export class LaraSettings {
  private readonly secrets = inject(LARA_SECRET_STORE);
  private readonly storage = localStorageOf(inject(DOCUMENT));
  private readonly prefsSignal = signal<LaraPrefs>(parsePrefs(this.read(PREFS_KEY)));
  private readonly hasKeySignal = signal<boolean | null>(null);
  private readonly usageSignal = signal<DailyUsage>(this.readUsage());
  private keyLoad: Promise<string | null> | null = null;

  /** Where the key is stored (`native` = system keychain). */
  readonly secretKind = this.secrets.kind;
  readonly prefs = this.prefsSignal.asReadonly();
  /** null until the key store was asked once (see {@link load}). */
  readonly hasKey = this.hasKeySignal.asReadonly();
  readonly configured = computed(() => this.hasKey() === true && this.prefsValid());
  /** Tokens used today (input + output), for the limit and the settings screen. */
  readonly tokensToday = computed(() => {
    const u = this.usageSignal();
    return u.day === localDay(new Date()) ? u.tokens : 0;
  });
  readonly limitReached = computed(() => {
    const limit = this.prefs().dailyTokenLimit;
    return limit !== null && this.tokensToday() >= limit;
  });

  private readonly prefsValid = computed(
    () => validatePrefs(this.prefs(), 'x').filter((e) => e !== 'limit').length === 0,
  );

  /** Reads whether a key is stored (once); resolves to {@link configured}. */
  async load(): Promise<boolean> {
    await this.key();
    return this.configured();
  }

  /** The stored key (memory-cached after the first read). */
  key(): Promise<string | null> {
    this.keyLoad ??= this.secrets.get().then(
      (key) => {
        this.hasKeySignal.set(!!key);
        return key;
      },
      () => {
        this.hasKeySignal.set(false);
        return null;
      },
    );
    return this.keyLoad;
  }

  /** The config for the agent, or null when Lara is not set up. */
  async providerConfig(): Promise<ProviderConfig | null> {
    const key = await this.key();
    if (!key || !this.prefsValid()) return null;
    return toProviderConfig(this.prefs(), key);
  }

  /**
   * Stores the settings; `apiKey` replaces the stored key (omit to keep it, e.g. when only
   * the model changed). Moving between session and local storage follows `rememberKey`.
   */
  async save(prefs: LaraPrefs, apiKey?: string): Promise<void> {
    const clean: LaraPrefs = { ...prefs, model: prefs.model.trim(), baseUrl: prefs.baseUrl.trim() };
    const key = apiKey?.trim() || (await this.key());
    if (key) await this.secrets.set(key, { persist: clean.rememberKey });
    this.write(PREFS_KEY, JSON.stringify(clean));
    this.prefsSignal.set(clean);
    this.keyLoad = Promise.resolve(key ?? null);
    this.hasKeySignal.set(!!key);
  }

  /** Removes the key from every storage (settings stay). */
  async clearKey(): Promise<void> {
    await this.secrets.clear();
    this.keyLoad = Promise.resolve(null);
    this.hasKeySignal.set(false);
  }

  /** Adds a turn's usage to today's total. */
  recordUsage(usage: Usage): void {
    const day = localDay(new Date());
    const tokens = (this.tokensToday() || 0) + usage.inputTokens + usage.outputTokens;
    const next = { day, tokens };
    this.usageSignal.set(next);
    this.write(USAGE_KEY, JSON.stringify(next));
  }

  private readUsage(): DailyUsage {
    try {
      const v = JSON.parse(this.read(USAGE_KEY) ?? 'null') as Partial<DailyUsage> | null;
      if (v && typeof v.day === 'string' && typeof v.tokens === 'number') {
        return { day: v.day, tokens: v.tokens };
      }
    } catch {
      /* corrupt: start over */
    }
    return { day: '', tokens: 0 };
  }

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      /* private mode / quota: settings last for this session only */
    }
  }
}

function localStorageOf(doc: Document): Storage | undefined {
  try {
    return doc.defaultView?.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}
