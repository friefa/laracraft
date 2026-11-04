import { createImage, type RgbaImage } from '../lib/png';
import { classifyAuthorship, countPixelDiff } from './compare';

function solid(rgba: [number, number, number, number], w = 2, h = 2): RgbaImage {
  const img = createImage(w, h);
  for (let i = 0; i < img.data.length; i += 4) img.data.set(rgba, i);
  return img;
}

describe('countPixelDiff', () => {
  it('counts differing pixels', () => {
    const a = solid([10, 20, 30, 255]);
    const b = solid([10, 20, 30, 255]);
    b.data[0] = 11;
    expect(countPixelDiff(a, a)).toBe(0);
    expect(countPixelDiff(a, b)).toBe(1);
  });

  it('ignores the colour of fully transparent pixels', () => {
    expect(countPixelDiff(solid([1, 2, 3, 0]), solid([9, 9, 9, 0]))).toBe(0);
    expect(countPixelDiff(solid([1, 2, 3, 0]), solid([1, 2, 3, 1]))).toBe(4);
  });

  it('returns undefined for different sizes', () => {
    expect(countPixelDiff(solid([0, 0, 0, 255], 2, 2), solid([0, 0, 0, 255], 2, 4))).toBe(
      undefined,
    );
  });
});

describe('classifyAuthorship', () => {
  const img = solid([5, 5, 5, 255]);

  it('credits XSSheep only for identical pixels of a pre-1.12 block', () => {
    expect(classifyAuthorship(img, solid([5, 5, 5, 255]), undefined).authorship).toBe('xssheep');
  });

  it('credits the adapters when the file differs, is new, or the block is newer', () => {
    expect(classifyAuthorship(img, solid([6, 5, 5, 255]), undefined).authorship).toBe('adapted');
    expect(classifyAuthorship(img, undefined, undefined).authorship).toBe('adapted');
    expect(classifyAuthorship(img, solid([5, 5, 5, 255]), '1.17').authorship).toBe('adapted');
    expect(classifyAuthorship(img, solid([5, 5, 5, 255], 2, 4), undefined).reason).toMatch(
      /size differs/,
    );
  });
});
