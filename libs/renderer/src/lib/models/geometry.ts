import { DIRECTIONS, type Direction } from '@laracraft/core-model';

/**
 * Model-building primitives (DOM-free, three.js-free).
 *
 * All coordinates while building are in **pixels** (a block spans 0..16 on every axis,
 * Y up, Java axes: north = -Z, east = +X). UVs are in pixels as well, using the Minecraft
 * model convention (u to the right, v **down** from the top row of the texture). Both are
 * converted once in {@link toModelGeometry}.
 */

export type P3 = readonly [number, number, number];
export type Rgb = readonly [number, number, number];
/** Minecraft-style UV rectangle `[u1, v1, u2, v2]` in pixels; u1 > u2 mirrors. */
export type UvRect = readonly [number, number, number, number];
export type UvRotation = 0 | 90 | 180 | 270;
/** Texture per (final) face direction, for parts that keep world-aligned textures. */
export type FaceTexMap = Readonly<Record<Direction, string>>;

export const WHITE: Rgb = [1, 1, 1];

/** One textured quad. Vertices are counter-clockwise seen from the front (normal side). */
export interface Quad {
  /** 4 vertices × xyz, pixels. Order: bottom-left, bottom-right, top-right, top-left. */
  readonly p: readonly number[];
  /** 4 vertices × uv, pixels (v down). */
  readonly uv: readonly number[];
  readonly n: P3;
  /** Texture name, or a per-direction map resolved against the final normal. */
  readonly tex: string | FaceTexMap;
  /**
   * Minecraft `uvlock`: UVs are re-projected from the final (transformed) position so the
   * texture stays world-aligned when the part is rotated.
   */
  readonly uvLock: boolean;
  readonly tint: Rgb;
}

export interface FaceSpec {
  readonly tex: string | FaceTexMap;
  /** Explicit UV rect; default is the Minecraft auto-UV projected from the box position. */
  readonly uv?: UvRect;
  /** Clockwise texture rotation on the face. */
  readonly rotation?: UvRotation;
  /** Overrides the box-level `uvLock`. */
  readonly uvLock?: boolean;
}

export interface BoxOptions {
  readonly uvLock?: boolean;
  readonly tint?: Rgb;
}

export const FACE_NORMALS: Readonly<Record<Direction, P3>> = {
  down: [0, -1, 0],
  up: [0, 1, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
  west: [-1, 0, 0],
  east: [1, 0, 0],
};

/** Face corners (BL, BR, TR, TL as seen from outside) of the box `a`..`b`. */
function faceCorners(dir: Direction, a: P3, b: P3): number[] {
  const [x1, y1, z1] = a;
  const [x2, y2, z2] = b;
  switch (dir) {
    case 'north':
      return [x2, y1, z1, x1, y1, z1, x1, y2, z1, x2, y2, z1];
    case 'south':
      return [x1, y1, z2, x2, y1, z2, x2, y2, z2, x1, y2, z2];
    case 'west':
      return [x1, y1, z1, x1, y1, z2, x1, y2, z2, x1, y2, z1];
    case 'east':
      return [x2, y1, z2, x2, y1, z1, x2, y2, z1, x2, y2, z2];
    case 'up':
      return [x1, y2, z2, x2, y2, z2, x2, y2, z1, x1, y2, z1];
    case 'down':
      return [x1, y1, z1, x2, y1, z1, x2, y1, z2, x1, y1, z2];
  }
}

/**
 * Minecraft auto-UV: projects a point on a face with direction `dir` to texture pixels.
 * Top faces show north at the top of the texture, side faces show up at the top.
 */
export function projectUv(dir: Direction, x: number, y: number, z: number): [number, number] {
  switch (dir) {
    case 'up':
      return [x, z];
    case 'down':
      return [x, 16 - z];
    case 'north':
      return [16 - x, 16 - y];
    case 'south':
      return [x, 16 - y];
    case 'west':
      return [z, 16 - y];
    case 'east':
      return [16 - z, 16 - y];
  }
}

/** Per-vertex UVs for a rect: BL→(u1,v2), BR→(u2,v2), TR→(u2,v1), TL→(u1,v1), rotated clockwise. */
function rectUvs(rect: UvRect, rotation: UvRotation): number[] {
  const [u1, v1, u2, v2] = rect;
  const c = [u1, v2, u2, v2, u2, v1, u1, v1];
  const k = rotation / 90;
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + k) % 4;
    out.push(c[2 * j] as number, c[2 * j + 1] as number);
  }
  return out;
}

function projectedUvs(dir: Direction, p: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    out.push(...projectUv(dir, p[3 * i] as number, p[3 * i + 1] as number, p[3 * i + 2] as number));
  }
  return out;
}

