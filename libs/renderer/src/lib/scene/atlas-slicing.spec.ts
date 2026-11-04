import { createTextureLayers } from '../mesh/texture-layers';
import { sliceAtlas, type AtlasJson } from './atlas-slicing';

/** Fake atlas image where each pixel encodes its own coordinates: (x, y, tag, 255). */
function fakeImage(width: number, height: number) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = x;
      data[i + 1] = y;
      data[i + 2] = 7;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

const px = (data: Uint8Array, tile: number, layer: number, row: number, col: number) => {
  const o = (layer * tile * tile + row * tile + col) * 4;
  return [data[o], data[o + 1], data[o + 2], data[o + 3]];
};

describe('sliceAtlas', () => {
  const atlas: AtlasJson = {
    width: 128,
    height: 128,
    textures: {
      stone: { x: 2, y: 2, w: 16, h: 16 },
      missing: { x: 22, y: 2, w: 16, h: 16 },
      // 32×32 texture: downsampled to 16×16
      big: { x: 42, y: 2, w: 32, h: 32 },
      // animation strip of 3 frames: only the first frame is used
      water: { x: 2, y: 40, w: 16, h: 48, frames: 3 },
    },
  };
  const image = fakeImage(128, 128);
  const sliced = sliceAtlas(atlas, image);

  it('uses the texture layer order (missing first, then sorted)', () => {
    expect(sliced.names).toEqual(['missing', 'big', 'stone', 'water']);
    const layers = createTextureLayers(atlas);
    sliced.names.forEach((n, i) => expect(layers[n]).toBe(i));
    expect(sliced.tileSize).toBe(16);
    expect(sliced.data.length).toBe(4 * 16 * 16 * 4);
  });

  it('stores rows bottom-up (v = 1 = top image row)', () => {
    const stone = sliced.names.indexOf('stone');
    // Bottom row (row 0) = image row y + 15; top row (row 15) = image row y.
    expect(px(sliced.data, 16, stone, 0, 0)).toEqual([2, 17, 7, 255]);
    expect(px(sliced.data, 16, stone, 15, 0)).toEqual([2, 2, 7, 255]);
    expect(px(sliced.data, 16, stone, 15, 15)).toEqual([17, 2, 7, 255]);
    const missing = sliced.names.indexOf('missing');
    expect(px(sliced.data, 16, missing, 15, 0)).toEqual([22, 2, 7, 255]);
  });

  it('downsamples larger textures with nearest neighbour', () => {
    const big = sliced.names.indexOf('big');
    expect(px(sliced.data, 16, big, 15, 0)).toEqual([43, 3, 7, 255]);
    expect(px(sliced.data, 16, big, 0, 15)).toEqual([73, 33, 7, 255]);
  });

  it('takes the first frame of animation strips', () => {
    const water = sliced.names.indexOf('water');
    expect(px(sliced.data, 16, water, 15, 0)).toEqual([2, 40, 7, 255]);
    expect(px(sliced.data, 16, water, 0, 0)).toEqual([2, 55, 7, 255]);
  });

  it('leaves pixels outside the image transparent', () => {
    const out = sliceAtlas({ textures: { missing: { x: 120, y: 0, w: 16, h: 16 } } }, image);
    expect(px(out.data, 16, 0, 15, 7)).toEqual([127, 0, 7, 255]);
    expect(px(out.data, 16, 0, 15, 8)).toEqual([0, 0, 0, 0]);
  });
});
