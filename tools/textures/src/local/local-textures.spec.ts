import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { collectTextureNames, createJavaBlockRegistry } from '@laracraft/core-model';
import type { AtlasInput } from '../lib/atlas';
import { createImage, encodePng } from '../lib/png';
import { PPL_TEXTURE_MAP } from '../import/ppl-mapping';
import {
  applyLocalTextures,
  extractFromJar,
  isLocalEnv,
  VANILLA_BLOCK_DIR,
  VANILLA_TEXTURE_MAP,
} from './local-textures';

const solidPng = (w: number, h: number, v: number): Uint8Array => {
  const img = createImage(w, h);
  img.data.fill(v);
  return encodePng(img);
};

/** A synthetic stand-in for a client.jar: no Mojang content, just the folder layout. */
function fakeJar(extra: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({
    'version.json': strToU8(JSON.stringify({ id: '1.99-test' })),
    'net/minecraft/Fake.class': new Uint8Array([0xca, 0xfe]),
    [`${VANILLA_BLOCK_DIR}/stone.png`]: solidPng(16, 16, 10),
    [`${VANILLA_BLOCK_DIR}/redstone_dust_dot.png`]: solidPng(16, 16, 20),
    [`${VANILLA_BLOCK_DIR}/water_still.png`]: solidPng(16, 528, 30),
    [`${VANILLA_BLOCK_DIR}/stone.png.mcmeta`]: strToU8('{}'),
    [`${VANILLA_BLOCK_DIR}/unrelated.png`]: solidPng(16, 16, 40),
    ...extra,
  });
}

describe('VANILLA_TEXTURE_MAP', () => {
  it('covers every registry texture name', () => {
    const names = collectTextureNames(createJavaBlockRegistry());
    expect(names.filter((n) => !(n in VANILLA_TEXTURE_MAP))).toEqual([]);
  });

  it('covers the extra model texture names of the PPL mapping', () => {
    expect(Object.keys(PPL_TEXTURE_MAP).filter((n) => !(n in VANILLA_TEXTURE_MAP))).toEqual([]);
  });

  it('maps redstone_dust to the dot sprite', () => {
    expect(VANILLA_TEXTURE_MAP['redstone_dust']).toBe('redstone_dust_dot.png');
  });
});

describe('isLocalEnv', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['0', false],
    ['false', false],
    ['1', true],
    ['true', true],
    ['yes', true],
  ])('%s -> %s', (value, expected) => {
    expect(isLocalEnv({ LARACRAFT_LOCAL_TEXTURES: value })).toBe(expected);
  });
});

describe('extractFromJar', () => {
  it('reads only mapped block PNGs and the version id', () => {
    const { images, absent, rejected, versionId } = extractFromJar(fakeJar());
    expect([...images.keys()].sort()).toEqual(['redstone_dust', 'stone']);
    expect(images.get('stone')).toMatchObject({ width: 16, height: 16 });
    expect(images.get('stone')?.data[0]).toBe(10);
    expect(images.get('redstone_dust')?.data[0]).toBe(20);
    expect(absent).toContain('oak_planks');
    expect(absent).not.toContain('stone');
    // 32-frame limit of the atlas: the 33-frame 16x528 strip is rejected, not silently packed.
    expect(rejected).toEqual([expect.stringMatching(/^water_still: height 528px/)]);
    expect(versionId).toBe('1.99-test');
  });

  it('rejects archives without a block texture folder', () => {
    const notAJar = zipSync({ 'readme.txt': strToU8('hi') });
    expect(() => extractFromJar(notAJar)).toThrow(/client\.jar/);
  });

  it('rejects files that are not zips', () => {
    expect(() => extractFromJar(strToU8('definitely not a zip'))).toThrow(/jar\/zip/);
  });

  it('reports unreadable PNGs', () => {
    const jar = fakeJar({ [`${VANILLA_BLOCK_DIR}/dirt.png`]: strToU8('broken') });
    expect(extractFromJar(jar).rejected).toContainEqual(expect.stringMatching(/^dirt: /));
  });
});

describe('applyLocalTextures', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lc-local-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('gives local files the highest priority and keeps the rest', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'stone.png'), solidPng(16, 16, 99));
    writeFileSync(join(dir, 'dirt.png'), solidPng(20, 20, 1)); // bad size
    writeFileSync(join(dir, 'missing.png'), solidPng(16, 16, 1)); // not a vanilla name
    const inputs: AtlasInput[] = ['dirt', 'missing', 'oak_planks', 'stone'].map((name) => ({
      name,
      ...createImage(16, 16),
    }));
    const { replaced, skipped } = applyLocalTextures(inputs, dir);
    expect(replaced).toEqual(['stone']);
    expect(skipped).toEqual([expect.stringMatching(/^dirt: width 20px/)]);
    expect(inputs.find((i) => i.name === 'stone')?.data[0]).toBe(99);
    expect(inputs.find((i) => i.name === 'missing')?.data[0]).toBe(0);
  });
});
