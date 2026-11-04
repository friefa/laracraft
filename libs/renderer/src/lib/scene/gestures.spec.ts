import {
  classifyGesture,
  GestureController,
  type GestureTarget,
  type PointerSample,
} from './gestures';

describe('classifyGesture', () => {
  it('classifies short, small presses as taps', () => {
    expect(classifyGesture(0, 0)).toBe('tap');
    expect(classifyGesture(5.9, 299)).toBe('tap');
    expect(classifyGesture(6, 100)).toBe('drag');
    expect(classifyGesture(2, 300)).toBe('drag');
  });
});

function setup() {
  const calls: string[] = [];
  const target: GestureTarget<string> = {
    orbit: (dx, dy) => calls.push(`orbit ${dx} ${dy}`),
    pan: (dx, dy) => calls.push(`pan ${dx} ${dy}`),
    zoom: (f) => calls.push(`zoom ${f.toFixed(3)}`),
    tap: (s) => calls.push(`tap ${s.event}`),
  };
  const g = new GestureController(target);
  const s = (
    id: number,
    x: number,
    y: number,
    t: number,
    button = 0,
    pointerType = 'touch',
  ): PointerSample<string> => ({ id, x, y, t, button, pointerType, event: `e${id}@${t}` });
  return { g, calls, s };
}

describe('GestureController', () => {
  it('reports a tap without moving the camera', () => {
    const { g, calls, s } = setup();
    g.down(s(1, 100, 100, 0));
    g.move(s(1, 103, 102, 50));
    g.up(s(1, 103, 102, 120));
    expect(calls).toEqual(['tap e1@120']);
  });

  it('does not tap after a long press', () => {
    const { g, calls, s } = setup();
    g.down(s(1, 100, 100, 0));
    g.up(s(1, 100, 100, 400));
    expect(calls).toEqual([]);
  });

  it('orbits with one finger once past the dead zone, then never taps', () => {
    const { g, calls, s } = setup();
    g.down(s(1, 100, 100, 0));
    g.move(s(1, 110, 100, 20));
    g.move(s(1, 112, 99, 40));
    g.move(s(1, 101, 100, 60)); // back near the start: still a drag
    g.up(s(1, 101, 100, 80));
    expect(calls).toEqual(['orbit 10 0', 'orbit 2 -1', 'orbit -11 1']);
  });

  it('pans with the right and middle mouse buttons and taps with any button', () => {
    const { g, calls, s } = setup();
    g.down(s(1, 0, 0, 0, 2, 'mouse'));
    g.move(s(1, 0, 20, 10, 2, 'mouse'));
    g.up(s(1, 0, 20, 20, 2, 'mouse'));
    g.down(s(1, 0, 0, 100, 1, 'mouse'));
    g.move(s(1, -8, 0, 110, 1, 'mouse'));
    g.up(s(1, -8, 0, 120, 1, 'mouse'));
    g.down(s(1, 0, 0, 200, 2, 'mouse'));
    g.up(s(1, 0, 0, 220, 2, 'mouse'));
    expect(calls).toEqual(['pan 0 20', 'pan -8 0', 'tap e1@220']);
  });

  it('pinch-zooms and pans with two fingers and does not tap afterwards', () => {
    const { g, calls, s } = setup();
    g.down(s(1, 100, 100, 0));
    g.down(s(2, 200, 100, 10));
    g.move(s(2, 300, 100, 30)); // spread 100 → 200, midpoint +50
    expect(calls).toEqual(['zoom 0.500', 'pan 50 0']);
    g.up(s(2, 300, 100, 40));
    // Remaining finger continues as orbit immediately (no dead zone).
    g.move(s(1, 102, 100, 50));
    g.up(s(1, 102, 100, 60));
    expect(calls).toEqual(['zoom 0.500', 'pan 50 0', 'orbit 2 0']);
  });

  it('never taps when a quick two-finger touch ends', () => {
    const { g, calls, s } = setup();
    g.down(s(1, 0, 0, 0));
    g.down(s(2, 50, 0, 5));
    g.up(s(1, 0, 0, 30));
    g.up(s(2, 50, 0, 40));
    expect(calls).toEqual([]);
    // A fresh tap afterwards works again.
    g.down(s(3, 0, 0, 100));
    g.up(s(3, 0, 0, 150));
    expect(calls).toEqual(['tap e3@150']);
  });

  it('cancels without tapping and zooms on wheel', () => {
    const { g, calls, s } = setup();
    g.down(s(1, 0, 0, 0));
    g.cancel(s(1, 0, 0, 10));
    g.up(s(1, 0, 0, 20));
    expect(g.activePointers).toBe(0);
    g.wheel(100);
    g.wheel(-100);
    g.wheel(0);
    expect(calls).toEqual([
      `zoom ${Math.exp(0.15).toFixed(3)}`,
      `zoom ${Math.exp(-0.15).toFixed(3)}`,
    ]);
  });
});
