import de from '../../../public/i18n/de.json';
import en from '../../../public/i18n/en.json';
import { SUPPORTED_LANGS } from './lang';

function flatKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => flatKeys(v, prefix ? `${prefix}.${k}` : k));
}

function placeholders(obj: unknown): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const walk = (o: unknown, prefix: string) => {
    if (typeof o === 'string') {
      out.set(prefix, [...o.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1] ?? '').sort());
    } else if (typeof o === 'object' && o !== null) {
      for (const [k, v] of Object.entries(o)) walk(v, prefix ? `${prefix}.${k}` : k);
    }
  };
  walk(obj, '');
  return out;
}

describe('translation files', () => {
  const files: Record<string, unknown> = { de, en };

  it('exist for every supported language', () => {
    expect(Object.keys(files).sort()).toEqual([...SUPPORTED_LANGS].sort());
  });

  it('have identical key sets', () => {
    expect(flatKeys(de).sort()).toEqual(flatKeys(en).sort());
  });

  it('have no empty values and use the same interpolation params', () => {
    for (const key of flatKeys(en)) {
      const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], de);
      expect(typeof value === 'string' && value.trim().length > 0, `de:${key}`).toBe(true);
    }
    expect(placeholders(de)).toEqual(placeholders(en));
  });

  it('contain the exact legal disclaimer', () => {
    expect(de.footer.disclaimer).toBe(
      'Nicht offiziell. Nicht mit Mojang oder Microsoft verbunden.',
    );
    expect(en.footer.disclaimer).toBe('Not official. Not associated with Mojang or Microsoft.');
  });
});
