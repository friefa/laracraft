import { TestBed } from '@angular/core/testing';
import {
  DEFAULT_PREFS,
  LaraSettings,
  PREFS_KEY,
  isHttpUrl,
  parsePrefs,
  toProviderConfig,
  validatePrefs,
} from './lara-settings';
import { LARA_KEY_NAME, LARA_SECRET_STORE, type SecretStore, webSecretStore } from './secret-store';

function memorySecrets(initial: string | null = null): SecretStore & { value: string | null } {
  const store = {
    kind: 'web' as const,
    value: initial,
    get: vi.fn(async () => store.value),
    set: vi.fn(async (v: string) => {
      store.value = v;
    }),
    clear: vi.fn(async () => {
      store.value = null;
    }),
  };
  return store;
}

function setup(secrets = memorySecrets()) {
  TestBed.configureTestingModule({
    providers: [{ provide: LARA_SECRET_STORE, useValue: secrets }],
  });
  return { settings: TestBed.inject(LaraSettings), secrets };
}

describe('Lara settings helpers', () => {
  it('validates the form', () => {
    expect(validatePrefs(DEFAULT_PREFS, 'sk-ant-123')).toEqual([]);
    expect(validatePrefs({ ...DEFAULT_PREFS, model: ' ' }, '')).toEqual(['model', 'apiKey']);
    const compat = { ...DEFAULT_PREFS, kind: 'openai-compatible' as const, baseUrl: 'ftp://x' };
    expect(validatePrefs(compat, 'k')).toEqual(['baseUrl']);
    expect(validatePrefs({ ...DEFAULT_PREFS, dailyTokenLimit: 1.5 }, 'k')).toEqual(['limit']);
    expect(isHttpUrl('http://localhost:11434/v1')).toBe(true);
    expect(isHttpUrl('nope')).toBe(false);
  });

  it('builds provider configs (base URL only for compatible endpoints)', () => {
    expect(toProviderConfig({ ...DEFAULT_PREFS, baseUrl: 'https://x' }, ' key ')).toEqual({
      kind: 'anthropic',
      model: 'claude-opus-5-5',
      apiKey: 'key',
    });
    expect(
      toProviderConfig(
        { ...DEFAULT_PREFS, kind: 'openai-compatible', model: 'llama3.1', baseUrl: 'http://h/v1/' },
        'k',
      ),
    ).toEqual({
      kind: 'openai-compatible',
      model: 'llama3.1',
      apiKey: 'k',
      baseUrl: 'http://h/v1',
    });
  });

  it('parses stored prefs defensively', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{oops')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{"kind":"x","dailyTokenLimit":-3,"rememberKey":"yes"}')).toEqual(
      DEFAULT_PREFS,
    );
    expect(parsePrefs('{"kind":"openai-compatible","model":"m","dailyTokenLimit":5000}')).toEqual({
      ...DEFAULT_PREFS,
      kind: 'openai-compatible',
      model: 'm',
      dailyTokenLimit: 5000,
    });
  });
});

describe('LaraSettings', () => {
  beforeEach(() => localStorage.clear());

  it('is not configured without a key', async () => {
    const { settings } = setup();
    expect(await settings.load()).toBe(false);
    expect(await settings.providerConfig()).toBeNull();
  });

  it('saves prefs without the key and the key in the secret store', async () => {
    const { settings, secrets } = setup();
    await settings.save({ ...DEFAULT_PREFS, rememberKey: true }, ' sk-ant-secret ');
    expect(secrets.set).toHaveBeenCalledWith('sk-ant-secret', { persist: true });
    expect(localStorage.getItem(PREFS_KEY)).not.toContain('sk-ant');
    expect(settings.configured()).toBe(true);
    expect((await settings.providerConfig())?.apiKey).toBe('sk-ant-secret');

    // Saving again without a key keeps the stored one.
    await settings.save({ ...DEFAULT_PREFS, model: 'claude-x' });
    expect(secrets.value).toBe('sk-ant-secret');
    expect((await settings.providerConfig())?.model).toBe('claude-x');

    await settings.clearKey();
    expect(settings.configured()).toBe(false);
    expect(secrets.value).toBeNull();
  });

  it('tracks daily usage against the optional limit', async () => {
    const { settings } = setup(memorySecrets('k'));
    await settings.save({ ...DEFAULT_PREFS, dailyTokenLimit: 1000 });
    expect(await settings.usageStore.dailyLimit()).toBe(1000);
    settings.usageStore.add(600, { inputTokens: 500, outputTokens: 100 });
    expect(settings.limitReached()).toBe(false);
    settings.usageStore.add(400, { inputTokens: 300, outputTokens: 100 });
    expect(await settings.usageStore.usedToday()).toBe(1000);
    expect(settings.limitReached()).toBe(true);
  });
});

describe('webSecretStore', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps the key for the session unless asked to remember it', async () => {
    const store = webSecretStore(sessionStorage, localStorage);
    await store.set('k1', { persist: false });
    expect(sessionStorage.getItem(LARA_KEY_NAME)).toBe('k1');
    expect(localStorage.getItem(LARA_KEY_NAME)).toBeNull();

    await store.set('k2', { persist: true });
    expect(localStorage.getItem(LARA_KEY_NAME)).toBe('k2');
    expect(sessionStorage.getItem(LARA_KEY_NAME)).toBeNull();
    expect(await store.get()).toBe('k2');

    await store.clear();
    expect(await store.get()).toBeNull();
  });
});
