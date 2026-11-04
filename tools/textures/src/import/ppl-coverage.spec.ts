import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { collectTextureNames, createJavaBlockRegistry } from '@laracraft/core-model';
import {
  ALLOWED_LICENSES,
  defaultPackOrder,
  selectTextures,
  type TextureManifest,
} from '../lib/manifest';
import {
  ADAPTED_AUTHORS,
  ADAPTED_MODIFICATIONS,
  INTRODUCED_AFTER_XSSHEEP,
  PPL_RELEASE,
  PPL_TEXTURE_MAP,
  XSSHEEP_AUTHORS,
  XSSHEEP_MODIFICATIONS,
} from './ppl-mapping';

const ROOT = resolve(import.meta.dirname, '../../../..');
const manifest = JSON.parse(
  readFileSync(resolve(ROOT, 'assets/textures/manifest.json'), 'utf8'),
) as TextureManifest;
const registryNames = collectTextureNames(createJavaBlockRegistry());
const ppl = manifest.textures.filter((e) => e.pack === PPL_RELEASE.packId);

describe('registry texture coverage', () => {
  it('maps every registry texture name in PPL_TEXTURE_MAP', () => {
    expect(registryNames.filter((n) => !(n in PPL_TEXTURE_MAP))).toEqual([]);
  });

  it('resolves every registry texture name to a manifest entry (or the missing fallback)', () => {
    const selected = new Map(selectTextures(manifest).map((e) => [e.name, e]));
    const fallback = selected.get('missing');
    const onlyMissing = registryNames.filter((n) => !selected.has(n));
    const unresolved = registryNames.filter((n) => !selected.has(n) && !fallback);
    if (onlyMissing.length > 0) {
      console.info(
        `Textures without a pack entry, rendered with "missing": ${onlyMissing.join(', ')}`,
      );
    }
    expect(unresolved).toEqual([]);
  });

  it('prefers own drawings, then Pixel Perfection Legacy, then the placeholders by default', () => {
    expect(defaultPackOrder(manifest).slice(0, 3)).toEqual([
      'laracraft_own',
      PPL_RELEASE.packId,
      'placeholder',
    ]);
    const selected = selectTextures(manifest);
    expect(selected.find((e) => e.name === 'stone')?.pack).toBe(PPL_RELEASE.packId);
    expect(selected.find((e) => e.name === 'observer_front')?.pack).toBe('laracraft_own');
    expect(selected.find((e) => e.name === 'chest_front')?.pack).toBe('laracraft_own');
  });
});

describe('pixel_perfection_legacy manifest entries', () => {
  it('has exactly one entry per mapped texture', () => {
    const mapped = Object.entries(PPL_TEXTURE_MAP)
      .filter(([, file]) => file !== null)
      .map(([name]) => name)
      .sort();
    expect(ppl.map((e) => e.name).sort()).toEqual(mapped);
  });

  it('records the pinned release', () => {
    expect(manifest.packs[PPL_RELEASE.packId]?.release).toEqual({
      url: PPL_RELEASE.url,
      versionId: PPL_RELEASE.versionId,
      downloadUrl: PPL_RELEASE.downloadUrl,
      sha512: PPL_RELEASE.sha512,
    });
  });

  it.each(ppl.map((e) => [e.name, e] as const))('%s is CC-BY-SA-4.0 with authors', (name, e) => {
    expect(e.license).toBe('CC-BY-SA-4.0');
    expect(e.licenseUrl).toBe(ALLOWED_LICENSES['CC-BY-SA-4.0'].url);
    expect(e.shareAlike).toBe(true);
    expect(e.authors.length).toBeGreaterThan(0);
    expect(e.authors.every((a) => a.trim() !== '')).toBe(true);
    expect(e.source).toMatchObject({
      kind: 'third-party',
      url: PPL_RELEASE.url,
      packName: PPL_RELEASE.packName,
      version: PPL_RELEASE.version,
      originalPath: PPL_TEXTURE_MAP[name],
    });
    const xssheep = e.modifications === XSSHEEP_MODIFICATIONS;
    expect(e.authors).toEqual(xssheep ? [...XSSHEEP_AUTHORS] : [...ADAPTED_AUTHORS]);
    if (!xssheep) expect(e.modifications).toBe(ADAPTED_MODIFICATIONS);
    if (name in INTRODUCED_AFTER_XSSHEEP) expect(xssheep).toBe(false);
  });
});
