import { ChunkedVolume } from '@laracraft/core-model';
import { PADDED_VOLUME, extractChunkInput, paddedIndex } from './extract';
import { createTextureLayers, textureLayerNames, textureLayerOf } from './texture-layers';

describe('extractChunkInput', () => {
  it('matches per-voxel lookups including all 26 neighbour borders', () => {
    const volume = new ChunkedVolume();
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
    for (let i = 0; i < 6000; i++) {
      volume.set(
        Math.floor(rnd() * 48) - 24,
        Math.floor(rnd() * 48) - 24,
        Math.floor(rnd() * 48) - 24,
        1 + Math.floor(rnd() * 50),
      );
    }
    for (const coord of [
      { x: 0, y: 0, z: 0 },
      { x: -1, y: -1, z: -1 },
      { x: -2, y: 0, z: 1 },
    ]) {
      const input = extractChunkInput(volume, coord, 5);
      expect(input.data.length).toBe(PADDED_VOLUME);
      expect(input.coord).toBe(coord);
      expect(input.maxY).toBe(5);
      for (let ly = -1; ly <= 16; ly++)
        for (let lz = -1; lz <= 16; lz++)
          for (let lx = -1; lx <= 16; lx++) {
            const expected = volume.get(coord.x * 16 + lx, coord.y * 16 + ly, coord.z * 16 + lz);
            if (input.data[paddedIndex(lx, ly, lz)] !== expected) {
              throw new Error(`mismatch at ${lx},${ly},${lz} in chunk ${JSON.stringify(coord)}`);
            }
          }
    }
  });

  it('omits maxY when not given', () => {
    expect('maxY' in extractChunkInput(new ChunkedVolume(), { x: 0, y: 0, z: 0 })).toBe(false);
  });
});

describe('texture layers', () => {
  const atlas = { textures: { stone: {}, dirt: {}, missing: {}, Zeta: {}, alpha: {} } };

  it('orders missing first, then names sorted by code unit', () => {
    expect(textureLayerNames(atlas)).toEqual(['missing', 'Zeta', 'alpha', 'dirt', 'stone']);
    expect(textureLayerNames({ textures: { b: {}, a: {} } })).toEqual(['a', 'b']);
  });

  it('maps names to layer indices and falls back to missing', () => {
    const layers = createTextureLayers(atlas);
    expect(layers['stone']).toBe(4);
    expect(textureLayerOf(layers, 'dirt')).toBe(3);
    expect(textureLayerOf(layers, 'unknown')).toBe(0);
    expect(textureLayerOf(layers, 'constructor')).toBe(0);
  });
});
