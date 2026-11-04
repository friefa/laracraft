import { registry, testModules } from '../../testing/helpers';
import { DEFAULT_DSL_LIMITS, type DslError } from '../types';
import { createModuleCatalogue, orientModuleBlocks } from './module-catalogue';
import { suggestBlockIds } from './block-args';
import { validateOperation, validateToolCall } from './validate-operation';

const region = { from: { x: 0, y: 0, z: 0 }, to: { x: 3, y: 3, z: 3 } };
const pos = { x: 0, y: 0, z: 0 };

function errorsOf(input: unknown, limits = DEFAULT_DSL_LIMITS): DslError[] {
  const r = validateOperation(input, registry, limits, { modules: testModules });
  if (r.ok) throw new Error('expected errors');
  return [...r.errors];
}

describe('validateOperation: structure', () => {
  it('accepts a valid operation and returns a clean copy', () => {
    const input = { op: 'fill', region, block: 'stone' };
    const r = validateOperation(input, registry);
    expect(r).toEqual({ ok: true, operation: input });
    if (r.ok) expect(r.operation).not.toBe(input);
  });

  it.each([
    [null, ''],
    [[], ''],
    ['fill', ''],
    [{}, '/op'],
    [{ op: 'explode' }, '/op'],
    [{ op: 'fill', block: 'stone' }, ''],
    [{ op: 'fill', region, block: 'stone', color: 'red' }, '/color'],
    [{ op: 'fill', region: { ...region, to: { x: 1, y: 2 } }, block: 'stone' }, '/region/to'],
    [
      { op: 'fill', region: { ...region, to: { x: 1, y: 2, z: 0.5 } }, block: 'stone' },
      '/region/to/z',
    ],
    [
      { op: 'fill', region: { ...region, to: { x: 1, y: 2, z: '3' } }, block: 'stone' },
      '/region/to/z',
    ],
    [{ op: 'fill', region, block: 'Stone Bricks' }, '/block'],
    [{ op: 'fill', region, block: 'stone', onlyReplace: [] }, '/onlyReplace'],
    [{ op: 'rotate', region, turns: 4 }, '/turns'],
    [
      { op: 'roof', region, type: 'dome', pitch: 1, stairs: 'oak_stairs', block: 'oak_planks' },
      '/type',
    ],
    [
      { op: 'roof', region, type: 'gable', pitch: 3, stairs: 'oak_stairs', block: 'oak_planks' },
      '/pitch',
    ],
    [{ op: 'wall', from: pos, to: pos, height: 0, block: 'stone' }, '/height'],
    [{ op: 'copy', region, to: pos, repeat: 0 }, '/repeat'],
  ])('rejects %j at %s with a schema error', (input, path) => {
    const errors = errorsOf(input);
    expect(errors[0]?.code).toBe('schema');
    expect(errors.map((e) => e.path)).toContain(path);
  });

  it('lists the expected operations for an unknown op', () => {
    expect(errorsOf({ op: 'explode' })[0]?.message).toMatch(/expected one of fill, hollowBox/);
  });

  it('wall: to.y must equal from.y', () => {
    expect(
      errorsOf({ op: 'wall', from: pos, to: { x: 3, y: 2, z: 0 }, height: 2, block: 'stone' }),
    ).toEqual([expect.objectContaining({ code: 'schema', path: '/to/y' })]);
  });

  it('never throws on hostile input', () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('boom');
        },
        ownKeys() {
          throw new Error('boom');
        },
      },
    );
    expect(validateOperation(hostile, registry).ok).toBe(false);
    const deep: Record<string, unknown> = { op: 'fill' };
    let cur = deep;
    for (let i = 0; i < 200; i++) cur = (cur['region'] = {}) as Record<string, unknown>;
    expect(validateOperation(deep, registry).ok).toBe(false);
  });
});