/** Axis-aligned box `from`..`to` (pixels) with the given faces; omitted faces are not emitted. */
export function box(
  from: P3,
  to: P3,
  faces: Partial<Record<Direction, FaceSpec | string>>,
  opts: BoxOptions = {},
): Quad[] {
  const quads: Quad[] = [];
  for (const dir of DIRECTIONS) {
    const spec = faces[dir];
    if (spec === undefined) continue;
    const f: FaceSpec = typeof spec === 'string' ? { tex: spec } : spec;
    const p = faceCorners(dir, from, to);
    let uv: number[];
    if (f.uv) {
      uv = rectUvs(f.uv, f.rotation ?? 0);
    } else if (f.rotation) {
      const [u1, v2] = projectUv(dir, p[0] as number, p[1] as number, p[2] as number);
      const [u2, v1] = projectUv(dir, p[6] as number, p[7] as number, p[8] as number);
      uv = rectUvs([u1, v1, u2, v2], f.rotation);
    } else {
      uv = projectedUvs(dir, p);
    }
    quads.push({
      p,
      uv,
      n: FACE_NORMALS[dir],
      tex: f.tex,
      uvLock: f.uvLock ?? opts.uvLock ?? false,
      tint: opts.tint ?? WHITE,
    });
  }
  return quads;
}

/** Box whose faces take their texture from `tex` by final direction, with `uvlock`. */
export function lockedBox(
  from: P3,
  to: P3,
  tex: FaceTexMap,
  skip: readonly Direction[] = [],
  tint?: Rgb,
): Quad[] {
  const faces: Partial<Record<Direction, FaceSpec>> = {};
  for (const dir of DIRECTIONS) if (!skip.includes(dir)) faces[dir] = { tex };
  return box(from, to, faces, { uvLock: true, ...(tint ? { tint } : {}) });
}

/** Same texture on all six faces. */
export function uniformTex(name: string): FaceTexMap {
  return { up: name, down: name, north: name, south: name, west: name, east: name };
}

/** Adds a back-facing copy of every quad (for flat, paper-thin parts). */
export function doubleSided(quads: readonly Quad[]): Quad[] {
  const out = [...quads];
  for (const q of quads) {
    out.push({
      ...q,
      p: reorder(q.p, 3),
      uv: reorder(q.uv, 2),
      n: [-q.n[0], -q.n[1], -q.n[2]],
    });
  }
  return out;
}

/** Vertex order 0,1,2,3 → 0,3,2,1 (flips the winding, keeps the 0–2 diagonal). */
function reorder(a: readonly number[], stride: number): number[] {
  const out: number[] = [];
  for (const i of [0, 3, 2, 1])
    for (let k = 0; k < stride; k++) out.push(a[i * stride + k] as number);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------------------------

/** Row-major 3×3 matrix. */
export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export const CENTER: P3 = [8, 8, 8];
const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Snaps values that are integers up to floating-point noise (exact 90° rotations). */
function snap(v: number): number {
  const r = Math.round(v);
  return Math.abs(v - r) < 1e-12 ? r : v;
}

function sinCos(deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [snap(Math.sin(rad)), snap(Math.cos(rad))];
}

/** Applies `p' = m·(p − pivot) + pivot + offset`; mirrors (det < 0) keep the winding CCW. */
export function transform(
  quads: readonly Quad[],
  m: Mat3,
  pivot: P3 = CENTER,
  offset: P3 = [0, 0, 0],
): Quad[] {
  const det =
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6]);
  const apply = (x: number, y: number, z: number): [number, number, number] => [
    m[0] * x + m[1] * y + m[2] * z,
    m[3] * x + m[4] * y + m[5] * z,
    m[6] * x + m[7] * y + m[8] * z,
  ];
  return quads.map((q) => {
    const p: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = apply(
        (q.p[3 * i] as number) - pivot[0],
        (q.p[3 * i + 1] as number) - pivot[1],
        (q.p[3 * i + 2] as number) - pivot[2],
      );
      p.push(r[0] + pivot[0] + offset[0], r[1] + pivot[1] + offset[1], r[2] + pivot[2] + offset[2]);
    }
    const n = apply(q.n[0], q.n[1], q.n[2]);
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    const nn: P3 = [snap(n[0] / len), snap(n[1] / len), snap(n[2] / len)];
    return det < 0
      ? { ...q, p: reorder(p, 3), uv: reorder(q.uv, 2), n: nn }
      : { ...q, p, uv: [...q.uv], n: nn };
  });
}

export function translate(quads: readonly Quad[], d: P3): Quad[] {
  return transform(quads, IDENTITY, [0, 0, 0], d);
}

