import * as THREE from 'three';
import { OrbitCamera } from './orbit-camera';

const len = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);

describe('OrbitCamera', () => {
  it('places the camera at distance from the target and looks at it', () => {
    const c = new OrbitCamera();
    c.target = { x: 1, y: 2, z: 3 };
    c.yaw = 0;
    c.pitch = 0;
    c.distance = 10;
    expect(c.position()).toEqual({ x: 1, y: 2, z: 13 });
    const f = c.forward();
    expect(f.z).toBeCloseTo(-1);
    expect(c.right()).toEqual({ x: 1, y: 0, z: -0 });
    expect(c.up().y).toBeCloseTo(1);
  });

  it('keeps an orthonormal basis that matches three.js lookAt', () => {
    const c = new OrbitCamera();
    c.yaw = 1.1;
    c.pitch = 0.7;
    const cam = new THREE.PerspectiveCamera();
    const p = c.position();
    cam.position.set(p.x, p.y, p.z);
    cam.lookAt(c.target.x, c.target.y, c.target.z);
    cam.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    expect(right.x).toBeCloseTo(c.right().x);
    expect(right.z).toBeCloseTo(c.right().z);
    expect(up.x).toBeCloseTo(c.up().x);
    expect(up.y).toBeCloseTo(c.up().y);
    expect(up.z).toBeCloseTo(c.up().z);
    expect(len(c.forward())).toBeCloseTo(1);
  });

  it('orbits: drag right decreases yaw, drag down raises the camera, pitch is clamped', () => {
    const c = new OrbitCamera();
    c.yaw = 0;
    c.pitch = 0;
    c.orbit(100, 0, 400);
    expect(c.yaw).toBeCloseTo(-Math.PI / 4);
    c.orbit(0, 100, 400);
    expect(c.pitch).toBeCloseTo(Math.PI / 4);
    c.orbit(0, 10_000, 400);
    expect(c.pitch).toBeCloseTo((89 * Math.PI) / 180);
    c.orbit(0, -20_000, 400);
    expect(c.pitch).toBeCloseTo((-89 * Math.PI) / 180);
  });

  it('pans so that the content follows the pointer', () => {
    const c = new OrbitCamera();
    c.yaw = 0;
    c.pitch = 0;
    c.distance = 10;
    c.fov = 90; // world per pixel = 2 * 10 * tan(45°) / 200 = 0.1
    c.pan(10, 0, 200);
    expect(c.target.x).toBeCloseTo(-1);
    c.pan(0, 10, 200);
    expect(c.target.y).toBeCloseTo(1);
    expect(c.target.z).toBeCloseTo(0);
  });

  it('zooms with clamping and ignores invalid factors', () => {
    const c = new OrbitCamera();
    c.distance = 10;
    c.zoom(0.5);
    expect(c.distance).toBe(5);
    c.zoom(0.0001);
    expect(c.distance).toBe(c.minDistance);
    c.zoom(1e9);
    expect(c.distance).toBe(c.maxDistance);
    c.zoom(-1);
    c.zoom(Number.NaN);
    expect(c.distance).toBe(c.maxDistance);
  });

  it('frames a box: target at its centre, whole bounding sphere visible', () => {
    const c = new OrbitCamera();
    c.fov = 60;
    c.frame({ min: { x: 0, y: 0, z: 0 }, max: { x: 9, y: 3, z: 9 } }, 2);
    expect(c.target).toEqual({ x: 5, y: 2, z: 5 });
    const radius = 0.5 * Math.hypot(10, 4, 10);
    expect(c.distance).toBeCloseTo((radius / Math.sin(Math.PI / 6)) * 1.05);
    // Portrait: the horizontal fov limits.
    c.frame({ min: { x: 0, y: 0, z: 0 }, max: { x: 9, y: 3, z: 9 } }, 0.5);
    const hHalf = Math.atan(Math.tan(Math.PI / 6) * 0.5);
    expect(c.distance).toBeCloseTo((radius / Math.sin(hHalf)) * 1.05);
  });

  it('derives near/far from the distance', () => {
    const c = new OrbitCamera();
    c.distance = 20;
    const { near, far } = c.clipPlanes();
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(1);
    expect(far).toBeGreaterThanOrEqual(1000);
  });

  it('reports the look direction', () => {
    const c = new OrbitCamera();
    c.pitch = 0.3; // looking slightly down
    c.yaw = 0; // camera south of target → looking north
    expect(c.lookDirection()).toMatchObject({ facing: 'north', pitch: 'level' });
    expect(c.lookDirection().yawDegrees).toBeCloseTo(0);
    c.yaw = Math.PI / 2; // camera east of target → looking west
    expect(c.lookDirection().facing).toBe('west');
    expect(c.lookDirection().yawDegrees).toBeCloseTo(270);
    c.yaw = -Math.PI / 2;
    expect(c.lookDirection().facing).toBe('east');
    c.yaw = Math.PI;
    expect(c.lookDirection().facing).toBe('south');
    c.pitch = 1.2;
    expect(c.lookDirection().pitch).toBe('down');
    expect(c.lookDirection().pitchDegrees).toBeCloseTo((-1.2 * 180) / Math.PI);
    c.pitch = -1.2;
    expect(c.lookDirection().pitch).toBe('up');
  });
});
