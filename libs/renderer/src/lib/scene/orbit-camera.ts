import type { Box3, HorizontalDirection } from '@laracraft/core-model';
import type { XYZ } from './picking';

/** Coarse camera orientation for placement rules (Java `facing` from the player's view). */
export interface LookDirection {
  /** Horizontal direction the camera looks towards (dominant axis of the view vector). */
  readonly facing: HorizontalDirection;
  /** `down`/`up` when the view vector points more than 45° below/above the horizon. */
  readonly pitch: 'up' | 'level' | 'down';
  /** Compass yaw of the view in degrees: 0 = north (-Z), 90 = east (+X), 180 = south, 270 = west. */
  readonly yawDegrees: number;
  /** View pitch in degrees: negative when looking down, positive when looking up. */
  readonly pitchDegrees: number;
}

const DEG = Math.PI / 180;
const MAX_PITCH = 89 * DEG;

/**
 * Pure orbit camera model (no three.js). The camera sits on a sphere around `target`:
 * `position = target + distance · (sin(yaw)·cos(pitch), sin(pitch), cos(yaw)·cos(pitch))`.
 * `yaw = 0` puts the camera south of the target looking north (-Z); positive `pitch`
 * lifts the camera above the target (looking down).
 */
export class OrbitCamera {
  target: XYZ = { x: 0, y: 0, z: 0 };
  /** Radians. */
  yaw = 35 * DEG;
  /** Radians, elevation of the camera above the target, clamped to ±89°. */
  pitch = 35 * DEG;
  distance = 30;
  /** Vertical field of view in degrees. */
  fov = 50;
  minDistance = 1.5;
  maxDistance = 2000;
  /** Radians of orbit per pixel times viewport height (π → a full-height drag = 180°). */
  rotateSpeed = Math.PI;

  /** Orbit by a pointer delta in CSS pixels. Drag right → scene turns right; drag down → camera rises. */
  orbit(dx: number, dy: number, viewportHeight: number): void {
    const k = this.rotateSpeed / Math.max(1, viewportHeight);
    this.yaw = normalizeAngle(this.yaw - dx * k);
    this.pitch = clamp(this.pitch + dy * k, -MAX_PITCH, MAX_PITCH);
  }

  /** World units per CSS pixel at the target distance. */
  worldPerPixel(viewportHeight: number): number {
    return (2 * this.distance * Math.tan((this.fov * DEG) / 2)) / Math.max(1, viewportHeight);
  }

  /** Pan by a pointer delta in CSS pixels: the content under the pointer follows it. */
  pan(dx: number, dy: number, viewportHeight: number): void {
    const s = this.worldPerPixel(viewportHeight);
    const r = this.right();
    const u = this.up();
    this.target = {
      x: this.target.x - r.x * dx * s + u.x * dy * s,
      y: this.target.y - r.y * dx * s + u.y * dy * s,
      z: this.target.z - r.z * dx * s + u.z * dy * s,
    };
  }

  /** Multiply the distance by `factor` (< 1 zooms in), clamped to [minDistance, maxDistance]. */
  zoom(factor: number): void {
    if (!(factor > 0) || !Number.isFinite(factor)) return;
    this.distance = clamp(this.distance * factor, this.minDistance, this.maxDistance);
  }

  /** Fit an inclusive block box into the view (keeps yaw/pitch). */
  frame(box: Box3, aspect: number): void {
    const sx = box.max.x - box.min.x + 1;
    const sy = box.max.y - box.min.y + 1;
    const sz = box.max.z - box.min.z + 1;
    this.target = {
      x: box.min.x + sx / 2,
      y: box.min.y + sy / 2,
      z: box.min.z + sz / 2,
    };
    const radius = 0.5 * Math.hypot(sx, sy, sz);
    const vHalf = (this.fov * DEG) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * Math.max(1e-3, aspect));
    const half = Math.min(vHalf, hHalf);
    this.distance = clamp((radius / Math.sin(half)) * 1.05, this.minDistance, this.maxDistance);
  }

  position(): XYZ {
    const cp = Math.cos(this.pitch);
    return {
      x: this.target.x + this.distance * Math.sin(this.yaw) * cp,
      y: this.target.y + this.distance * Math.sin(this.pitch),
      z: this.target.z + this.distance * Math.cos(this.yaw) * cp,
    };
  }

  /** Unit view direction (camera → target). */
  forward(): XYZ {
    const cp = Math.cos(this.pitch);
    return {
      x: -Math.sin(this.yaw) * cp,
      y: -Math.sin(this.pitch),
      z: -Math.cos(this.yaw) * cp,
    };
  }

  /** Unit screen-right vector (always horizontal). */
  right(): XYZ {
    return { x: Math.cos(this.yaw), y: 0, z: -Math.sin(this.yaw) };
  }

  /** Unit screen-up vector (right × forward). */
  up(): XYZ {
    const r = this.right();
    const f = this.forward();
    return {
      x: r.y * f.z - r.z * f.y,
      y: r.z * f.x - r.x * f.z,
      z: r.x * f.y - r.y * f.x,
    };
  }

  /** Suggested clip planes for the current distance. */
  clipPlanes(): { near: number; far: number } {
    return {
      near: clamp(this.distance * 0.002, 0.05, 2),
      far: Math.max(1000, this.distance * 10),
    };
  }

  lookDirection(): LookDirection {
    const f = this.forward();
    let facing: HorizontalDirection;
    if (Math.abs(f.x) > Math.abs(f.z)) facing = f.x > 0 ? 'east' : 'west';
    else facing = f.z > 0 ? 'south' : 'north';
    const pitchDegrees = -this.pitch / DEG;
    const pitch = pitchDegrees < -45 ? 'down' : pitchDegrees > 45 ? 'up' : 'level';
    // Compass yaw of the view vector: north = -Z = 0°, east = +X = 90°.
    let yawDegrees = Math.atan2(f.x, -f.z) / DEG;
    if (yawDegrees < 0) yawDegrees += 360;
    return { facing, pitch, yawDegrees, pitchDegrees };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function normalizeAngle(a: number): number {
  const t = 2 * Math.PI;
  return ((((a + Math.PI) % t) + t) % t) - Math.PI;
}
