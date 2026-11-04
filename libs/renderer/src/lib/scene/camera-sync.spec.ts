import * as THREE from 'three';
import { syncCamera } from './camera-sync';
import { NO_INSETS, OrbitCamera, visibleRegion, type ViewInsets } from './orbit-camera';

/** Screen position (CSS px) of a world point. */
function toScreen(camera: THREE.PerspectiveCamera, p: THREE.Vector3, w: number, h: number) {
  const ndc = p.clone().project(camera);
  return { x: ((ndc.x + 1) / 2) * w, y: ((1 - ndc.y) / 2) * h };
}

/** Corners of an inclusive block box. */
function corners(min: THREE.Vector3, max: THREE.Vector3): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    out.push(
      new THREE.Vector3(
        i & 1 ? max.x + 1 : min.x,
        i & 2 ? max.y + 1 : min.y,
        i & 4 ? max.z + 1 : min.z,
      ),
    );
  }
  return out;
}

describe('visibleRegion', () => {
  it('is the whole canvas without insets', () => {
    expect(visibleRegion(390, 844, NO_INSETS)).toEqual({
      widthFraction: 1,
      heightFraction: 1,
      shiftX: 0,
      shiftY: 0,
    });
  });

  it('shrinks and shifts the region away from covered edges', () => {
    const r = visibleRegion(400, 800, { top: 50, right: 60, bottom: 150, left: 0 });
    expect(r.widthFraction).toBeCloseTo(340 / 400);
    expect(r.heightFraction).toBeCloseTo(600 / 800);
    expect(r.shiftX).toBe(-30);
    expect(r.shiftY).toBe(-50);
  });

  it('keeps at least a quarter of the canvas for absurd insets', () => {
    const r = visibleRegion(100, 100, { top: 500, right: 0, bottom: 500, left: 0 });
    expect(r.heightFraction).toBeCloseTo(0.25);
    expect(r.shiftY).toBeCloseTo(0);
  });
});

/**
 * Regression (P2.5): on phones the framed build reached under the translucent layer-slider
 * panel at the right edge, which showed it as a large washed-out white quad. With insets the
 * framed build must stay inside the uncovered part of the canvas.
 */
describe('framing with insets', () => {
  const w = 390;
  const h = 844;
  // Editor on a phone: top bar, bottom toolbar, layer slider on the right.
  const insets: ViewInsets = { top: 53, right: 58, bottom: 53, left: 0 };
  const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 6, y: 4, z: 6 } }; // golden house 7×5×7

  function project(withInsets: ViewInsets) {
    const orbit = new OrbitCamera();
    orbit.frame(box, w / h, visibleRegion(w, h, withInsets));
    const camera = new THREE.PerspectiveCamera();
    syncCamera(camera, orbit, w, h, withInsets);
    const pts = corners(new THREE.Vector3(0, 0, 0), new THREE.Vector3(6, 4, 6)).map((p) =>
      toScreen(camera, p, w, h),
    );
    const target = toScreen(
      camera,
      new THREE.Vector3(orbit.target.x, orbit.target.y, orbit.target.z),
      w,
      h,
    );
    return { pts, target, maxX: Math.max(...pts.map((p) => p.x)) };
  }

  it('without insets the build reaches under the slider panel (the bug)', () => {
    expect(project(NO_INSETS).maxX).toBeGreaterThan(w - insets.right);
  });

  it('with insets the build stays clear of every covered edge', () => {
    const { pts, target } = project(insets);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(insets.left);
      expect(p.x).toBeLessThanOrEqual(w - insets.right);
      expect(p.y).toBeGreaterThanOrEqual(insets.top);
      expect(p.y).toBeLessThanOrEqual(h - insets.bottom);
    }
    // The orbit target sits in the centre of the uncovered region.
    expect(target.x).toBeCloseTo((w - insets.right + insets.left) / 2, 3);
    expect(target.y).toBeCloseTo((h - insets.bottom + insets.top) / 2, 3);
  });

  it('picks through the shifted projection (unproject inverts project)', () => {
    const orbit = new OrbitCamera();
    orbit.frame(box, w / h, visibleRegion(w, h, insets));
    const camera = new THREE.PerspectiveCamera();
    syncCamera(camera, orbit, w, h, insets);
    const p = new THREE.Vector3(3, 2, 1);
    const back = p.clone().project(camera).unproject(camera);
    expect(back.distanceTo(p)).toBeLessThan(1e-6);
  });
});
