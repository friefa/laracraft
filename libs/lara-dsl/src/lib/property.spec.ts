import { AIR, type BuildDocument, resolveBlockState } from '@laracraft/core-model';
import fc from 'fast-check';
import { key, newDoc, registry, resultCells, testModules } from '../testing/helpers';
import { boxContains, regionBox } from './geometry';
import { applyOperations } from './interpreter/interpreter';
import { validateJsonSchema } from './schema/json-schema';
import { OPERATION_SCHEMA } from './schema/operation-schema';
import { LARA_TOOLS, operationToToolInput } from './schema/tools';
import { DEFAULT_DSL_LIMITS, type DslLimits, type Operation, type Pos, type Region } from './types';
import { validateOperation, validateToolCall } from './validate/validate-operation';

/**
 * Property-based tests over random valid and invalid operations.
 * Coordinates stay small so that random operations overlap a lot.
 */

const NUM_RUNS = 150;

const BLOCKS = [
  'stone',
  'oak_planks',
  'glass',
  'air',
  'oak_stairs',
  'stone_brick_stairs',
  'oak_log',
  'oak_slab',
  'oak_fence',
  'oak_door',
  'oak_trapdoor',
  'furnace',
  'chest',
  'ladder',
  'wall_torch',
  'lever',
  'stone_button',
  'repeater',
  'comparator',
  'observer',
  'piston',
  'hopper',
  'redstone_wire',
  'rail',
  'powered_rail',
  'glass_pane',
  'cobblestone_wall',
  'lantern',
  'water',
] as const;

const coord = fc.integer({ min: -6, max: 6 });
const pos: fc.Arbitrary<Pos> = fc.record({ x: coord, y: coord, z: coord });
const region: fc.Arbitrary<Region> = fc.record({ from: pos, to: pos });

/** A blockstate string with a random subset of valid properties written. */
const block: fc.Arbitrary<string> = fc.constantFrom(...BLOCKS).chain((id) => {
  const def = registry.get(`minecraft:${id}`);
  if (!def) throw new Error(`missing ${id}`);
  const props = Object.entries(def.properties).map(([k, p]) =>
    fc.option(
      fc.constantFrom(...p.values).map((v) => `${k}=${v}`),
      { nil: undefined },
    ),
  );
  return fc.tuple(fc.boolean(), ...props).map(([ns, ...ps]) => {
    const written = ps.filter((p): p is string => p !== undefined);
    return `${ns ? 'minecraft:' : ''}${id}${written.length ? `[${written.join(',')}]` : ''}`;
  });
});
const pattern = fc.constantFrom(
  'air',
  'stone',
  'minecraft:oak_stairs',
  'oak_stairs[half=top]',
  'glass',
);
const mask = fc.option(fc.array(pattern, { minLength: 1, maxLength: 3 }), { nil: undefined });
const opt = <T>(o: Record<string, T | undefined>): Record<string, T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Record<string, T>;

const operation: fc.Arbitrary<Operation> = fc.oneof(
  fc
    .record({ region, block, onlyReplace: mask })
    .map((o) => ({ op: 'fill', ...opt(o) }) as Operation),
  fc
    .record({
      region,
      block,
      keepInterior: fc.option(fc.boolean(), { nil: undefined }),
      onlyReplace: mask,
    })
    .map((o) => ({ op: 'hollowBox', ...opt(o) }) as Operation),
  fc
    .record({ from: pos, to: pos, block, onlyReplace: mask })
    .map((o) => ({ op: 'line', ...opt(o) }) as Operation),
  fc
    .record({
      from: pos,
      x: coord,
      z: coord,
      height: fc.integer({ min: 1, max: 6 }),
      block,
      onlyReplace: mask,
    })
    .map(
      ({ x, z, ...o }) =>
        ({ op: 'wall', ...opt({ ...o, to: { x, y: o.from.y, z } }) }) as Operation,
    ),
  fc
    .record({ region, y: coord, block, onlyReplace: mask })
    .map((o) => ({ op: 'floor', ...opt(o) }) as Operation),
  fc
    .record({
      region,
      type: fc.constantFrom('gable', 'hip', 'shed', 'flat'),
      pitch: fc.constantFrom(1, 2),
      stairs: fc.constantFrom(
        'oak_stairs',
        'minecraft:stone_brick_stairs[waterlogged=true]',
        'oak_stairs[facing=west,half=top]',
      ),
      block,
      ridgeAxis: fc.option(fc.constantFrom('x', 'z'), { nil: undefined }),
      overhang: fc.option(fc.integer({ min: 0, max: 2 }), { nil: undefined }),
    })
    .map((o) => ({ op: 'roof', ...opt(o) }) as Operation),
  fc.record({ pos, block }).map((o) => ({ op: 'placeBlock', ...o }) as Operation),
  fc
    .record({ region, from: pattern, to: block })
    .map((o) => ({ op: 'replace', ...o }) as Operation),
  fc.record({ region }).map((o) => ({ op: 'clear', ...o }) as Operation),
  fc
    .record({ region, axis: fc.constantFrom('x', 'z') })
    .map((o) => ({ op: 'mirror', ...o }) as Operation),
  fc
    .record({ region, turns: fc.constantFrom(1, 2, 3) })
    .map((o) => ({ op: 'rotate', ...o }) as Operation),
  fc
    .record({
      region,
      to: pos,
      repeat: fc.option(fc.integer({ min: 1, max: 4 }), { nil: undefined }),
      step: fc.option(fc.record({ x: coord, y: coord, z: coord }), { nil: undefined }),
    })
    .map((o) => ({ op: 'copy', ...opt(o) }) as Operation),
  fc
    .record({
      pos,
      facing: fc.constantFrom('north', 'east', 'south', 'west'),
      params: fc.option(fc.record({ sticky: fc.boolean() }), { nil: undefined }),
    })
    .map((o) => ({ op: 'insertModule', moduleId: 'piston_door_2x2', ...opt(o) }) as Operation),
);