describe('validateOperation: blocks', () => {
  it('unknown block lists close matches', () => {
    const [e] = errorsOf({ op: 'placeBlock', pos, block: 'minecraft:oak_plank' });
    expect(e).toMatchObject({ code: 'unknown-block', path: '/block' });
    expect(e?.message).toContain('minecraft:oak_planks');
    expect(suggestBlockIds(registry, 'minecraft:stone_brick')[0]).toBe('minecraft:stone_bricks');
    expect(suggestBlockIds(registry, 'minecraft:cobble')).toContain('minecraft:cobblestone');
  });

  it('invalid property / value lists the allowed ones', () => {
    const [a] = errorsOf({ op: 'placeBlock', pos, block: 'oak_stairs[facing=up]' });
    expect(a).toMatchObject({ code: 'invalid-state', path: '/block' });
    expect(a?.message).toContain('north, south, west, east');
    const [b] = errorsOf({ op: 'placeBlock', pos, block: 'oak_stairs[color=red]' });
    expect(b).toMatchObject({ code: 'invalid-state' });
    expect(b?.message).toMatch(/facing=.*half=.*shape=/);
  });

  it('checks masks, replace patterns and roof stairs', () => {
    expect(
      errorsOf({ op: 'fill', region, block: 'stone', onlyReplace: ['air', 'dirtt'] })[0],
    ).toMatchObject({
      code: 'unknown-block',
      path: '/onlyReplace/1',
    });
    expect(
      errorsOf({ op: 'replace', region, from: 'oak_stairs[half=middle]', to: 'stone' })[0],
    ).toMatchObject({
      code: 'invalid-state',
      path: '/from',
    });
    const [roof] = errorsOf({
      op: 'roof',
      region,
      type: 'gable',
      pitch: 1,
      stairs: 'oak_planks',
      block: 'oak_planks',
    });
    expect(roof).toMatchObject({ code: 'invalid-state', path: '/stairs' });
    expect(roof?.message).toContain('minecraft:oak_stairs');
  });

  it('rejects technical blocks for writing', () => {
    expect(errorsOf({ op: 'placeBlock', pos, block: 'moving_piston' })[0]?.code).toBe(
      'unknown-block',
    );
    expect(validateOperation({ op: 'placeBlock', pos, block: 'air' }, registry).ok).toBe(true);
  });
});

describe('validateOperation: limits', () => {
  const small = { ...DEFAULT_DSL_LIMITS, maxCellsPerOp: 100, maxAbsCoord: 50 };

  it('coordinates within ±maxAbsCoord', () => {
    expect(
      errorsOf({ op: 'placeBlock', pos: { x: 51, y: 0, z: -51 }, block: 'stone' }, small),
    ).toEqual([
      expect.objectContaining({ code: 'limit', path: '/pos/x' }),
      expect.objectContaining({ code: 'limit', path: '/pos/z' }),
    ]);
  });

  it('cells per operation', () => {
    expect(
      errorsOf(
        { op: 'fill', region: { from: pos, to: { x: 4, y: 4, z: 4 } }, block: 'stone' },
        small,
      )[0],
    ).toMatchObject({
      code: 'limit',
    });
    expect(
      validateOperation(
        { op: 'fill', region: { from: pos, to: { x: 4, y: 3, z: 4 } }, block: 'stone' },
        registry,
        small,
      ).ok,
    ).toBe(true);
    expect(errorsOf({ op: 'copy', region, to: pos, repeat: 2 }, small)[0]?.code).toBe('limit');
    expect(
      errorsOf(
        { op: 'wall', from: pos, to: { x: 20, y: 0, z: 0 }, height: 5, block: 'stone' },
        small,
      )[0]?.code,
    ).toBe('limit');
  });

  it('derived extents (roof height, copies, wall top) stay in range', () => {
    expect(
      errorsOf(
        {
          op: 'roof',
          region: { from: { x: 0, y: 45, z: 0 }, to: { x: 4, y: 45, z: 4 } },
          type: 'shed',
          pitch: 2,
          stairs: 'oak_stairs',
          block: 'oak_planks',
        },
        small,
      )[0]?.code,
    ).toBe('limit');
    expect(
      errorsOf(
        { op: 'copy', region: { from: pos, to: pos }, to: { x: 40, y: 0, z: 0 }, repeat: 20 },
        small,
      )[0]?.code,
    ).toBe('limit');
    expect(
      errorsOf(
        {
          op: 'wall',
          from: { x: 0, y: 48, z: 0 },
          to: { x: 0, y: 48, z: 0 },
          height: 5,
          block: 'stone',
        },
        small,
      )[0],
    ).toMatchObject({
      code: 'limit',
      path: '/height',
    });
  });

  it('huge regions are rejected quickly without iterating', () => {
    const t = Date.now();
    const big = { from: { x: -4096, y: -4096, z: -4096 }, to: { x: 4096, y: 4096, z: 4096 } };
    expect(
      errorsOf({
        op: 'roof',
        region: big,
        type: 'hip',
        pitch: 2,
        stairs: 'oak_stairs',
        block: 'stone',
      })[0]?.code,
    ).toBe('limit');
    expect(errorsOf({ op: 'rotate', region: big, turns: 1 })[0]?.code).toBe('limit');
    expect(Date.now() - t).toBeLessThan(500);
  });
});

