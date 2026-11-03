import { LANG_STORAGE_KEY, matchLang, resolveInitialLang, writeStoredLang } from './lang';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

const throwingStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
} as unknown as Storage;

describe('lang', () => {
  it('matches region tags to supported languages', () => {
    expect(matchLang('de-AT')).toBe('de');
    expect(matchLang('EN_gb')).toBe('en');
    expect(matchLang('fr-FR')).toBeUndefined();
    expect(matchLang(undefined)).toBeUndefined();
  });

  it('prefers the stored choice over the device language', () => {
    expect(resolveInitialLang(memoryStorage({ [LANG_STORAGE_KEY]: 'en' }), ['de-DE'])).toBe('en');
  });

  it('uses the first supported device language, else English', () => {
    expect(resolveInitialLang(memoryStorage(), ['fr', 'de-CH', 'en'])).toBe('de');
    expect(resolveInitialLang(memoryStorage(), ['fr', 'it'])).toBe('en');
    expect(resolveInitialLang(undefined, undefined)).toBe('en');
  });

  it('ignores invalid stored values', () => {
    expect(resolveInitialLang(memoryStorage({ [LANG_STORAGE_KEY]: 'xx' }), ['de'])).toBe('de');
  });

  it('survives unavailable storage', () => {
    expect(resolveInitialLang(throwingStorage, ['de'])).toBe('de');
    expect(() => writeStoredLang(throwingStorage, 'de')).not.toThrow();
  });
});
