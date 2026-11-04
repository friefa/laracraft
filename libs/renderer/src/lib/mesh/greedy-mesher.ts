import { CHUNK_SIZE as CHUNK_SIZE_IMPORT, type Direction } from '@laracraft/core-model';
import * as padded from './extract';
import { textureLayerOf } from './texture-layers';
import type {
  ChunkMeshInput,
  ChunkMeshOutput,
  MeshBuffers,
  ModelInstances,
  PaletteRenderInfo,
  TextureLayers,
  TintKind,
} from './types';

/**
 * Greedy chunk mesher (DOM-free, three.js-free).
 *
 * Geometry conventions (see also `types.ts`):
 * - Positions are WORLD block coordinates (chunk origin = coord × 16), like
 *   `ModelInstances.positions`; the scene can place every chunk mesh at the origin.
 * - Triangles are counter-clockwise seen from outside (three.js `FrontSide`).
 * - UVs are in block units starting at 0 on each quad. `u` grows to the right and
 *   `v` grows upwards as seen from outside the face; `v = 1` is the TOP row of the
 *   16×16 image (sample with `fract(uv)` and flip v when the image row 0 is at v = 0).
 *   Side faces are upright (v along +Y). Top faces have the image top towards north,
 *   bottom faces towards south (Java Edition default orientation).
 * - Colours are `tint × face shade` in the 0..1 range (sRGB values as given).
 */

// Module-local copies: imported bindings can be property accesses after transpilation,
// which is measurably slower inside the hot loops.
const CHUNK_SIZE: number = CHUNK_SIZE_IMPORT;
const PADDED_STRIDE_Y: number = padded.PADDED_STRIDE_Y;
const PADDED_STRIDE_Z: number = padded.PADDED_STRIDE_Z;
const PADDED_VOLUME: number = padded.PADDED_VOLUME;

/** Face order used internally; same as `DIRECTIONS` in core-model. */
const DIRS: readonly Direction[] = ['down', 'up', 'north', 'south', 'west', 'east'];

/** Face shade per direction (multiplied with the tint colour). */
export const FACE_SHADE: Readonly<Record<Direction, number>> = {
  up: 1,
  down: 0.5,
  north: 0.8,
  south: 0.8,
  west: 0.6,
  east: 0.6,
};

/** Tint colours (0xRRGGBB). Redstone is interpolated by power, see {@link redstoneTint}. */
export const TINT_COLORS = {
  grass: 0x91bd59,
  foliage: 0x77ab2f,
  water: 0x3f76e4,
  redstoneDark: 0x4b0000,
  redstoneBright: 0xff3300,
} as const;

const rgb = (hex: number): [number, number, number] => [
  ((hex >> 16) & 0xff) / 255,
  ((hex >> 8) & 0xff) / 255,
  (hex & 0xff) / 255,
];

