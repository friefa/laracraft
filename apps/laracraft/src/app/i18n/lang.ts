/** Languages the UI ships translations for (`public/i18n/<lang>.json`). */
export const SUPPORTED_LANGS = ['de', 'en'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

export const FALLBACK_LANG: Lang = 'en';
export const LANG_STORAGE_KEY = 'laracraft.lang';

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (SUPPORTED_LANGS as readonly string[]).includes(value);
}

/** Maps a BCP 47 tag such as `de-AT` to a supported language, if any. */
export function matchLang(tag: string | null | undefined): Lang | undefined {
  const primary = tag?.toLowerCase().split(/[-_]/)[0];
  return isLang(primary) ? primary : undefined;
}

/** Reads the persisted choice; storage may be unavailable (private mode, sandboxed WebView). */
export function readStoredLang(storage: Storage | undefined): Lang | undefined {
  try {
    const value = storage?.getItem(LANG_STORAGE_KEY);
    return isLang(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function writeStoredLang(storage: Storage | undefined, lang: Lang): void {
  try {
    storage?.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Persisting is best effort only.
  }
}

/** Stored choice, else the first supported device/browser language, else English. */
export function resolveInitialLang(
  storage: Storage | undefined,
  navigatorLangs: readonly string[] | undefined,
): Lang {
  const stored = readStoredLang(storage);
  if (stored) return stored;
  for (const tag of navigatorLangs ?? []) {
    const lang = matchLang(tag);
    if (lang) return lang;
  }
  return FALLBACK_LANG;
}
