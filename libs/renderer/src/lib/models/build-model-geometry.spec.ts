import {
  collectTextureNames,
  createBlockRegistry,
  createJavaBlockRegistry,
  defaultState,
  stringifyBlockState,
  type BlockDefinition,
} from '@laracraft/core-model';
import { describe, expect, it } from 'vitest';
import type { ModelGeometry, TextureLayers } from '../mesh/types';
import { buildModelGeometry, isModelSupported, SUPPORTED_MODEL_IDS } from './build-model-geometry';
import { hexToRgb, redstoneTint, TINT_WATER } from './tint';

const registry = createJavaBlockRegistry();
const textureNames = ['missing', ...collectTextureNames(registry)];
const textures: TextureLayers = Object.fromEntries(textureNames.map((n, i) => [n, i]));
const modelBlocks = registry.all().filter((d) => d.render.shape === 'model');

const geo = (state: string, tex: TextureLayers = textures): ModelGeometry =>
  buildModelGeometry(registry, state, tex);

/** All property combinations of a block (capped; `waterlogged` fixed to false). */
function allStates(def: BlockDefinition, cap = 4000): string[] {
  let combos: Record<string, string>[] = [{}];
  for (const [key, prop] of Object.entries(def.properties)) {
    const values = key === 'waterlogged' ? ['false'] : prop.values;
    combos = combos.flatMap((c) => values.map((v) => ({ ...c, [key]: v })));
    if (combos.length > cap) throw new Error(`${def.id}: too many states`);
  }
  return combos.map((properties) => stringifyBlockState({ id: def.id, properties }));
}

interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

function bounds(g: ModelGeometry): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < g.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = g.positions[i + k] as number;
      min[k] = Math.min(min[k] as number, v);
      max[k] = Math.max(max[k] as number, v);
    }
  }
  return { min, max };
}

function expectValid(state: string, g: ModelGeometry): void {
  const v = g.positions.length / 3;
  const ctx = `state ${state}`;
  expect(v, ctx).toBeGreaterThan(0);
  expect(Number.isInteger(v), ctx).toBe(true);
  expect(g.normals.length, ctx).toBe(v * 3);
  expect(g.colors.length, ctx).toBe(v * 3);
  expect(g.uvs.length, ctx).toBe(v * 2);
  expect(g.layers.length, ctx).toBe(v);
  expect(g.indices.length % 3, ctx).toBe(0);
  expect(g.indices.length, ctx).toBeGreaterThan(0);
  for (const i of g.indices) expect(i < v, ctx).toBe(true);
  for (const p of g.positions) {
    if (!(p >= -1e-6 && p <= 1 + 1e-6)) expect.fail(`${ctx}: position ${p} outside [0,1]`);
  }
  for (let i = 0; i < g.normals.length; i += 3) {
    const len = Math.hypot(
      g.normals[i] as number,
      g.normals[i + 1] as number,
      g.normals[i + 2] as number,
    );
    if (Math.abs(len - 1) > 1e-5) expect.fail(`${ctx}: normal length ${len}`);
  }
  // Triangles are counter-clockwise seen from the side the normal points to.
  for (let t = 0; t < g.indices.length; t += 3) {
    const [a, b, c] = [g.indices[t], g.indices[t + 1], g.indices[t + 2]] as number[];
    const P = (i: number, k: number) => g.positions[(i as number) * 3 + k] as number;
    const e1 = [0, 1, 2].map((k) => P(b as number, k) - P(a as number, k));
    const e2 = [0, 1, 2].map((k) => P(c as number, k) - P(a as number, k));
    const [x1, y1, z1] = e1 as [number, number, number];
    const [x2, y2, z2] = e2 as [number, number, number];
    const cross = [y1 * z2 - z1 * y2, z1 * x2 - x1 * z2, x1 * y2 - y1 * x2];
    const n = [0, 1, 2].map((k) => g.normals[(a as number) * 3 + k] as number);
    const dot = cross.reduce((acc, v, k) => acc + v * (n[k] as number), 0);
    if (!(dot > 0)) expect.fail(`${ctx}: triangle ${t / 3} winding/normal mismatch (${dot})`);
  }
  for (const c of g.colors) if (!(c >= 0 && c <= 1)) expect.fail(`${ctx}: colour ${c}`);
  for (const u of g.uvs) if (!(u >= -1e-6 && u <= 1 + 1e-6)) expect.fail(`${ctx}: uv ${u}`);
  for (const l of g.layers) {
    if (!Number.isInteger(l) || l < 0 || l >= textureNames.length)
      expect.fail(`${ctx}: layer ${l}`);
  }
}

