import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildCredits, renderLicensesMd } from './credits';
import { selectTextures, type TextureEntry, type TextureManifest } from './manifest';
import { readPng } from './png';
import { validate } from './validate';

const entry = (pack: string, name: string, extra: Partial<TextureEntry> = {}): TextureEntry => ({
  pack,
  name,
  file: `assets/textures/${pack}/${name}.png`,
  source: { kind: 'own' },
  authors: ['laracraft contributors'],
  license: 'CC0-1.0',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  modifications: 'none',
  shareAlike: false,
  ...extra,
});

const pp = {
  source: {
    kind: 'third-party' as const,
    url: 'https://example.org/pp',
    packName: 'Pixel Perfection',
    version: '1.11',
  },
  authors: ['Hugh "XSSheep" Rutland'],
  license: 'CC-BY-SA-4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  modifications: 'Renamed to laracraft texture names.',
  shareAlike: true,
};

const manifest: TextureManifest = {
  version: 1,
  packs: {
    pp: { title: 'PP', description: 'x', dir: 'pp' },
    placeholder: { title: 'Placeholders', description: 'x', dir: 'placeholder' },
  },
  textures: [
    entry('placeholder', 'stone'),
    entry('placeholder', 'missing'),
    entry('pp', 'stone', pp),
    entry('pp', 'dirt', pp),
  ],
};

describe('selectTextures', () => {
  it('uses the first pack that provides a name and falls back to later packs', () => {
    const sel = selectTextures(manifest, ['pp', 'placeholder']);
    expect(sel.map((e) => `${e.pack}/${e.name}`)).toEqual([
      'pp/dirt',
      'placeholder/missing',
      'pp/stone',
    ]);
    expect(() => selectTextures(manifest, ['nope'])).toThrow(/unknown pack/);
  });
});

describe('credits', () => {
  it('groups by origin and builds TASL attribution lines', () => {
    const credits = buildCredits(manifest, selectTextures(manifest, ['pp', 'placeholder']));
    expect(credits.shareAlike).toBe(true);
    expect(credits.groups).toHaveLength(2);
    const [first, second] = credits.groups;
    expect(first?.textures).toEqual(['dirt', 'stone']);
    expect(first?.attribution).toBe(
      '"Pixel Perfection" (1.11) by Hugh "XSSheep" Rutland, source: https://example.org/pp, licensed under CC-BY-SA-4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Changes: Renamed to laracraft texture names.',
    );
    expect(second?.textures).toEqual(['missing']);
  });

  it('renders LICENSES.md with policy header and every file', () => {
    const md = renderLicensesMd(manifest, buildCredits(manifest, manifest.textures));
    expect(md).toContain('No Mojang assets');
    for (const e of manifest.textures) expect(md).toContain(e.file);
  });
});

describe('repository manifest', () => {
  it('validates against the files in assets/textures', () => {
    const root = resolve(import.meta.dirname, '../../../..');
    const dir = join(root, 'assets/textures');
    const files = readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => {
        const path = join(d.parentPath, d.name)
          .slice(root.length + 1)
          .split('\\')
          .join('/');
        if (!path.endsWith('.png')) return { path };
        const { width, height } = readPng(join(root, path));
        return { path, width, height };
      });
    const raw: unknown = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    expect(validate(raw, files)).toEqual([]);
  });
});