describe('validateOperation: modules', () => {
  const op = { op: 'insertModule', moduleId: 'piston_door_2x2', pos, facing: 'north' };

  it('accepts a known module', () => {
    expect(validateOperation(op, registry, undefined, { modules: testModules }).ok).toBe(true);
  });

  it('unknown module suggests available ones; no catalogue is an error too', () => {
    const [e] = errorsOf({ ...op, moduleId: 'piston_door' });
    expect(e).toMatchObject({ code: 'unknown-module', path: '/moduleId' });
    expect(e?.message).toContain('piston_door_2x2');
    const r = validateOperation(op, registry);
    expect(!r.ok && r.errors[0]?.code).toBe('unknown-module');
  });

  it('module params, failing builds and invalid module output', () => {
    expect(errorsOf({ ...op, params: { color: 'red' } })[0]).toMatchObject({
      code: 'module-params',
      path: '/params',
    });
    expect(errorsOf({ ...op, moduleId: 'throws' })[0]?.message).toBe('size must be even');
    expect(errorsOf({ ...op, moduleId: 'broken' })[0]).toMatchObject({ code: 'module-params' });
  });

  it('orientModuleBlocks rotates offsets and states clockwise from north', () => {
    const blocks = [{ offset: { x: 1, y: 0, z: -2 }, state: 'repeater[facing=north]' }];
    expect(orientModuleBlocks(registry, blocks, 'south')).toEqual([
      { offset: { x: -1, y: 0, z: 2 }, state: expect.stringContaining('facing=south') },
    ]);
    const catalogue = createModuleCatalogue([]);
    expect(catalogue.get('x')).toBeUndefined();
  });
});

describe('validateToolCall', () => {
  it('validates against the tool input shape (no op field, params as list)', () => {
    const ok = validateToolCall(
      'insert_module',
      {
        moduleId: 'piston_door_2x2',
        pos,
        facing: 'east',
        params: [{ name: 'sticky', value: true }],
      },
      registry,
      undefined,
      { modules: testModules },
    );
    expect(ok).toMatchObject({
      ok: true,
      operation: { op: 'insertModule', params: { sticky: true } },
    });
    const withOp = validateToolCall('fill', { op: 'fill', region, block: 'stone' }, registry);
    expect(!withOp.ok && withOp.errors[0]).toMatchObject({ code: 'schema', path: '/op' });
  });

  it('unknown tool, duplicate params and param errors map to list paths', () => {
    expect(validateToolCall('explode', {}, registry)).toMatchObject({
      ok: false,
      errors: [{ code: 'schema' }],
    });
    const dup = validateToolCall(
      'insert_module',
      {
        moduleId: 'piston_door_2x2',
        pos,
        facing: 'east',
        params: [
          { name: 'a', value: 1 },
          { name: 'a', value: 2 },
        ],
      },
      registry,
      undefined,
      { modules: testModules },
    );
    expect(!dup.ok && dup.errors[0]?.path).toBe('/params/1/name');
  });
});