/** Sorted vertex keys (position + normal), rounded, for comparing geometry as a set. */
function vertexSet(g: ModelGeometry, rotateCw = 0): string[] {
  const keys: string[] = [];
  for (let i = 0; i < g.positions.length; i += 3) {
    const y = g.positions[i + 1] as number;
    const ny = g.normals[i + 1] as number;
    let [x, z] = [g.positions[i], g.positions[i + 2]] as number[];
    let [nx, nz] = [g.normals[i], g.normals[i + 2]] as number[];
    for (let r = 0; r < rotateCw; r += 90) {
      [x, z] = [1 - (z as number), x as number];
      [nx, nz] = [-(nz as number), nx as number];
    }
    keys.push(
      [x, y, z, nx, ny, nz]
        .map((n) => (Math.round((n as number) * 1e4) / 1e4 || 0).toFixed(4))
        .join(','),
    );
  }
  return keys.sort();
}

const s = (id: string, props: Record<string, string>) =>
  stringifyBlockState({ id: `minecraft:${id}`, properties: props });

describe('buildModelGeometry – coverage', () => {
  it('has a builder for every modelId used in the registry', () => {
    const used = new Set(modelBlocks.map((d) => d.render.modelId));
    const unhandled = [...used].filter((id) => !isModelSupported(id));
    expect(unhandled).toEqual([]);
    expect(SUPPORTED_MODEL_IDS.length).toBeGreaterThanOrEqual(used.size);
  });

  it.each(modelBlocks.map((d) => [d.id, d] as const))(
    '%s: every state yields valid geometry inside the unit block',
    (_id, def) => {
      for (const state of [defaultState(def), ...allStates(def)]) expectValid(state, geo(state));
    },
  );

  it('falls back to a missing-textured cube for unknown blocks', () => {
    const g = geo('minecraft:does_not_exist');
    expectValid('unknown', g);
    expect(new Set(g.layers)).toEqual(new Set([textures['missing']]));
    expect(bounds(g)).toEqual({ min: [0, 0, 0], max: [1, 1, 1] });
  });

  it('maps texture names to layers and unknown names to missing', () => {
    const g = geo(s('oak_stairs', {}));
    expect(new Set(g.layers)).toEqual(new Set([textures['oak_planks']]));
    const withoutChest: TextureLayers = Object.fromEntries(
      Object.entries(textures).filter(([name]) => name !== 'chest'),
    );
    const chestLayers = new Set(geo('minecraft:chest', withoutChest).layers);
    expect(chestLayers).toEqual(new Set([textures['missing']]));
  });
});

describe('buildModelGeometry – caching and determinism', () => {
  it('returns the cached instance for the same inputs', () => {
    expect(geo('minecraft:oak_fence[east=true]')).toBe(geo('minecraft:oak_fence[east=true]'));
  });

  it('is deterministic across caches', () => {
    const copy: TextureLayers = { ...textures };
    for (const state of [
      'minecraft:repeater[delay=3,facing=west]',
      'minecraft:rail[shape=south_west]',
    ]) {
      const a = geo(state);
      const b = geo(state, copy);
      expect(b).not.toBe(a);
      expect(Array.from(b.positions)).toEqual(Array.from(a.positions));
      expect(Array.from(b.uvs)).toEqual(Array.from(a.uvs));
      expect(Array.from(b.colors)).toEqual(Array.from(a.colors));
      expect(Array.from(b.indices)).toEqual(Array.from(a.indices));
    }
  });
});