const cell = fc.record({ pos, state: block });
const docArb: fc.Arbitrary<{ pos: Pos; state: string }[]> = fc.array(cell, { maxLength: 40 });

function makeDoc(cells: { pos: Pos; state: string }[]): BuildDocument {
  const doc = newDoc();
  for (const c of cells) {
    const r = resolveBlockState(registry, c.state);
    if (r.ok) doc.setBlock(c.pos, r.state);
  }
  return doc;
}

const ctx = { modules: testModules };
const LIMITS: DslLimits = { ...DEFAULT_DSL_LIMITS, maxCellsPerOp: 4000, maxCellsPerTurn: 6000 };

/** Cells an operation may touch, computed independently of the interpreter. */
function mayTouch(op: Operation): (p: Pos) => boolean {
  const box = (a: Pos, b: Pos) => regionBox({ from: a, to: b });
  switch (op.op) {
    case 'fill':
    case 'hollowBox':
    case 'replace':
    case 'clear':
    case 'mirror':
      return (p) => boxContains(regionBox(op.region), p);
    case 'floor': {
      const b = regionBox(op.region);
      return (p) =>
        p.y === op.y && boxContains({ min: { ...b.min, y: op.y }, max: { ...b.max, y: op.y } }, p);
    }
    case 'line':
      return (p) => boxContains(box(op.from, op.to), p);
    case 'wall': {
      const b = box(op.from, op.to);
      return (p) =>
        boxContains(
          { min: { ...b.min, y: op.from.y }, max: { ...b.max, y: op.from.y + op.height - 1 } },
          p,
        );
    }
    case 'roof': {
      const b = regionBox(op.region);
      const o = op.overhang ?? 0;
      return (p) =>
        p.y > b.max.y &&
        p.x >= b.min.x - o &&
        p.x <= b.max.x + o &&
        p.z >= b.min.z - o &&
        p.z <= b.max.z + o;
    }
    case 'placeBlock':
      return (p) => p.x === op.pos.x && p.y === op.pos.y && p.z === op.pos.z;
    case 'rotate': {
      const b = regionBox(op.region);
      const sx = b.max.x - b.min.x;
      const sz = b.max.z - b.min.z;
      const [nx, nz] = op.turns === 2 ? [sx, sz] : [sz, sx];
      const target = { min: b.min, max: { x: b.min.x + nx, y: b.max.y, z: b.min.z + nz } };
      return (p) => boxContains(b, p) || boxContains(target, p);
    }
    case 'copy': {
      const b = regionBox(op.region);
      const size = { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z };
      const step = op.step ?? { x: size.x + 1, y: 0, z: 0 };
      const boxes = Array.from({ length: op.repeat ?? 1 }, (_, i) => {
        const min = { x: op.to.x + i * step.x, y: op.to.y + i * step.y, z: op.to.z + i * step.z };
        return { min, max: { x: min.x + size.x, y: min.y + size.y, z: min.z + size.z } };
      });
      return (p) => boxes.some((bx) => boxContains(bx, p));
    }
    case 'insertModule':
      return (p) =>
        Math.abs(p.x - op.pos.x) <= 1 &&
        p.y - op.pos.y >= 0 &&
        p.y - op.pos.y <= 1 &&
        Math.abs(p.z - op.pos.z) <= 1;
  }
}