/** Redstone wire colour for power 0..15: linear from dark (#4B0000) to bright (#FF3300). */
export function redstoneTint(power: number): [number, number, number] {
  const t = Math.min(15, Math.max(0, power)) / 15;
  const a = rgb(TINT_COLORS.redstoneDark);
  const b = rgb(TINT_COLORS.redstoneBright);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Tint slots: 0 none, 1 grass, 2 foliage, 3 water, 4 + power redstone. */
const TINT_SLOTS = 20;
const TINT_RGB = (() => {
  const out = new Float32Array(TINT_SLOTS * 3);
  const set = (slot: number, c: readonly number[]): void => {
    out[slot * 3] = c[0] ?? 1;
    out[slot * 3 + 1] = c[1] ?? 1;
    out[slot * 3 + 2] = c[2] ?? 1;
  };
  set(0, [1, 1, 1]);
  set(1, rgb(TINT_COLORS.grass));
  set(2, rgb(TINT_COLORS.foliage));
  set(3, rgb(TINT_COLORS.water));
  for (let p = 0; p <= 15; p++) set(4 + p, redstoneTint(p));
  return out;
})();

const POWER_RE = /[[,]power=(\d+)/;

function tintSlot(kind: TintKind | undefined, state: string): number {
  switch (kind) {
    case 'grass':
      return 1;
    case 'foliage':
      return 2;
    case 'water':
      return 3;
    case 'redstone': {
      const m = POWER_RE.exec(state);
      const power = m ? Math.min(15, Number(m[1])) : 0;
      return 4 + power;
    }
    default:
      return 0;
  }
}

/** Palette kinds: 0 = not rendered, 1 = full (greedy), 2 = model (instanced). */
const KIND_FULL = 1;
const KIND_MODEL = 2;
const RENDER_LAYER_INDEX = { opaque: 0, cutout: 1, translucent: 2 } as const;

/** Palette flattened into typed arrays for the hot loop. */
interface PreparedPalette {
  readonly size: number;
  readonly kind: Uint8Array;
  readonly occludes: Uint8Array;
  /** Same value ⇔ same block id; faces between two non-occluding full blocks of one group are culled. */
  readonly cullGroup: Int32Array;
  /** p*6+dir → merge key + 1 (texture layer, tint slot, render layer); 0 = no face. */
  readonly faceKey: Int32Array;
}

const prepared = new WeakMap<
  readonly PaletteRenderInfo[],
  WeakMap<TextureLayers, PreparedPalette>
>();

const blockIdOf = (state: string): string => {
  const b = state.indexOf('[');
  return b === -1 ? state : state.slice(0, b);
};

function preparePalette(
  palette: readonly PaletteRenderInfo[],
  textures: TextureLayers,
): PreparedPalette {
  let byTextures = prepared.get(palette);
  const cached = byTextures?.get(textures);
  if (cached) return cached;
  const size = palette.length;
  const kind = new Uint8Array(size);
  const occludes = new Uint8Array(size);
  const cullGroup = new Int32Array(size).fill(-1);
  const faceKey = new Int32Array(size * 6);
  const groups = new Map<string, number>();
  palette.forEach((info, p) => {
    if (info.shape === 'model') {
      kind[p] = KIND_MODEL;
      return;
    }
    if (info.shape !== 'full') return;
    kind[p] = KIND_FULL;
    occludes[p] = info.occludes ? 1 : 0;
    const id = blockIdOf(info.state);
    let g = groups.get(id);
    if (g === undefined) groups.set(id, (g = groups.size));
    cullGroup[p] = g;
    const rl = RENDER_LAYER_INDEX[info.layer];
    DIRS.forEach((d, di) => {
      const tex = textureLayerOf(textures, info.faces?.[d] ?? 'missing');
      const tint = tintSlot(info.tint?.[d], info.state);
      faceKey[p * 6 + di] = (tex * 32 + tint) * 4 + rl + 1;
    });
  });
  const result: PreparedPalette = { size, kind, occludes, cullGroup, faceKey };
  if (!byTextures) prepared.set(palette, (byTextures = new WeakMap()));
  byTextures.set(textures, result);
  return result;
}

/** Growable per-render-layer vertex storage (4 vertices per quad). */
class QuadBuilder {
  quads = 0;
  private cap = 0;
  positions = new Float32Array(0);
  normals = new Float32Array(0);
  uvs = new Float32Array(0);
  layers = new Float32Array(0);
  colors = new Float32Array(0);

  reserve(): void {
    if (this.quads < this.cap) return;
    const cap = Math.max(64, this.cap * 2);
    const grow = (a: Float32Array, per: number): Float32Array<ArrayBuffer> => {
      const b = new Float32Array(cap * 4 * per);
      b.set(a);
      return b;
    };
    this.positions = grow(this.positions, 3);
    this.normals = grow(this.normals, 3);
    this.uvs = grow(this.uvs, 2);
    this.layers = grow(this.layers, 1);
    this.colors = grow(this.colors, 3);
    this.cap = cap;
  }

  finish(): MeshBuffers {
    const v = this.quads * 4;
    const indices = new Uint32Array(this.quads * 6);
    for (let q = 0, i = 0; q < this.quads; q++) {
      const b = q * 4;
      indices[i++] = b;
      indices[i++] = b + 1;
      indices[i++] = b + 2;
      indices[i++] = b;
      indices[i++] = b + 2;
      indices[i++] = b + 3;
    }
    return {
      positions: this.positions.slice(0, v * 3),
      normals: this.normals.slice(0, v * 3),
      uvs: this.uvs.slice(0, v * 2),
      layers: this.layers.slice(0, v),
      colors: this.colors.slice(0, v * 3),
      indices,
    };
  }
}

/**
 * Per face direction: normal axis, sign, and the texture "right" (R) and "up" (U)
 * axes with signs, chosen so that R × U = outward normal (CCW from outside).
 * Axis ids: 0 = x, 1 = y, 2 = z.
 */
interface FaceDef {
  readonly axis: number;
  readonly sign: number;
  readonly rAxis: number;
  readonly rSign: number;
  readonly uAxis: number;
  readonly uSign: number;
}
const FACES: readonly FaceDef[] = [
  { axis: 1, sign: -1, rAxis: 0, rSign: 1, uAxis: 2, uSign: 1 }, // down
  { axis: 1, sign: 1, rAxis: 0, rSign: 1, uAxis: 2, uSign: -1 }, // up
  { axis: 2, sign: -1, rAxis: 0, rSign: -1, uAxis: 1, uSign: 1 }, // north
  { axis: 2, sign: 1, rAxis: 0, rSign: 1, uAxis: 1, uSign: 1 }, // south
  { axis: 0, sign: -1, rAxis: 2, rSign: 1, uAxis: 1, uSign: 1 }, // west
  { axis: 0, sign: 1, rAxis: 2, rSign: -1, uAxis: 1, uSign: 1 }, // east
];
const STRIDE = [1, PADDED_STRIDE_Y, PADDED_STRIDE_Z] as const;

const EMPTY_INSTANCES: readonly ModelInstances[] = [];

/** Applies `maxY` by clearing padded rows above the limit; returns null when nothing is visible. */
function applyMaxY(input: ChunkMeshInput): Uint16Array | null {
  if (input.maxY === undefined) return input.data;
  const localMax = input.maxY - input.coord.y * CHUNK_SIZE;
  if (localMax < 0) return null;
  const firstHiddenRow = localMax + 2; // padded row of local y = localMax + 1
  if (firstHiddenRow > CHUNK_SIZE + 1) return input.data;
  const data = input.data.slice();
  data.fill(0, firstHiddenRow * PADDED_STRIDE_Y);
  return data;
}

/**
 * Meshes one chunk: greedy quads for `full` blocks (merged only across identical
 * texture layer, tint and render layer; face shade is constant per direction) and
 * instance positions for `model` blocks.
 */
export function meshChunk(
  input: ChunkMeshInput,
  palette: readonly PaletteRenderInfo[],
  textures: TextureLayers,
): ChunkMeshOutput {
  if (input.data.length !== PADDED_VOLUME) {
    throw new RangeError(
      `Chunk input must have ${PADDED_VOLUME} entries, got ${input.data.length}`,
    );
  }
  const pal = preparePalette(palette, textures);
  const builders = [new QuadBuilder(), new QuadBuilder(), new QuadBuilder()] as const;
  const data = applyMaxY(input);
  if (!data) {
    const empty = builders[0].finish();
    return { coord: input.coord, opaque: empty, cutout: empty, translucent: empty, models: [] };
  }
  const { size, kind, occludes, cullGroup, faceKey } = pal;
  const ox = input.coord.x * CHUNK_SIZE;
  const oy = input.coord.y * CHUNK_SIZE;
  const oz = input.coord.z * CHUNK_SIZE;
  const mask = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
  const min = [0, 0, 0];

  for (let di = 0; di < 6; di++) {
    const f = FACES[di] as FaceDef;
    const n = f.axis;
    const a1 = n === 0 ? 1 : 0;
    const a2 = n === 2 ? 1 : 2;
    const sN = STRIDE[n] as number;
    const s1 = STRIDE[a1] as number;
    const s2 = STRIDE[a2] as number;
    const nOff = f.sign * sN;
    const dir = DIRS[di] as Direction;
    const shade = FACE_SHADE[dir];
    const nx = n === 0 ? f.sign : 0;
    const ny = n === 1 ? f.sign : 0;
    const nz = n === 2 ? f.sign : 0;
    const rx = f.rAxis === 0 ? f.rSign : 0;
    const ry = f.rAxis === 1 ? f.rSign : 0;
    const rz = f.rAxis === 2 ? f.rSign : 0;
    const ux = f.uAxis === 0 ? f.uSign : 0;
    const uy = f.uAxis === 1 ? f.uSign : 0;
    const uz = f.uAxis === 2 ? f.uSign : 0;
    const rIsA1 = f.rAxis === a1;

    for (let i = 0; i < CHUNK_SIZE; i++) {
      // 1. Visibility mask for this slice.
      let any = false;
      const sliceBase = (i + 1) * sN + s1 + s2;
      for (let j2 = 0; j2 < CHUNK_SIZE; j2++) {
        const rowBase = sliceBase + j2 * s2;
        const mRow = j2 * CHUNK_SIZE;
        for (let j1 = 0; j1 < CHUNK_SIZE; j1++) {
          const idx = rowBase + j1 * s1;
          const p = data[idx] as number;
          if (p >= size || kind[p] !== KIND_FULL) {
            mask[mRow + j1] = 0;
            continue;
          }
          const q = data[idx + nOff] as number;
          let visible = true;
          if (q < size && kind[q] === KIND_FULL) {
            if (occludes[q] === 1) visible = false;
            else if (occludes[p] === 0 && cullGroup[p] === cullGroup[q]) visible = false;
          }
          if (visible) {
            mask[mRow + j1] = faceKey[p * 6 + di] as number;
            any = true;
          } else mask[mRow + j1] = 0;
        }
      }
      if (!any) continue;

      // 2. Greedy merge of equal keys into rectangles.
      for (let j2 = 0; j2 < CHUNK_SIZE; j2++) {
        for (let j1 = 0; j1 < CHUNK_SIZE;) {
          const key = mask[j2 * CHUNK_SIZE + j1] as number;
          if (key === 0) {
            j1++;
            continue;
          }
          let w = 1;
          while (j1 + w < CHUNK_SIZE && mask[j2 * CHUNK_SIZE + j1 + w] === key) w++;
          let h = 1;
          grow: while (j2 + h < CHUNK_SIZE) {
            const row = (j2 + h) * CHUNK_SIZE + j1;
            for (let k = 0; k < w; k++) if (mask[row + k] !== key) break grow;
            h++;
          }
          for (let r = 0; r < h; r++)
            mask.fill(0, (j2 + r) * CHUNK_SIZE + j1, (j2 + r) * CHUNK_SIZE + j1 + w);

          // 3. Emit the quad.
          const k0 = key - 1;
          const rl = k0 & 3;
          const tint = (k0 >> 2) & 31;
          const tex = k0 >> 7;
          min[n] = i + (f.sign > 0 ? 1 : 0);
          min[a1] = j1;
          min[a2] = j2;
          const wR = rIsA1 ? w : h;
          const hU = rIsA1 ? h : w;
          // Corner (u, v) = (0, 0); R/U point along +/- axes, so shift for negative ones.
          const x0 = ox + (min[0] as number) - (rx < 0 ? rx * wR : 0) - (ux < 0 ? ux * hU : 0);
          const y0 = oy + (min[1] as number) - (ry < 0 ? ry * wR : 0) - (uy < 0 ? uy * hU : 0);
          const z0 = oz + (min[2] as number) - (rz < 0 ? rz * wR : 0) - (uz < 0 ? uz * hU : 0);
          const dxR = rx * wR;
          const dyR = ry * wR;
          const dzR = rz * wR;
          const dxU = ux * hU;
          const dyU = uy * hU;
          const dzU = uz * hU;
          const b = builders[rl] as QuadBuilder;
          b.reserve();
          const q = b.quads++;
          const pos = b.positions;
          let o = q * 12;
          // Corners (0,0), (w,0), (w,h), (0,h) in (R, U): CCW seen from outside.
          pos[o] = x0;
          pos[o + 1] = y0;
          pos[o + 2] = z0;
          pos[o + 3] = x0 + dxR;
          pos[o + 4] = y0 + dyR;
          pos[o + 5] = z0 + dzR;
          pos[o + 6] = x0 + dxR + dxU;
          pos[o + 7] = y0 + dyR + dyU;
          pos[o + 8] = z0 + dzR + dzU;
          pos[o + 9] = x0 + dxU;
          pos[o + 10] = y0 + dyU;
          pos[o + 11] = z0 + dzU;
          const uv = b.uvs;
          o = q * 8;
          uv[o] = 0;
          uv[o + 1] = 0;
          uv[o + 2] = wR;
          uv[o + 3] = 0;
          uv[o + 4] = wR;
          uv[o + 5] = hU;
          uv[o + 6] = 0;
          uv[o + 7] = hU;
          const cr = (TINT_RGB[tint * 3] as number) * shade;
          const cg = (TINT_RGB[tint * 3 + 1] as number) * shade;
          const cb = (TINT_RGB[tint * 3 + 2] as number) * shade;
          const nrm = b.normals;
          const col = b.colors;
          const lay = b.layers;
          for (let v = 0, vi = q * 4; v < 4; v++, vi++) {
            nrm[vi * 3] = nx;
            nrm[vi * 3 + 1] = ny;
            nrm[vi * 3 + 2] = nz;
            col[vi * 3] = cr;
            col[vi * 3 + 1] = cg;
            col[vi * 3 + 2] = cb;
            lay[vi] = tex;
          }
          j1 += w;
        }
      }
    }
  }

  // Model blocks: world positions grouped by palette index (ascending).
  let groups: Map<number, number[]> | undefined;
  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const base = (y + 1) * PADDED_STRIDE_Y + (z + 1) * PADDED_STRIDE_Z + 1;
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const p = data[base + x] as number;
        if (p >= size || kind[p] !== KIND_MODEL) continue;
        groups ??= new Map();
        let list = groups.get(p);
        if (!list) groups.set(p, (list = []));
        list.push(ox + x, oy + y, oz + z);
      }
    }
  }
  const models = groups
    ? [...groups.keys()]
        .sort((a, b) => a - b)
        .map((paletteIndex) => ({
          paletteIndex,
          positions: Int32Array.from(groups?.get(paletteIndex) ?? []),
        }))
    : EMPTY_INSTANCES;

  return {
    coord: input.coord,
    opaque: builders[0].finish(),
    cutout: builders[1].finish(),
    translucent: builders[2].finish(),
    models,
  };
}

/** Distinct `ArrayBuffer`s of an output, for `postMessage` transfer lists. */
export function meshOutputTransferables(output: ChunkMeshOutput): ArrayBuffer[] {
  const set = new Set<ArrayBuffer>();
  for (const m of [output.opaque, output.cutout, output.translucent]) {
    for (const a of [m.positions, m.normals, m.uvs, m.layers, m.colors, m.indices]) {
      set.add(a.buffer as ArrayBuffer);
    }
  }
  for (const inst of output.models) set.add(inst.positions.buffer as ArrayBuffer);
  return [...set];
}
