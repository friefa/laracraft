/**
 * Shape of `credits.json` as written by `nx run textures:credits`
 * (source of truth: `tools/textures/src/lib/credits.ts`). Served at `assets/textures/credits.json`.
 */
export interface CreditGroup {
  pack: string;
  title: string;
  kind: 'own' | 'third-party';
  authors: string[];
  license: string;
  licenseUrl: string;
  sourceUrl?: string;
  version?: string;
  modifications: string;
  shareAlike: boolean;
  /** Ready-made attribution line (title, author, source, license). */
  attribution: string;
  textures: string[];
}

export interface Credits {
  version: 1;
  shareAlike: boolean;
  groups: CreditGroup[];
}

export const CREDITS_URL = 'assets/textures/credits.json';
/** Emitted by the Angular build (`extractLicenses`); written next to index.html (outputPath.browser is empty). */
export const THIRD_PARTY_LICENSES_URL = '3rdpartylicenses.txt';

/** Light structural check so a stale or foreign file shows the error state instead of crashing. */
export function parseCredits(raw: unknown): Credits {
  const data = raw as Partial<Credits> | null;
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.groups) ||
    !data.groups.every(
      (g) =>
        typeof g?.title === 'string' &&
        Array.isArray(g.authors) &&
        typeof g.license === 'string' &&
        typeof g.licenseUrl === 'string' &&
        Array.isArray(g.textures),
    )
  ) {
    throw new Error('Unsupported credits.json format');
  }
  return data as Credits;
}