/** Rotation about the Y axis, clockwise seen from above (Minecraft blockstate `y`): east → south. */
export function rotateY(quads: readonly Quad[], deg: number, pivot: P3 = CENTER): Quad[] {
  if (deg % 360 === 0) return [...quads];
  const [s, c] = sinCos(deg);
  return transform(quads, [c, 0, -s, 0, 1, 0, s, 0, c], pivot);
}

/** Rotation about the X axis; positive angles turn +Y towards +Z (up → south). */
export function rotateX(quads: readonly Quad[], deg: number, pivot: P3 = CENTER): Quad[] {
  if (deg % 360 === 0) return [...quads];
  const [s, c] = sinCos(deg);
  return transform(quads, [1, 0, 0, 0, c, -s, 0, s, c], pivot);
}

/** Rotation about the Z axis; positive angles tilt +Y towards +X (up → east). */
export function rotateZ(quads: readonly Quad[], deg: number, pivot: P3 = CENTER): Quad[] {
  if (deg % 360 === 0) return [...quads];
  const [s, c] = sinCos(deg);
  return transform(quads, [c, s, 0, -s, c, 0, 0, 0, 1], pivot);
}

/** Mirror at the horizontal mid-plane (top half of stairs/slabs). */
export function flipY(quads: readonly Quad[]): Quad[] {
  return transform(quads, [1, 0, 0, 0, -1, 0, 0, 0, 1]);
}

/** Mirror at the X mid-plane. */
export function mirrorX(quads: readonly Quad[]): Quad[] {
  return transform(quads, [-1, 0, 0, 0, 1, 0, 0, 0, 1]);
}

// ---------------------------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------------------------

/** Dominant axis direction of a normal. */
export function directionOf(n: P3): Direction {
  const ax = Math.abs(n[0]);
  const ay = Math.abs(n[1]);
  const az = Math.abs(n[2]);
  if (ay >= ax && ay >= az) return n[1] >= 0 ? 'up' : 'down';
  if (ax >= az) return n[0] >= 0 ? 'east' : 'west';
  return n[2] >= 0 ? 'south' : 'north';
}

/**
 * Minecraft directional shading, blended for tilted faces:
 * top 1.0, north/south 0.8, east/west 0.6, bottom 0.5.
 */
export function faceShade(n: P3): number {
  const [x, y, z] = n;
  return x * x * 0.6 + z * z * 0.8 + y * y * (y > 0 ? 1 : 0.5);
}

/** Pixel UV (v down) → texture fraction. v is flipped to the GL convention (v = 1 is the top row). */
export function pixelToUv(u: number, v: number): [number, number] {
  return [u / 16, 1 - v / 16];
}

function toUnit(v: number): number {
  const u = v / 16;
  const r = Math.round(u * 16) / 16;
  const out = Math.abs(u - r) < 1e-9 ? r : u;
  return out === 0 ? 0 : out; // no -0
}

/** Converts quads (pixels) to GPU buffers (block units 0..1). Unknown textures → `missing`. */
export function toModelGeometry(
  quads: readonly Quad[],
  textures: Readonly<Record<string, number>>,
): {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  layers: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
} {
  const n = quads.length;
  const positions = new Float32Array(n * 12);
  const normals = new Float32Array(n * 12);
  const uvs = new Float32Array(n * 8);
  const layers = new Float32Array(n * 4);
  const colors = new Float32Array(n * 12);
  const indices = new Uint32Array(n * 6);
  const missing = Object.hasOwn(textures, 'missing') ? (textures['missing'] as number) : 0;

  quads.forEach((q, qi) => {
    const dir = directionOf(q.n);
    const name = typeof q.tex === 'string' ? q.tex : q.tex[dir];
    const layer = Object.hasOwn(textures, name) ? (textures[name] as number) : missing;
    const uv = q.uvLock ? projectedUvs(dir, q.p) : q.uv;
    const shade = faceShade(q.n);
    for (let i = 0; i < 4; i++) {
      const v = qi * 4 + i;
      for (let k = 0; k < 3; k++) {
        positions[v * 3 + k] = toUnit(q.p[i * 3 + k] as number);
        normals[v * 3 + k] = q.n[k] as number;
        colors[v * 3 + k] = (q.tint[k] as number) * shade;
      }
      const [tu, tv] = pixelToUv(uv[i * 2] as number, uv[i * 2 + 1] as number);
      uvs[v * 2] = tu;
      uvs[v * 2 + 1] = tv;
      layers[v] = layer;
    }
    const b = qi * 4;
    indices.set([b, b + 1, b + 2, b, b + 2, b + 3], qi * 6);
  });
  return { positions, normals, uvs, layers, colors, indices };
}
