import {
  BlockPalette,
  ChunkedVolume,
  collectTextureNames,
  createJavaBlockRegistry,
  type BlockStateString,
  type ChunkCoord,
} from '@laracraft/core-model';
import { extractChunkInput } from './extract';
import { FACE_SHADE, TINT_COLORS, meshChunk, redstoneTint } from './greedy-mesher';
import { resolvePaletteRenderInfo } from './render-info';
import { createTextureLayers } from './texture-layers';
import type { ChunkMeshOutput, MeshBuffers, PaletteRenderInfo } from './types';

const registry = createJavaBlockRegistry();
const textures = createTextureLayers({
  textures: Object.fromEntries(
    [...collectTextureNames(registry), 'missing'].map((n) => [n, {}] as const),
  ),
});
const layerOf = (name: string): number => textures[name] ?? -1;

type Placement = readonly [number, number, number, string];

function build(blocks: readonly Placement[]) {
  const palette = new BlockPalette();
  const volume = new ChunkedVolume();
  for (const [x, y, z, s] of blocks) volume.set(x, y, z, palette.intern(s as BlockStateString));
  const info = resolvePaletteRenderInfo(registry, palette.entries());
  const mesh = (coord: ChunkCoord = { x: 0, y: 0, z: 0 }, maxY?: number): ChunkMeshOutput =>
    meshChunk(extractChunkInput(volume, coord, maxY), info, textures);
  return { palette, volume, info, mesh };
}

const quads = (m: MeshBuffers): number => m.indices.length / 6;
const totalQuads = (o: ChunkMeshOutput): number =>
  quads(o.opaque) + quads(o.cutout) + quads(o.translucent);

interface Quad {
  corners: [number, number, number][];
  normal: [number, number, number];
  uvs: [number, number][];
  layer: number;
  color: [number, number, number];
}

function quadList(m: MeshBuffers): Quad[] {
  const out: Quad[] = [];
  for (let q = 0; q < quads(m); q++) {
    const v = q * 4;
    const corners = [0, 1, 2, 3].map(
      (k) => [...m.positions.slice((v + k) * 3, (v + k) * 3 + 3)] as [number, number, number],
    );
    out.push({
      corners,
      normal: [...m.normals.slice(v * 3, v * 3 + 3)] as [number, number, number],
      uvs: [0, 1, 2, 3].map(
        (k) => [...m.uvs.slice((v + k) * 2, (v + k) * 2 + 2)] as [number, number],
      ),
      layer: m.layers[v] ?? -1,
      color: [...m.colors.slice(v * 3, v * 3 + 3)] as [number, number, number],
    });
  }
  return out;
}

const area = (q: Quad): number => {
  const [a, b, , d] = q.corners as [number, number, number][];
  const len = (p: number[], r: number[]) => Math.hypot(...p.map((x, i) => x - (r[i] ?? 0)));
  return len(b as number[], a as number[]) * len(d as number[], a as number[]);
};

const findNormal = (qs: Quad[], n: [number, number, number]) =>
  qs.filter((q) => q.normal.every((c, i) => c === n[i]));

