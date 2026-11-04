import type * as THREE from 'three';
import { type OrbitCamera, type ViewInsets, visibleRegion } from './orbit-camera';

/**
 * Copies the orbit model onto a three.js camera for a `width` × `height` canvas (CSS px).
 * With insets, the projection centre moves into the uncovered part of the canvas, so the
 * orbit target (and a framed build) appears centred there instead of under the UI.
 */
export function syncCamera(
  camera: THREE.PerspectiveCamera,
  orbit: OrbitCamera,
  width: number,
  height: number,
  insets: ViewInsets,
): void {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const p = orbit.position();
  const { near, far } = orbit.clipPlanes();
  camera.fov = orbit.fov;
  camera.aspect = w / h;
  camera.near = near;
  camera.far = far;
  camera.position.set(p.x, p.y, p.z);
  camera.lookAt(orbit.target.x, orbit.target.y, orbit.target.z);
  const { shiftX, shiftY } = visibleRegion(w, h, insets);
  // A full-size view window moved against the shift: the scene moves by +shift on screen.
  if (shiftX !== 0 || shiftY !== 0) camera.setViewOffset(w, h, -shiftX, -shiftY, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
