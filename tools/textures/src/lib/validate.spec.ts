import type { TextureEntry, TextureManifest } from './manifest';
import { validate, type DiskFile, type IssueCode } from './validate';

const own = (name: string): TextureEntry => ({
  pack: 'placeholder',
  name,
  file: `assets/textures/placeholder/${name}.png`,
  source: { kind: 'own' },
  authors: ['laracraft contributors'],
  license: 'CC0-1.0',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  modifications: 'none',
  shareAlike: false,
});

const thirdParty = (name: string): TextureEntry => ({
  pack: 'pp',
  name,
  file: `assets/textures/pp/${name}.png`,
  source: { kind: 'third-party', url: 'https://example.org/pp', packName: 'Pixel Perfection' },
  authors: ['XSSheep'],
  license: 'CC-BY-SA-4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  modifications: 'renamed',
  shareAlike: true,
});

function manifest(textures: TextureEntry[]): TextureManifest {
  return {
    version: 1,
    packs: {
      placeholder: { title: 'Placeholders', description: 'test', dir: 'placeholder' },
      pp: { title: 'PP', description: 'test', dir: 'pp' },
    },
    textures,
  };
}

const disk = (entries: TextureEntry[]): DiskFile[] =>
  entries.map((e) => ({ path: e.file, width: 16, height: 16 }));

const codes = (m: unknown, files: DiskFile[]): IssueCode[] => validate(m, files).map((i) => i.code);