describe('property: random valid operations', () => {
  it('validate, match the JSON schema and the strict tool schema', () => {
    fc.assert(
      fc.property(operation, (op) => {
        const r = validateOperation(op, registry, LIMITS, ctx);
        if (!r.ok) {
          // Only size limits may reject a structurally valid random operation.
          expect(r.errors.every((e) => e.code === 'limit')).toBe(true);
        }
        expect(validateJsonSchema(OPERATION_SCHEMA, op)).toEqual([]);
        const { name, input } = operationToToolInput(op);
        const tool = LARA_TOOLS.find((t) => t.name === name);
        expect(validateJsonSchema(tool?.input_schema ?? {}, input)).toEqual([]);
        expect(validateToolCall(name, input, registry, LIMITS, ctx).ok).toBe(r.ok);
      }),
      { numRuns: NUM_RUNS * 2 },
    );
  });

  it('only write registry-valid canonical states and respect the limits', () => {
    fc.assert(
      fc.property(docArb, fc.array(operation, { minLength: 1, maxLength: 6 }), (cells, ops) => {
        const doc = makeDoc(cells);
        const r = applyOperations(doc, registry, ops, { limits: LIMITS, modules: testModules });
        if (r.errors.length) {
          expect(r.changeSet.changes).toEqual([]);
          for (const e of r.errors) for (const d of e.errors) expect(d.code).toBe('limit');
          return;
        }
        expect(r.changeSet.changes.length).toBeLessThanOrEqual(LIMITS.maxCellsPerTurn);
        expect(r.reports).toHaveLength(ops.length);
        const seen = new Set<string>();
        for (const c of r.changeSet.changes) {
          const res = resolveBlockState(registry, c.after);
          expect(res).toEqual({ ok: true, state: c.after });
          expect(c.before).toBe(doc.getBlock(c.pos.x, c.pos.y, c.pos.z));
          expect(c.before).not.toBe(c.after);
          expect(seen.has(key(c.pos))).toBe(false);
          seen.add(key(c.pos));
        }
        for (const rep of r.reports) expect(rep.changed).toBeLessThanOrEqual(LIMITS.maxCellsPerOp);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('never touch cells outside the declared region', () => {
    fc.assert(
      fc.property(docArb, operation, (cells, op) => {
        const r = applyOperations(makeDoc(cells), registry, [op], {
          limits: LIMITS,
          modules: testModules,
        });
        const inside = mayTouch(op);
        for (const c of r.changeSet.changes)
          expect(inside(c.pos), `${op.op} ${key(c.pos)}`).toBe(true);
      }),
      { numRuns: NUM_RUNS * 2 },
    );
  });

  it('are deterministic', () => {
    fc.assert(
      fc.property(docArb, fc.array(operation, { minLength: 1, maxLength: 4 }), (cells, ops) => {
        const a = applyOperations(makeDoc(cells), registry, ops, {
          limits: LIMITS,
          modules: testModules,
        });
        const b = applyOperations(makeDoc(cells), registry, ops, {
          limits: LIMITS,
          modules: testModules,
        });
        expect(a).toEqual(b);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('property: transforms', () => {
  /** Random content inside the region only, so in-place transforms can be undone exactly. */
  const regionWithContent = region.chain((rg) => {
    const b = regionBox(rg);
    const inner = fc.record({
      pos: fc.record({
        x: fc.integer({ min: b.min.x, max: b.max.x }),
        y: fc.integer({ min: b.min.y, max: b.max.y }),
        z: fc.integer({ min: b.min.z, max: b.max.z }),
      }),
      state: block,
    });
    return fc.tuple(fc.constant(rg), fc.array(inner, { maxLength: 30 }));
  });

  it('rotate × 4 = identity (and 1 + 3, 2 + 2)', () => {
    fc.assert(
      fc.property(
        regionWithContent,
        fc.constantFrom([1, 1, 1, 1], [1, 3], [3, 1], [2, 2]),
        ([rg, cells], turns) => {
          const doc = makeDoc(cells);
          const ops = turns.map((t) => ({ op: 'rotate', region: rg, turns: t }));
          // Odd turns swap the footprint; later rotations use the rotated box at the same corner.
          const b = regionBox(rg);
          const swapped: Region = {
            from: b.min,
            to: { x: b.min.x + (b.max.z - b.min.z), y: b.max.y, z: b.min.z + (b.max.x - b.min.x) },
          };
          let odd = false;
          const seq = ops.map((o) => {
            const r = { ...o, region: odd ? swapped : rg };
            if (o.turns % 2 === 1) odd = !odd;
            return r;
          });
          const r = applyOperations(doc, registry, seq, { modules: testModules });
          expect(r.errors).toEqual([]);
          expect(r.changeSet.changes).toEqual([]);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('mirror × 2 = identity on both axes', () => {
    fc.assert(
      fc.property(docArb, region, fc.constantFrom('x', 'z'), (cells, rg, axis) => {
        const doc = makeDoc(cells);
        const op = { op: 'mirror', region: rg, axis };
        const r = applyOperations(doc, registry, [op, op]);
        expect(r.errors).toEqual([]);
        expect(r.changeSet.changes).toEqual([]);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('a 180° rotation keeps the number of blocks and never writes air as a block', () => {
    fc.assert(
      fc.property(regionWithContent, ([rg, cells]) => {
        const doc = makeDoc(cells);
        const r = applyOperations(doc, registry, [{ op: 'rotate', region: rg, turns: 2 }]);
        const after = resultCells(doc, r.changeSet);
        let count = 0;
        doc.volume.forEachBlock(() => count++);
        expect(after.size).toBe(count); // a 180° turn keeps the number of blocks
        for (const v of after.values()) expect(v).not.toBe(AIR);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('property: invalid input', () => {
  const required: Record<string, string[]> = {
    fill: ['region', 'block'],
    hollowBox: ['region', 'block'],
    line: ['from', 'to', 'block'],
    wall: ['from', 'to', 'height', 'block'],
    floor: ['region', 'y', 'block'],
    roof: ['region', 'type', 'pitch', 'stairs', 'block'],
    placeBlock: ['pos', 'block'],
    replace: ['region', 'from', 'to'],
    clear: ['region'],
    mirror: ['region', 'axis'],
    rotate: ['region', 'turns'],
    copy: ['region', 'to'],
    insertModule: ['moduleId', 'pos', 'facing'],
  };

  it('arbitrary values never throw and are rejected unless they happen to be valid', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const r = validateOperation(input, registry, LIMITS, ctx);
        if (r.ok) expect(validateJsonSchema(OPERATION_SCHEMA, input)).toEqual([]);
        expect(() =>
          applyOperations(newDoc(), registry, [input], { limits: LIMITS }),
        ).not.toThrow();
      }),
      { numRuns: NUM_RUNS * 3 },
    );
  });

  it('random JSON objects with an op are rejected with errors, never thrown', () => {
    const json = fc.dictionary(fc.string(), fc.jsonValue(), { maxKeys: 6 });
    fc.assert(
      fc.property(fc.constantFrom(...Object.keys(required)), json, (op, rest) => {
        const r = validateOperation({ ...rest, op }, registry, LIMITS, ctx);
        if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: NUM_RUNS * 2 },
    );
  });

  it('mutated valid operations are rejected', () => {
    type Mutation = (op: Record<string, unknown>) => Record<string, unknown> | undefined;
    const mutations: fc.Arbitrary<Mutation> = fc.oneof(
      // Drop a required field.
      fc.nat().map((i): Mutation => (op) => {
        const req = required[op['op'] as string] as string[];
        const k = req[i % req.length] as string;
        const { [k]: _drop, ...rest } = op;
        void _drop;
        return rest;
      }),
      // Unknown extra field.
      fc.string({ minLength: 1 }).map(
        (k): Mutation =>
          (op) =>
            Object.hasOwn(op, k) ? undefined : { ...op, [k]: 1 },
      ),
      // Non-integer or out-of-range coordinate.
      fc.constantFrom(0.5, 1e9, Number.NaN, '3', null).map((v): Mutation => (op) => {
        const target =
          (op['region'] as Region | undefined)?.from ??
          (op['pos'] as Pos | undefined) ??
          (op['from'] as Pos | undefined);
        if (!target) return undefined;
        const clone = JSON.parse(JSON.stringify(op)) as Record<string, unknown>;
        const t = ((clone['region'] as Record<string, unknown> | undefined)?.['from'] ??
          clone['pos'] ??
          clone['from']) as Record<string, unknown>;
        t['x'] = v;
        return clone;
      }),
      // Unknown block.
      fc
        .constantFrom('minecraft:unobtainium', 'oak_stairs[facing=up]', 'stone[', '')
        .map((b): Mutation => (op) => {
          if (typeof op['block'] === 'string') return { ...op, block: b };
          if (typeof op['to'] === 'string') return { ...op, to: b };
          return undefined;
        }),
    );
    fc.assert(
      fc.property(operation, mutations, (op, mutate) => {
        const mutated = mutate(op as unknown as Record<string, unknown>);
        fc.pre(mutated !== undefined);
        const r = validateOperation(mutated, registry, LIMITS, ctx);
        expect(r.ok).toBe(false);
        const a = applyOperations(newDoc(), registry, [mutated], {
          limits: LIMITS,
          modules: testModules,
        });
        expect(a.changeSet.changes).toEqual([]);
        expect(a.errors).toHaveLength(1);
      }),
      { numRuns: NUM_RUNS * 2 },
    );
  });
});
