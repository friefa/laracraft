import { FULL_SHEET_GAP, nextSnap, sheetHeights, snapAfterDrag } from './sheet';

describe('guide bottom sheet', () => {
  const heights = sheetHeights(700, 120);

  it('derives monotonic snap heights', () => {
    expect(heights).toEqual({ peek: 120, half: 350, full: 700 - FULL_SHEET_GAP });
    const tiny = sheetHeights(100, 120);
    expect(tiny.peek).toBe(100);
    expect(tiny.half).toBeGreaterThanOrEqual(tiny.peek);
    expect(tiny.full).toBeGreaterThanOrEqual(tiny.half);
  });

  it('snaps to the nearest point after a slow drag', () => {
    expect(snapAfterDrag(150, 0, heights)).toBe('peek');
    expect(snapAfterDrag(400, 0, heights)).toBe('half');
    expect(snapAfterDrag(600, 0.1, heights)).toBe('full');
  });

  it('moves one point in the direction of a flick', () => {
    expect(snapAfterDrag(360, 1, heights)).toBe('full');
    expect(snapAfterDrag(340, -1, heights)).toBe('peek');
    expect(snapAfterDrag(200, 1, heights)).toBe('half');
    expect(snapAfterDrag(700, 1, heights)).toBe('full');
    expect(snapAfterDrag(100, -1, heights)).toBe('peek');
  });

  it('cycles on handle taps', () => {
    expect(nextSnap('peek')).toBe('half');
    expect(nextSnap('half')).toBe('full');
    expect(nextSnap('full')).toBe('peek');
  });
});
