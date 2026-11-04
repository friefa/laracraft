import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MODULE_CATALOGUE } from './catalogue';

type Tree = { readonly [key: string]: string | Tree };

const load = (lang: string): Tree =>
  JSON.parse(readFileSync(join(import.meta.dirname, '..', 'i18n', `${lang}.json`), 'utf8')) as Tree;

/** Flattens nested JSON into dotted keys. */
function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(path, v);
    else for (const [pk, pv] of flatten(v, path)) out.set(pk, pv);
  }
  return out;
}

const LANGS = { de: flatten(load('de')), en: flatten(load('en')) };

/** Every key the library refers to. */
function requiredKeys(): string[] {
  return MODULE_CATALOGUE.all().flatMap((m) => [
    m.nameKey,
    m.descriptionKey,
    ...m.ports.map((p) => `redstoneModule.${m.id}.port.${p.name}`),
    ...Object.values(m.params ?? {}).map((p) => p.descriptionKey),
  ]);
}

describe('i18n (de/en)', () => {
  it('has the same keys in both languages', () => {
    expect([...LANGS.de.keys()].sort()).toEqual([...LANGS.en.keys()].sort());
  });

  it.each(Object.entries(LANGS))('%s: every module key has a non-empty text', (_lang, texts) => {
    for (const k of requiredKeys()) expect(texts.get(k)?.trim(), k).toBeTruthy();
  });

  it('contains no keys for unknown modules, ports or params', () => {
    const required = new Set(requiredKeys());
    for (const k of LANGS.en.keys()) expect(required.has(k), k).toBe(true);
  });
});
