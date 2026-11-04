import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALLOWED_LICENSES, type TextureManifest } from './manifest';
import { OWN_PACK, OWN_TEXTURE_NAMES, renderOwnTexture } from './own-textures';
import { readPng } from './png';

const ROOT = resolve(import.meta.dirname, '../../../..');
const manifest = JSON.parse(
  readFileSync(resolve(ROOT, 'assets/textures/manifest.json'), 'utf8'),
) as TextureManifest;
const load = (name: string) =>
  readPng(resolve(ROOT, `assets/textures/pixel_perfection_legacy/${name}.png`));
const own = manifest.textures.filter((e) => e.pack === OWN_PACK);

describe('own textures', () => {
  it('has exactly one manifest entry per generated texture', () => {
    expect(own.map((e) => e.name).sort()).toEqual([...OWN_TEXTURE_NAMES]);
    expect(manifest.packs[OWN_PACK]?.dir).toBe(OWN_PACK);
  });

  it.each(OWN_TEXTURE_NAMES.map((n) => [n]))('%s on disk matches the generator', (name) => {
    const img = renderOwnTexture(name, load);
    expect(img.width).toBe(16);
    expect(img.height).toBe(16);
    const disk = readPng(resolve(ROOT, `assets/textures/${OWN_PACK}/${name}.png`));
    expect(Buffer.from(disk.data).equals(Buffer.from(img.data))).toBe(true);
    // Opaque everywhere (chest and observer are solid surfaces).
    for (let i = 3; i < img.data.length; i += 4) expect(img.data[i]).toBe(255);
  });

  it.each(own.map((e) => [e.name, e] as const))(
    '%s is CC-BY-SA-4.0 and credits the PPL authors (adapted to PPL)',
    (_, e) => {
      expect(e.license).toBe('CC-BY-SA-4.0');
      expect(e.licenseUrl).toBe(ALLOWED_LICENSES['CC-BY-SA-4.0'].url);
      expect(e.shareAlike).toBe(true);
      expect(e.source.kind).toBe('own');
      expect(e.authors).toContain('laracraft contributors');
      expect(e.authors).toContain('Nova_Wostra');
    },
  );

  it('keeps the observer_side frame on observer_front', () => {
    const side = load('observer_side');
    const front = renderOwnTexture('observer_front', load);
    const px = (img: { data: Uint8Array }, x: number, y: number) =>
      Array.from(img.data.subarray((y * 16 + x) * 4, (y * 16 + x) * 4 + 4));
    for (let y = 0; y < 16; y++) {
      for (const x of y < 3 || y > 12 ? [...Array(16).keys()] : [0, 1, 14, 15]) {
        expect(px(front, x, y)).toEqual(px(side, x, y));
      }
    }
  });

  it('slices double chest halves from one drawing without a seam frame', () => {
    // Front: right half shows columns 1..15, left half 0..14 (u = 16 - x); the seam columns
    // continue each other and carry the two latch columns.
    const right = renderOwnTexture('chest_front_right', load);
    const left = renderOwnTexture('chest_front_left', load);
    const single = renderOwnTexture('chest_front', load);
    const px = (img: { data: Uint8Array }, x: number, y: number) =>
      Array.from(img.data.subarray((y * 16 + x) * 4, (y * 16 + x) * 4 + 3));
    // Latch rows 5..8: same metal as the single chest latch (columns 7, 8).
    for (let y = 5; y <= 8; y++) {
      expect(px(right, 15, y)).toEqual(px(single, 7, y));
      expect(px(left, 0, y)).toEqual(px(single, 8, y));
    }
    // The outer frame column of the single chest is not repeated at the seam.
    expect(px(right, 14, 10)).not.toEqual(px(single, 1, 10));
  });
});
