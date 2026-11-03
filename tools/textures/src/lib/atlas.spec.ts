import { buildAtlas, layoutAtlas, nextPow2, type AtlasInput, type AtlasRect } from './atlas';
import { encodePng } from './png';
import { PLACEHOLDER_NAMES, renderPlaceholder } from './placeholders';

const solid = (
  name: string,
  w: number,
  h: number,
  rgba: [number, number, number, number],
): AtlasInput => {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return { name, width: w, height: h, data };
};

const overlaps = (a: AtlasRect, b: AtlasRect, pad: number) =>
  a.x - pad < b.x + b.w + pad &&
  b.x - pad < a.x + a.w + pad &&
  a.y - pad < b.y + b.h + pad &&
  b.y - pad < a.y + a.h + pad;

describe('atlas', () => {
  const inputs = PLACEHOLDER_NAMES.map((name) => ({ name, ...renderPlaceholder(name) }));
  const mixed: AtlasInput[] = [
    ...inputs,
    solid('big', 32, 32, [1, 2, 3, 255]),
    solid('anim', 16, 64, [9, 9, 9, 255]),
  ];

  it.each([0, 1, 2])(
    'places all textures without overlap inside bounds (padding %i)',
    (padding) => {
      const layout = layoutAtlas(mixed, { padding });
      expect(nextPow2(layout.width)).toBe(layout.width);
      expect(nextPow2(layout.height)).toBe(layout.height);
      const rects = Object.entries(layout.rects);
      expect(rects).toHaveLength(mixed.length);
      for (const [, r] of rects) {
        expect(r.x - padding).toBeGreaterThanOrEqual(0);
        expect(r.y - padding).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w + padding).toBeLessThanOrEqual(layout.width);
        expect(r.y + r.h + padding).toBeLessThanOrEqual(layout.height);
        expect(r.u0).toBeCloseTo(r.x / layout.width);
        expect(r.v1).toBeCloseTo((r.y + r.h) / layout.height);
      }
      rects.forEach(([na, a], i) => {
        for (const [nb, b] of rects.slice(i + 1)) {
          expect(overlaps(a, b, padding), `${na} overlaps ${nb}`).toBe(false);
        }
      });
      expect(layout.rects['anim']?.frames).toBe(4);
    },
  );

  it('copies pixels and extrudes edges into the padding', () => {
    const tex = solid('t', 16, 16, [10, 20, 30, 255]);
    // Distinct corner pixel to check clamping.
    tex.data.set([200, 0, 0, 255], 0);
    const { layout, image } = buildAtlas([tex, solid('missing', 16, 16, [255, 0, 255, 255])], {
      padding: 2,
    });
    const r = layout.rects['t'];
    if (!r) throw new Error('texture t not placed');
    const px = (x: number, y: number) =>
      Array.from(image.data.slice((y * layout.width + x) * 4, (y * layout.width + x) * 4 + 4));
    expect(px(r.x, r.y)).toEqual([200, 0, 0, 255]);
    expect(px(r.x - 2, r.y - 2)).toEqual([200, 0, 0, 255]); // corner extruded
    expect(px(r.x + 5, r.y - 1)).toEqual([10, 20, 30, 255]); // top edge extruded
    expect(px(r.x + r.w + 1, r.y + 5)).toEqual([10, 20, 30, 255]); // right edge extruded
  });

  it('is deterministic regardless of input order', () => {
    const a = buildAtlas(mixed);
    const b = buildAtlas([...mixed].reverse());
    expect(b.layout).toEqual(a.layout);
    expect(encodePng(b.image).equals(encodePng(a.image))).toBe(true);
  });

  it('rejects empty input, duplicates and oversize atlases', () => {
    expect(() => layoutAtlas([])).toThrow(/no textures/);
    expect(() =>
      layoutAtlas([solid('a', 16, 16, [0, 0, 0, 0]), solid('a', 16, 16, [0, 0, 0, 0])]),
    ).toThrow(/duplicate/);
    expect(() => layoutAtlas(mixed, { maxSize: 32 })).toThrow(/do not fit/);
  });
});

describe('placeholders', () => {
  it('are deterministic 16x16 RGBA images and include the missing texture', () => {
    expect(PLACEHOLDER_NAMES).toContain('missing');
    for (const name of PLACEHOLDER_NAMES) {
      const a = renderPlaceholder(name);
      expect(a.width).toBe(16);
      expect(a.height).toBe(16);
      expect(encodePng(a).equals(encodePng(renderPlaceholder(name)))).toBe(true);
    }
    const missing = renderPlaceholder('missing');
    expect(Array.from(missing.data.slice(0, 4))).toEqual([248, 0, 248, 255]);
  });
});