const N = {
  up: [0, 1, 0],
  down: [0, -1, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
  west: [-1, 0, 0],
  east: [1, 0, 0],
} as const satisfies Record<string, [number, number, number]>;

describe('meshChunk', () => {
  it('meshes a single block into 6 quads / 12 triangles with outward CCW winding', () => {
    const out = build([[0, 0, 0, 'minecraft:stone']]).mesh();
    expect(quads(out.opaque)).toBe(6);
    expect(out.opaque.indices.length / 3).toBe(12);
    expect(out.opaque.positions.length).toBe(24 * 3);
    expect(quads(out.cutout) + quads(out.translucent)).toBe(0);
    const qs = quadList(out.opaque);
    for (const q of qs) {
      const [a, b, c] = q.corners as [number, number, number][];
      const e1 = b.map((x, i) => x - (a[i] ?? 0));
      const e2 = c.map((x, i) => x - (a[i] ?? 0));
      const cross = [
        (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0),
        (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0),
        (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0),
      ];
      expect(cross.reduce((s, x, i) => s + x * (q.normal[i] ?? 0), 0)).toBeGreaterThan(0);
      for (const p of q.corners) for (const c2 of p) expect([0, 1]).toContain(c2);
      expect(q.layer).toBe(layerOf('stone'));
    }
    expect(new Set(qs.map((q) => q.normal.join())).size).toBe(6);
  });

  it('merges a 2×2×2 cube into 6 quads of area 4', () => {
    const blocks: Placement[] = [];
    for (let x = 0; x < 2; x++)
      for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) blocks.push([x, y, z, 'stone']);
    const qs = quadList(build(blocks).mesh().opaque);
    expect(qs).toHaveLength(6);
    for (const q of qs) expect(area(q)).toBe(4);
  });

  it('culls the shared face between two adjacent opaque blocks', () => {
    // Different textures prevent merging, so each block keeps exactly 5 faces.
    const out = build([
      [0, 0, 0, 'stone'],
      [1, 0, 0, 'cobblestone'],
    ]).mesh();
    const qs = quadList(out.opaque);
    expect(qs).toHaveLength(10);
    const atShared = qs.filter((q) => q.corners.every((p) => p[0] === 1));
    expect(atShared).toHaveLength(0);
    expect(
      quads(
        build([
          [0, 0, 0, 'stone'],
          [1, 0, 0, 'stone'],
        ]).mesh().opaque,
      ),
    ).toBe(6);
  });

  it('culls faces across chunk borders via the padding', () => {
    const b = build([
      [15, 0, 0, 'stone'],
      [16, 0, 0, 'stone'],
      [5, 15, 5, 'stone'],
      [5, 16, 5, 'stone'],
    ]);
    const c0 = quadList(b.mesh().opaque);
    expect(c0).toHaveLength(10);
    expect(findNormal(c0, N.east).filter((q) => q.corners[0]?.[0] === 16)).toHaveLength(0);
    expect(findNormal(c0, N.up).filter((q) => q.corners[0]?.[1] === 16)).toHaveLength(0);
    const cx = quadList(b.mesh({ x: 1, y: 0, z: 0 }).opaque);
    expect(cx).toHaveLength(5);
    expect(findNormal(cx, N.west)).toHaveLength(0);
    for (const q of cx) for (const p of q.corners) expect(p[0]).toBeGreaterThanOrEqual(16);
    expect(quads(b.mesh({ x: 0, y: 1, z: 0 }).opaque)).toBe(5);
  });

  it('handles negative chunk coordinates', () => {
    const b = build([
      [-1, -1, -1, 'stone'],
      [0, -1, -1, 'stone'],
    ]);
    const neg = quadList(b.mesh({ x: -1, y: -1, z: -1 }).opaque);
    expect(neg).toHaveLength(5);
    expect(findNormal(neg, N.east)).toHaveLength(0);
    for (const q of neg) for (const p of q.corners) expect(p[0]).toBeLessThanOrEqual(0);
  });

  it('culls glass next to glass but keeps the stone face next to glass', () => {
    const glass = build([
      [0, 0, 0, 'glass'],
      [1, 0, 0, 'glass'],
    ]).mesh();
    expect(quads(glass.opaque)).toBe(0);
    const gq = quadList(glass.cutout);
    expect(gq).toHaveLength(6);
    expect(gq.filter((q) => q.corners.every((p) => p[0] === 1))).toHaveLength(0);

    const mixed = build([
      [0, 0, 0, 'stone'],
      [1, 0, 0, 'glass'],
    ]).mesh();
    const sq = quadList(mixed.opaque);
    expect(sq).toHaveLength(6);
    expect(findNormal(sq, N.east)).toHaveLength(1);
    const cq = quadList(mixed.cutout);
    expect(cq).toHaveLength(5);
    expect(findNormal(cq, N.west)).toHaveLength(0);
  });

  it('keeps faces between different non-occluding blocks and puts translucent in its own buffer', () => {
    const out = build([
      [0, 0, 0, 'glass'],
      [1, 0, 0, 'ice'],
    ]).mesh();
    expect(quads(out.cutout)).toBe(6);
    expect(quads(out.translucent)).toBe(6);
  });

  it('does not merge faces with different textures', () => {
    const out = build([
      [0, 0, 0, 'stone'],
      [1, 0, 0, 'cobblestone'],
      [2, 0, 0, 'stone'],
    ]).mesh();
    const up = findNormal(quadList(out.opaque), N.up);
    expect(up).toHaveLength(3);
    expect(new Set(up.map((q) => q.layer))).toEqual(
      new Set([layerOf('stone'), layerOf('cobblestone')]),
    );
  });

  it('does not merge faces with the same texture but different tint', () => {
    const base: PaletteRenderInfo = {
      state: 'test:a' as BlockStateString,
      shape: 'full',
      layer: 'opaque',
      faces: {
        up: 'stone',
        down: 'stone',
        north: 'stone',
        south: 'stone',
        west: 'stone',
        east: 'stone',
      },
      occludes: true,
    };
    const palette: PaletteRenderInfo[] = [
      {
        state: 'minecraft:air' as BlockStateString,
        shape: 'none',
        layer: 'opaque',
        occludes: false,
      },
      base,
      { ...base, state: 'test:b' as BlockStateString, tint: { up: 'grass' } },
    ];
    const data = new Uint16Array(18 * 18 * 18);
    data[1 + 18 + 324] = 1;
    data[2 + 18 + 324] = 2;
    const out = meshChunk({ coord: { x: 0, y: 0, z: 0 }, data }, palette, textures);
    expect(findNormal(quadList(out.opaque), N.up)).toHaveLength(2);
    expect(findNormal(quadList(out.opaque), N.south)).toHaveLength(1);
  });

  it('hides blocks above maxY and exposes the cut faces', () => {
    const b = build([
      [0, 0, 0, 'stone'],
      [0, 1, 0, 'cobblestone'],
      [0, 2, 0, 'stone'],
      [3, 15, 3, 'stone'],
      [3, 16, 3, 'stone'],
      [5, 4, 5, 'torch'],
    ]);
    const cut = quadList(b.mesh(undefined, 0).opaque);
    expect(cut).toHaveLength(6);
    for (const q of cut) for (const p of q.corners) expect(p[1]).toBeLessThanOrEqual(1);
    expect(b.mesh(undefined, 0).models).toHaveLength(0);
    // Limit at the chunk's top row: the block in the chunk above no longer culls.
    const top = quadList(b.mesh(undefined, 15).opaque);
    expect(findNormal(top, N.up).some((q) => q.corners[0]?.[1] === 16)).toBe(true);
    expect(totalQuads(b.mesh({ x: 0, y: 1, z: 0 }, 15))).toBe(0);
    expect(totalQuads(b.mesh(undefined, -1))).toBe(0);
    expect(totalQuads(b.mesh(undefined, 100))).toBe(totalQuads(b.mesh()));
  });

  it.each(['north', 'east', 'south', 'west'] as const)(
    'puts the furnace front on the %s face',
    (facing) => {
      const out = build([[0, 0, 0, `furnace[facing=${facing},lit=false]`]]).mesh();
      const qs = quadList(out.opaque);
      const front = qs.filter((q) => q.layer === layerOf('furnace_front'));
      expect(front).toHaveLength(1);
      expect(front[0]?.normal).toEqual(N[facing]);
      expect(findNormal(qs, N.up)[0]?.layer).toBe(layerOf('furnace_top'));
    },
  );

  it.each(['north', 'east', 'south', 'west', 'up', 'down'] as const)(
    'puts the observer front on the %s face and the back opposite',
    (facing) => {
      const opposite = {
        north: 'south',
        south: 'north',
        east: 'west',
        west: 'east',
        up: 'down',
        down: 'up',
      } as const;
      const qs = quadList(
        build([[0, 0, 0, `observer[facing=${facing},powered=false]`]]).mesh().opaque,
      );
      expect(qs.filter((q) => q.layer === layerOf('observer_front')).map((q) => q.normal)).toEqual([
        N[facing],
      ]);
      expect(qs.filter((q) => q.layer === layerOf('observer_back')).map((q) => q.normal)).toEqual([
        N[opposite[facing]],
      ]);
    },
  );

  it.each([
    ['x', ['west', 'east']],
    ['y', ['down', 'up']],
    ['z', ['north', 'south']],
  ] as const)('puts the log end texture on the %s axis', (axis, ends) => {
    const qs = quadList(build([[0, 0, 0, `oak_log[axis=${axis}]`]]).mesh().opaque);
    const endNormals = qs.filter((q) => q.layer === layerOf('oak_log_top')).map((q) => q.normal);
    expect(endNormals).toHaveLength(2);
    expect(endNormals).toEqual(expect.arrayContaining(ends.map((e) => N[e])));
    expect(qs.filter((q) => q.layer === layerOf('oak_log'))).toHaveLength(4);
  });

  it('keeps side textures upright and tiles UVs in block units', () => {
    const blocks: Placement[] = [];
    for (let x = 0; x < 3; x++) for (let y = 0; y < 2; y++) blocks.push([x, y, 0, 'stone']);
    const qs = quadList(build(blocks).mesh().opaque);
    for (const dir of ['north', 'south'] as const) {
      const [q] = findNormal(qs, N[dir]);
      expect(q).toBeDefined();
      if (!q) continue;
      // v follows world Y, u spans the width in blocks.
      q.corners.forEach((p, i) => expect(q.uvs[i]?.[1]).toBe(p[1]));
      expect(Math.max(...q.uvs.map((uv) => uv[0]))).toBe(3);
      // u grows to the right as seen from outside: north face → towards -x.
      const u0 = q.corners[q.uvs.findIndex((uv) => uv[0] === 0)]?.[0];
      expect(u0).toBe(dir === 'north' ? 3 : 0);
    }
    for (const dir of ['east', 'west'] as const) {
      const [q] = findNormal(qs, N[dir]);
      q?.corners.forEach((p, i) => expect(q.uvs[i]?.[1]).toBe(p[1]));
    }
  });

  it('applies tint colours and face shades', () => {
    const qs = quadList(build([[0, 0, 0, 'grass_block[snowy=false]']]).mesh().opaque);
    const grass = [0x91 / 255, 0xbd / 255, 0x59 / 255];
    const up = findNormal(qs, N.up)[0];
    expect(up?.layer).toBe(layerOf('grass_block_top'));
    up?.color.forEach((c, i) => expect(c).toBeCloseTo(grass[i] ?? 0, 5));
    findNormal(qs, N.north)[0]?.color.forEach((c) => expect(c).toBeCloseTo(0.8, 5));
    findNormal(qs, N.east)[0]?.color.forEach((c) => expect(c).toBeCloseTo(0.6, 5));
    const down = findNormal(qs, N.down)[0];
    expect(down?.layer).toBe(layerOf('dirt'));
    down?.color.forEach((c) => expect(c).toBeCloseTo(0.5, 5));

    const leaves = quadList(
      build([[0, 0, 0, 'oak_leaves[distance=7,persistent=true,waterlogged=false]']]).mesh().cutout,
    );
    const foliage = [0x77 / 255, 0xab / 255, 0x2f / 255];
    findNormal(leaves, N.south)[0]?.color.forEach((c, i) =>
      expect(c).toBeCloseTo((foliage[i] ?? 0) * FACE_SHADE.south, 5),
    );
  });

  it('interpolates redstone tint by power', () => {
    expect(redstoneTint(0)).toEqual([0x4b / 255, 0, 0]);
    const bright = redstoneTint(15);
    expect(bright[0]).toBeCloseTo(1, 6);
    expect(bright[1]).toBeCloseTo(0x33 / 255, 6);
    expect(redstoneTint(7)[0]).toBeGreaterThan(redstoneTint(6)[0]);
    expect(TINT_COLORS.water).toBe(0x3f76e4);

    const mk = (power: number): PaletteRenderInfo => ({
      state: `test:wire[power=${power}]` as BlockStateString,
      shape: 'full',
      layer: 'cutout',
      faces: {
        up: 'redstone_dust',
        down: 'redstone_dust',
        north: 'redstone_dust',
        south: 'redstone_dust',
        west: 'redstone_dust',
        east: 'redstone_dust',
      },
      tint: { up: 'redstone' },
      occludes: false,
    });
    const palette = [
      {
        state: 'minecraft:air' as BlockStateString,
        shape: 'none' as const,
        layer: 'opaque' as const,
        occludes: false,
      },
      mk(0),
      mk(15),
    ];
    const data = new Uint16Array(18 * 18 * 18);
    data[1 + 18 + 324] = 1;
    data[3 + 18 + 324] = 2;
    const ups = findNormal(
      quadList(meshChunk({ coord: { x: 0, y: 0, z: 0 }, data }, palette, textures).cutout),
      N.up,
    );
    expect(ups.map((q) => q.color[0])).toEqual(
      expect.arrayContaining([expect.closeTo(0x4b / 255, 5), expect.closeTo(1, 5)]),
    );
  });

  it('reports model blocks as instances grouped by palette index', () => {
    const b = build([
      [1, 2, 3, 'torch'],
      [0, 0, 0, 'stone'],
      [4, 5, 6, 'torch'],
      [7, 0, 7, 'oak_stairs[facing=east,half=bottom,shape=straight,waterlogged=false]'],
      [20, 0, 0, 'torch'],
    ]);
    const out = b.mesh();
    const torch = b.palette.indexOf('minecraft:torch' as BlockStateString);
    const stairs = b.palette.indexOf(
      'minecraft:oak_stairs[facing=east,half=bottom,shape=straight,waterlogged=false]' as BlockStateString,
    );
    expect(out.models.map((m) => m.paletteIndex)).toEqual([torch, stairs]);
    expect([...(out.models[0]?.positions ?? [])]).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...(out.models[1]?.positions ?? [])]).toEqual([7, 0, 7]);
    // Model blocks do not cull neighbour faces.
    expect(quads(out.opaque)).toBe(6);
    expect([...(b.mesh({ x: 1, y: 0, z: 0 }).models[0]?.positions ?? [])]).toEqual([20, 0, 0]);
  });

  it('renders unknown blocks with the missing texture', () => {
    const qs = quadList(build([[0, 0, 0, 'example:unknown_block']]).mesh().opaque);
    expect(qs).toHaveLength(6);
    for (const q of qs) expect(q.layer).toBe(layerOf('missing'));
  });

  it('is deterministic', () => {
    const blocks: Placement[] = [];
    const states = [
      'stone',
      'glass',
      'oak_planks',
      'torch',
      'ice',
      'furnace[facing=east,lit=false]',
    ];
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
    for (let i = 0; i < 2000; i++) {
      blocks.push([
        Math.floor(rnd() * 20) - 2,
        Math.floor(rnd() * 20) - 2,
        Math.floor(rnd() * 20) - 2,
        states[Math.floor(rnd() * states.length)] ?? 'stone',
      ]);
    }
    const a = build(blocks).mesh();
    const b = build(blocks).mesh();
    const flat = (o: ChunkMeshOutput): string =>
      JSON.stringify(
        [o.opaque, o.cutout, o.translucent, ...o.models].map((m) =>
          Object.values(m).map((v) => (ArrayBuffer.isView(v) ? Array.from(v as Float32Array) : v)),
        ),
      );
    expect(flat(b)).toBe(flat(a));
    expect(totalQuads(a)).toBeGreaterThan(0);
  });

  it('rejects inputs of the wrong size', () => {
    expect(() =>
      meshChunk({ coord: { x: 0, y: 0, z: 0 }, data: new Uint16Array(10) }, [], textures),
    ).toThrow(RangeError);
  });
});