describe('buildModelGeometry – shapes and orientation', () => {
  const stair = (facing: string, shape = 'straight', half = 'bottom') =>
    geo(s('stone_stairs', { facing, half, shape, waterlogged: 'false' }));

  it('rotates stairs with facing (east = north turned 90° clockwise)', () => {
    for (const shape of ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right']) {
      expect(vertexSet(stair('north', shape), 90), shape).toEqual(vertexSet(stair('east', shape)));
      expect(vertexSet(stair('east', shape), 90), shape).toEqual(vertexSet(stair('south', shape)));
      expect(vertexSet(stair('south', shape), 90), shape).toEqual(vertexSet(stair('west', shape)));
    }
  });

  it('puts the stair step on the facing side', () => {
    const g = stair('east');
    // Every vertex above the slab lies in the east half.
    for (let i = 0; i < g.positions.length; i += 3) {
      if ((g.positions[i + 1] as number) > 0.5) expect(g.positions[i]).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('mirrors left/right corner shapes', () => {
    // outer_left facing east = outer_right facing north (both: step quadrant north-east).
    expect(vertexSet(stair('east', 'outer_left'))).toEqual(
      vertexSet(stair('north', 'outer_right')),
    );
    expect(vertexSet(stair('east', 'inner_left'))).toEqual(
      vertexSet(stair('north', 'inner_right')),
    );
  });

  it('flips top stairs vertically', () => {
    const g = stair('north', 'straight', 'top');
    const flipped = vertexSet(stair('north'))
      .map((k) => {
        const [x, y, z, nx, ny, nz] = k.split(',').map(Number) as number[];
        return [x, 1 - (y as number), z, nx, -(ny as number), nz]
          .map((n) => ((n as number) || 0).toFixed(4))
          .join(',');
      })
      .sort();
    expect(vertexSet(g)).toEqual(flipped);
  });

  it('builds slab bounding boxes per type', () => {
    const slab = (type: string) => bounds(geo(s('oak_slab', { type, waterlogged: 'false' })));
    expect(slab('bottom')).toEqual({ min: [0, 0, 0], max: [1, 0.5, 1] });
    expect(slab('top')).toEqual({ min: [0, 0.5, 0], max: [1, 1, 1] });
    expect(slab('double')).toEqual({ min: [0, 0, 0], max: [1, 1, 1] });
  });

  it('uses top/bottom/side textures on slabs', () => {
    const g = geo(s('sandstone_slab', { type: 'bottom' }));
    const top = new Set<number>();
    for (let i = 0; i < g.normals.length / 3; i++) {
      if (g.normals[i * 3 + 1] === 1) top.add(g.layers[i] as number);
    }
    expect(top).toEqual(new Set([textures['sandstone_top']]));
  });

  it('places doors by facing, hinge and open state', () => {
    const door = (p: Record<string, string>) =>
      bounds(
        geo(s('oak_door', { facing: 'east', half: 'lower', hinge: 'left', open: 'false', ...p })),
      );
    const t = 3 / 16;
    expect(door({})).toEqual({ min: [0, 0, 0], max: [t, 1, 1] });
    expect(door({ hinge: 'right' })).toEqual({ min: [0, 0, 0], max: [t, 1, 1] });
    expect(door({ open: 'true' })).toEqual({ min: [0, 0, 0], max: [1, 1, t] });
    expect(door({ open: 'true', hinge: 'right' })).toEqual({ min: [0, 0, 1 - t], max: [1, 1, 1] });
    expect(door({ facing: 'north' })).toEqual({ min: [0, 0, 1 - t], max: [1, 1, 1] });
    expect(door({ facing: 'south' })).toEqual({ min: [0, 0, 0], max: [1, 1, t] });
    // Hinge mirrors the texture of the closed door.
    const left = geo(s('oak_door', { hinge: 'left' }));
    const right = geo(s('oak_door', { hinge: 'right' }));
    expect(Array.from(right.positions)).toEqual(Array.from(left.positions));
    expect(Array.from(right.uvs)).not.toEqual(Array.from(left.uvs));
    // Upper half uses the top texture.
    expect(new Set(geo(s('oak_door', { half: 'upper' })).layers)).toEqual(
      new Set([textures['oak_door_top']]),
    );
  });

  it('places trapdoors', () => {
    const td = (p: Record<string, string>) =>
      bounds(geo(s('oak_trapdoor', { facing: 'north', ...p })));
    const t = 3 / 16;
    expect(td({ half: 'bottom' })).toEqual({ min: [0, 0, 0], max: [1, t, 1] });
    expect(td({ half: 'top' })).toEqual({ min: [0, 1 - t, 0], max: [1, 1, 1] });
    expect(td({ open: 'true' })).toEqual({ min: [0, 0, 1 - t], max: [1, 1, 1] });
    expect(td({ open: 'true', facing: 'east' })).toEqual({ min: [0, 0, 0], max: [t, 1, 1] });
  });

  it('connects fences, panes and walls per side', () => {
    const fenceN = geo(s('oak_fence', { north: 'true' }));
    const fenceE = geo(s('oak_fence', { east: 'true' }));
    expect(vertexSet(fenceN, 90)).toEqual(vertexSet(fenceE));
    expect(bounds(fenceN).min[2]).toBe(0);
    expect(bounds(geo(s('oak_fence', {}))).min[2]).toBe(6 / 16);
    const paneW = bounds(geo(s('glass_pane', { west: 'true' })));
    expect(paneW.min[0]).toBe(0);
    expect(paneW.max[0]).toBe(9 / 16);
    const lowWall = bounds(geo(s('cobblestone_wall', { north: 'low', south: 'low', up: 'false' })));
    expect(lowWall).toEqual({ min: [5 / 16, 0, 0], max: [11 / 16, 14 / 16, 1] });
    const tall = bounds(geo(s('cobblestone_wall', { east: 'tall', up: 'false' })));
    expect(tall.max).toEqual([1, 1, 11 / 16]);
  });

  it('opens fence gates and rotates them', () => {
    const closed = bounds(geo(s('oak_fence_gate', { facing: 'south' })));
    expect(closed.min[2]).toBe(7 / 16);
    expect(closed.max[2]).toBe(9 / 16);
    const open = bounds(geo(s('oak_fence_gate', { facing: 'south', open: 'true' })));
    expect(open.max[2]).toBe(15 / 16);
    const g = (facing: string) => geo(s('oak_fence_gate', { facing, open: 'true' }));
    expect(vertexSet(g('south'), 90)).toEqual(vertexSet(g('west')));
    expect(bounds(geo(s('oak_fence_gate', { in_wall: 'true' }))).max[1]).toBe(13 / 16);
  });

  it('tilts wall torches away from the wall', () => {
    const g = geo(s('wall_torch', { facing: 'north' }));
    const b = bounds(g);
    // Attached to the block south of it; leans north.
    expect(b.max[2]).toBe(1);
    expect(b.min[2]).toBeLessThan(0.8);
    expect(b.min[1]).toBeGreaterThan(0.1);
    const standing = bounds(geo('minecraft:torch'));
    expect(standing).toEqual({ min: [7 / 16, 0, 7 / 16], max: [9 / 16, 10 / 16, 9 / 16] });
  });

  it('hangs lanterns', () => {
    expect(bounds(geo(s('lantern', { hanging: 'true' }))).max[1]).toBe(1);
    expect(bounds(geo(s('lantern', { hanging: 'false' }))).max[1]).toBeLessThan(1);
    expect(bounds(geo(s('lantern', { hanging: 'true' }))).min[1]).toBe(1 / 16);
  });

  it('attaches buttons and levers to floor, wall and ceiling', () => {
    const btn = (p: Record<string, string>) => bounds(geo(s('stone_button', p)));
    expect(btn({ face: 'floor', facing: 'north' })).toEqual({
      min: [5 / 16, 0, 6 / 16],
      max: [11 / 16, 2 / 16, 10 / 16],
    });
    expect(btn({ face: 'wall', facing: 'north' })).toEqual({
      min: [5 / 16, 6 / 16, 14 / 16],
      max: [11 / 16, 10 / 16, 1],
    });
    expect(btn({ face: 'wall', facing: 'east' })).toEqual({
      min: [0, 6 / 16, 5 / 16],
      max: [2 / 16, 10 / 16, 11 / 16],
    });
    expect(btn({ face: 'ceiling', facing: 'north', powered: 'true' }).min[1]).toBe(15 / 16);
    const lever = (p: Record<string, string>) => geo(s('lever', p));
    const off = bounds(lever({ face: 'wall', facing: 'north', powered: 'false' }));
    const on = bounds(lever({ face: 'wall', facing: 'north', powered: 'true' }));
    expect(off.max[1]).toBeGreaterThan(0.9); // handle up
    expect(on.min[1]).toBeLessThan(0.1); // handle down
    expect(off.max[2]).toBe(1);
  });

  it('builds rails for every shape', () => {
    const rail = (shape: string) => geo(s('rail', { shape }));
    expect(bounds(rail('north_south'))).toEqual({ min: [0, 1 / 16, 0], max: [1, 1 / 16, 1] });
    expect(vertexSet(rail('north_south'), 90)).toEqual(vertexSet(rail('east_west')));
    const asc = bounds(rail('ascending_north'));
    expect(asc).toEqual({ min: [0, 1 / 16, 0], max: [1, 1, 1] });
    expect(vertexSet(rail('ascending_north'), 90)).toEqual(vertexSet(rail('ascending_east')));
    expect(vertexSet(rail('south_east'), 90)).toEqual(vertexSet(rail('south_west')));
    // Ascending north: the north edge (z = 0) is the high one.
    const g = rail('ascending_north');
    for (let i = 0; i < g.positions.length; i += 3) {
      if (g.positions[i + 2] === 0) expect(g.positions[i + 1]).toBe(1);
    }
  });

  it('draws redstone wire connections and tints by power', () => {
    const wire = (p: Record<string, string>) => geo(s('redstone_wire', p));
    const dot = bounds(wire({}));
    expect(dot.max[1]).toBeLessThan(0.05);
    const up = bounds(wire({ north: 'up' }));
    expect(up.max[1]).toBe(1);
    const corner = bounds(wire({ north: 'side', east: 'side' }));
    expect([corner.min[0], corner.min[2], corner.max[0], corner.max[2]]).toEqual([0, 0, 1, 1]);
    // A single connection draws a straight line through the block.
    const single = bounds(wire({ west: 'side' }));
    expect([single.min[0], single.max[0]]).toEqual([0, 1]);
    expect(single.min[2]).toBeGreaterThan(0.3);
    const top = (g: ModelGeometry) => [g.colors[0], g.colors[1], g.colors[2]];
    const dark = redstoneTint(0);
    const bright = redstoneTint(15);
    expect(top(wire({ power: '0' }))[0]).toBeCloseTo(dark[0], 5);
    expect(top(wire({ power: '15' }))[0]).toBeCloseTo(bright[0], 5);
    expect(top(wire({ power: '15' }))[1]).toBeCloseTo(bright[1], 5);
  });

  it('rotates repeaters and comparators and moves the delay torch', () => {
    const rep = (p: Record<string, string>) => geo(s('repeater', p));
    expect(vertexSet(rep({ facing: 'south' }), 90)).toEqual(vertexSet(rep({ facing: 'west' })));
    expect(vertexSet(rep({ delay: '1' }))).not.toEqual(vertexSet(rep({ delay: '4' })));
    expect(bounds(rep({})).max[1]).toBe(7 / 16);
    const cmp = (facing: string) => geo(s('comparator', { facing }));
    expect(vertexSet(cmp('north'), 90)).toEqual(vertexSet(cmp('east')));
  });

  it('orients pistons in six directions', () => {
    const p = (facing: string, extended: string) => bounds(geo(s('piston', { facing, extended })));
    expect(p('north', 'false')).toEqual({ min: [0, 0, 0], max: [1, 1, 1] });
    expect(p('up', 'true')).toEqual({ min: [0, 0, 0], max: [1, 0.75, 1] });
    expect(p('down', 'true')).toEqual({ min: [0, 0.25, 0], max: [1, 1, 1] });
    expect(p('north', 'true')).toEqual({ min: [0, 0, 0.25], max: [1, 1, 1] });
    expect(p('east', 'true')).toEqual({ min: [0, 0, 0], max: [0.75, 1, 1] });
    const head = (facing: string) => bounds(geo(s('piston_head', { facing })));
    expect(head('up').min[1]).toBe(0);
    expect(head('north')).toEqual({ min: [0, 0, 0], max: [1, 1, 1] });
    // The piston front faces `facing`: front texture on the north face for facing=north.
    const g = geo(s('piston', { facing: 'north' }));
    for (let i = 0; i < g.normals.length / 3; i++) {
      if (g.normals[i * 3 + 2] === -1) expect(g.layers[i]).toBe(textures['piston_top']);
      if (g.normals[i * 3 + 2] === 1) expect(g.layers[i]).toBe(textures['piston_bottom']);
    }
  });

  it('points the hopper spout', () => {
    expect(bounds(geo(s('hopper', { facing: 'down' }))).min[1]).toBe(0);
    expect(bounds(geo(s('hopper', { facing: 'north' }))).min[1]).toBe(4 / 16);
    expect(bounds(geo(s('hopper', { facing: 'north' }))).min[2]).toBe(0);
  });

  it('lowers flowing fluids and tints water', () => {
    expect(bounds(geo(s('water', { level: '0' }))).max[1]).toBe(14 / 16);
    expect(bounds(geo(s('water', { level: '7' }))).max[1]).toBeLessThan(0.2);
    const g = geo(s('water', {}));
    const water = hexToRgb(TINT_WATER);
    const i = Array.from({ length: g.normals.length / 3 }).findIndex(
      (_, k) => g.normals[k * 3 + 1] === 1,
    );
    expect(g.colors[i * 3]).toBeCloseTo(water[0], 5);
    expect(g.colors[i * 3 + 2]).toBeCloseTo(water[2], 5);
    const lava = geo(s('lava', {}));
    expect(Math.max(...lava.colors)).toBe(1);
  });

  it('bakes face shading into colours', () => {
    const g = geo('minecraft:chest');
    const shadeOf = new Map<string, number>();
    for (let i = 0; i < g.normals.length / 3; i++) {
      const n = [g.normals[i * 3], g.normals[i * 3 + 1], g.normals[i * 3 + 2]].join(',');
      shadeOf.set(n, g.colors[i * 3] as number);
    }
    expect(shadeOf.get('0,1,0')).toBeCloseTo(1);
    expect(shadeOf.get('0,-1,0')).toBeCloseTo(0.5);
    expect(shadeOf.get('0,0,-1')).toBeCloseTo(0.8);
    expect(shadeOf.get('1,0,0')).toBeCloseTo(0.6);
  });

  it('extends double chests towards the other half', () => {
    expect(bounds(geo(s('chest', { facing: 'north', type: 'left' }))).max[0]).toBe(1);
    expect(bounds(geo(s('chest', { facing: 'north', type: 'right' }))).min[0]).toBe(0);
    expect(bounds(geo(s('chest', { facing: 'east', type: 'left' }))).max[2]).toBe(1);
  });
});

describe('buildModelGeometry – models not (yet) used by the registry', () => {
  it('builds cross plants', () => {
    const plants = createBlockRegistry('test', [
      {
        id: 'minecraft:poppy',
        nameKey: 'block.poppy',
        category: 'natural',
        properties: {},
        render: { shape: 'model', layer: 'cutout', modelId: 'cross', textures: { all: 'poppy' } },
        solid: false,
        physics: { support: { kind: 'below' } },
      },
    ]);
    const g = buildModelGeometry(plants, 'minecraft:poppy', textures);
    expectValid('poppy', g);
    expect(g.indices.length).toBe(4 * 6);
  });
});