describe('validate', () => {
  const base = [own('missing'), own('stone')];
  const MISSING_FILE = 'assets/textures/placeholder/missing.png';
  const STONE_FILE = 'assets/textures/placeholder/stone.png';
  const okMissing: DiskFile = { path: MISSING_FILE, width: 16, height: 16 };

  it('accepts a consistent manifest', () => {
    expect(validate(manifest(base), disk(base))).toEqual([]);
  });

  it('accepts a complete third-party entry', () => {
    const all = [...base, thirdParty('dirt')];
    expect(validate(manifest(all), disk(all))).toEqual([]);
  });

  it('checks an optional pinned release on a pack', () => {
    const release = {
      url: 'https://example.org/pp/v1',
      versionId: 'v1',
      downloadUrl: 'https://example.org/pp/v1.zip',
      sha512: 'ab'.repeat(64),
    };
    const ok = manifest(base);
    ok.packs['pp'] = { title: 'PP', description: 'test', dir: 'pp', release };
    expect(validate(ok, disk(base))).toEqual([]);

    const bad = manifest(base);
    bad.packs['pp'] = {
      title: 'PP',
      description: 'test',
      dir: 'pp',
      release: { ...release, sha512: 'nope', downloadUrl: 'https://www.minecraft.net/x.zip' },
    };
    expect(codes(bad, disk(base))).toEqual(['manifest-shape', 'forbidden-source']);
  });

  it('rejects a PNG without manifest entry', () => {
    const files = [
      ...disk(base),
      { path: 'assets/textures/placeholder/dirt.png', width: 16, height: 16 },
    ];
    const issues = validate(manifest(base), files);
    expect(issues.map((i) => i.code)).toEqual(['missing-entry']);
    expect(issues[0]?.message).toContain('placeholder/dirt.png');
  });

  it('rejects orphan entries whose file does not exist', () => {
    expect(codes(manifest(base), disk([own('missing')]))).toEqual(['orphan-entry']);
  });

  it('rejects unknown licenses', () => {
    const bad = { ...own('stone'), license: 'CC-BY-NC-4.0' };
    expect(codes(manifest([own('missing'), bad]), disk(base))).toEqual(['license-not-allowed']);
  });

  it('rejects a license URL that does not match the license', () => {
    const bad = { ...own('stone'), licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' };
    expect(codes(manifest([own('missing'), bad]), disk(base))).toEqual(['license-url']);
  });

  it('requires shareAlike to match the license', () => {
    const bad = { ...thirdParty('dirt'), shareAlike: false };
    expect(codes(manifest([...base, bad]), disk([...base, bad]))).toEqual(['share-alike-mismatch']);
  });

  it('requires url and packName for third-party textures', () => {
    const bad = { ...thirdParty('dirt'), source: { kind: 'third-party' as const } };
    const c = codes(manifest([...base, bad]), disk([...base, bad]));
    expect(c).toEqual(['missing-attribution', 'missing-attribution']);
  });

  it('requires at least one author and a modifications note', () => {
    const bad = { ...thirdParty('dirt'), authors: [], modifications: '' };
    const c = codes(manifest([...base, bad]), disk([...base, bad]));
    expect(c).toEqual(['missing-attribution', 'missing-attribution']);
  });

  it('rejects wrong image sizes but allows multiples and animation strips', () => {
    const files: DiskFile[] = [okMissing, { path: STONE_FILE, width: 15, height: 16 }];
    expect(codes(manifest(base), files)).toEqual(['bad-size']);
    expect(codes(manifest(base), [okMissing, { path: STONE_FILE, width: 16, height: 24 }])).toEqual(
      ['bad-size'],
    );
    expect(codes(manifest(base), [okMissing, { path: STONE_FILE, width: 32, height: 32 }])).toEqual(
      [],
    );
    expect(codes(manifest(base), [okMissing, { path: STONE_FILE, width: 16, height: 64 }])).toEqual(
      [],
    );
  });

  it('rejects Mojang resource-pack paths and hosts', () => {
    const files = [
      ...disk(base),
      { path: 'assets/textures/pp/assets/minecraft/textures/block/stone.png' },
    ];
    expect(codes(manifest(base), files)).toContain('forbidden-source');
    expect(
      codes(manifest(base), [...disk(base), { path: 'assets/textures/pp/stone.png.mcmeta' }]),
    ).toContain('forbidden-source');
    const bad = {
      ...thirdParty('dirt'),
      source: { ...thirdParty('dirt').source, url: 'https://www.minecraft.net/x' },
    };
    expect(codes(manifest([...base, bad]), disk([...base, bad]))).toEqual(['forbidden-source']);
  });

  it('rejects duplicates, bad names, unknown packs and files outside the pack dir', () => {
    const dup = own('stone');
    expect(codes(manifest([...base, dup]), disk(base))).toEqual(['duplicate', 'duplicate']);
    const badName = { ...own('stone'), name: 'Stone Block' };
    expect(codes(manifest([own('missing'), badName]), disk(base))).toEqual(['bad-name']);
    const badPack = { ...own('stone'), pack: 'nope' };
    expect(codes(manifest([own('missing'), badPack]), disk(base))).toContain('unknown-pack');
    const badPath = { ...thirdParty('dirt'), file: 'assets/textures/placeholder/dirt.png' };
    expect(codes(manifest([...base, badPath]), disk([...base, badPath]))).toEqual(['bad-path']);
  });

  it('rejects stray non-PNG files and unreadable PNGs', () => {
    expect(codes(manifest(base), [...disk(base), { path: 'assets/textures/notes.txt' }])).toEqual([
      'unexpected-file',
    ]);
    expect(codes(manifest(base), [okMissing, { path: STONE_FILE, readError: 'bad crc' }])).toEqual([
      'unreadable',
    ]);
  });

  it('requires the missing texture', () => {
    const only = [own('stone')];
    expect(codes(manifest(only), disk(only))).toEqual(['missing-required-texture']);
  });

  it('rejects malformed manifests with clear messages', () => {
    expect(codes(null, [])).toEqual(['manifest-shape']);
    const issues = validate({ version: 2, packs: {}, textures: [{}] }, []);
    expect(issues.some((i) => i.message.includes('manifest.version must be 1'))).toBe(true);
    expect(issues.some((i) => i.message.includes('"authors"'))).toBe(true);
  });
});
