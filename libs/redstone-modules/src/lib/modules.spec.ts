import {
  DIRECTION_OFFSET,
  canonicalBlockState,
  createJavaBlockRegistry,
  resolveBlockState,
  rotateStateY,
  type BlockStateString,
} from '@laracraft/core-model';
import { MODULE_CATALOGUE, modulesForEdition } from './catalogue';
import { placeModule, resolveModuleParams } from './define';
import { OBSERVER_CLOCK_PERIOD_TICKS, repeaterClockPeriodTicks } from './modules/clocks';
import { T_FLIP_FLOP_MIN_PULSE_TICKS, pulseExtenderOutput } from './modules/logic';
import { hopperComparatorSignal, sorterFilterLoadout } from './modules/sorting';
import {
  ModuleParamsError,
  type BehaviourExpectation,
  type ModuleCatalogue,
  type ModuleCatalogueEntry,
  type ModuleFacing,
  type ModuleParams,
  type Pos,
  type RedstoneModule,
} from './types';

const registry = createJavaBlockRegistry();
const MODULES = MODULE_CATALOGUE.all();
const FACINGS: readonly ModuleFacing[] = ['north', 'east', 'south', 'west'];

const key = (p: Pos) => `${p.x},${p.y},${p.z}`;
const inBox = (p: Pos, size: Pos) =>
  p.x >= 0 && p.y >= 0 && p.z >= 0 && p.x < size.x && p.y < size.y && p.z < size.z;

/** North build in local box coordinates (offset + anchor). */
function localBlocks(m: RedstoneModule, params?: ModuleParams) {
  return m.build(params, 'north').map((b) => ({
    pos: { x: b.offset.x + m.anchor.x, y: b.offset.y + m.anchor.y, z: b.offset.z + m.anchor.z },
    state: b.state,
  }));
}

/** Independent rotation table: unit vectors of local +X and +Z after rotating to `facing`. */
const AXES: Readonly<Record<ModuleFacing, { x: Pos; z: Pos; turns: number }>> = {
  north: { x: { x: 1, y: 0, z: 0 }, z: { x: 0, y: 0, z: 1 }, turns: 0 },
  east: { x: { x: 0, y: 0, z: 1 }, z: { x: -1, y: 0, z: 0 }, turns: 1 },
  south: { x: { x: -1, y: 0, z: 0 }, z: { x: 0, y: 0, z: -1 }, turns: 2 },
  west: { x: { x: 0, y: 0, z: -1 }, z: { x: 1, y: 0, z: 0 }, turns: 3 },
};

/** Every parameter combination worth building: defaults plus each value of every param. */
function paramVariants(m: RedstoneModule): ModuleParams[] {
  const variants: ModuleParams[] = [{}];
  for (const [name, spec] of Object.entries(m.params ?? {})) {
    if (spec.type === 'string') for (const v of spec.enum) variants.push({ [name]: v });
    if (spec.type === 'boolean') variants.push({ [name]: true }, { [name]: false });
    if (spec.type === 'integer') {
      for (let v = spec.minimum; v <= spec.maximum; v++) variants.push({ [name]: v });
    }
  }
  return variants;
}

describe('MODULE_CATALOGUE', () => {
  it('has the first 10 modules with unique ids', () => {
    expect(MODULES).toHaveLength(10);
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(10);
    for (const m of MODULES) {
      expect(m.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(MODULE_CATALOGUE.get(m.id)).toBe(m);
    }
    expect(MODULE_CATALOGUE.get('nope')).toBeUndefined();
  });

  it('is structurally usable as the DSL catalogue shape', () => {
    // Mirrors the minimal interface of the Lara DSL interpreter (get → { id, size, build }).
    interface DslCatalogue {
      get(id: string):
        | {
            readonly id: string;
            readonly size: { readonly x: number; readonly y: number; readonly z: number };
            build(
              params: Readonly<Record<string, string | number | boolean>> | undefined,
              facing: 'north' | 'east' | 'south' | 'west',
            ): readonly { readonly offset: Pos; readonly state: string }[];
          }
        | undefined;
    }
    const dsl: DslCatalogue = MODULE_CATALOGUE;
    const generic: ModuleCatalogue<ModuleCatalogueEntry> = MODULE_CATALOGUE;
    expect(dsl.get('and_gate')?.build(undefined, 'east').length).toBeGreaterThan(0);
    expect(generic.all()).toHaveLength(10);
  });

  it('offers every module for Java and none untested for Bedrock', () => {
    expect(modulesForEdition('java')).toHaveLength(10);
    expect(modulesForEdition('bedrock')).toHaveLength(0);
  });
});

describe.each(MODULES.map((m) => [m.id, m] as const))('module %s', (_id, m) => {
  it('has metadata, i18n keys and edition data', () => {
    expect(m.nameKey).toBe(`redstoneModule.${m.id}.name`);
    expect(m.descriptionKey).toBe(`redstoneModule.${m.id}.description`);
    expect(['door', 'clock', 'logic', 'sorting', 'lighting', 'transport']).toContain(m.category);
    // 'tested' for Java = covered by this suite (structure + buildability).
    expect(m.editions.java).toBe('tested');
    expect(['tested', 'untested', 'incompatible']).toContain(m.editions.bedrock);
    if (m.editions.bedrock !== 'tested') expect(m.editionNotes?.bedrock).toBeTruthy();
    expect(m.references.length).toBeGreaterThan(0);
    expect(m.design.length).toBeGreaterThan(10);
    expect(inBox(m.anchor, m.size)).toBe(true);
    for (const spec of Object.values(m.params ?? {})) {
      expect(spec.descriptionKey).toMatch(new RegExp(`^redstoneModule\\.${m.id}\\.param\\.`));
    }
  });

  it.each(paramVariants(m).map((p) => [JSON.stringify(p), p] as const))(
    'params %s: every block resolves, is canonical and lies inside the box',
    (_label, params) => {
      const blocks = localBlocks(m, params);
      expect(blocks.length).toBeGreaterThan(0);
      const seen = new Set<string>();
      for (const b of blocks) {
        const resolved = resolveBlockState(registry, b.state);
        expect(resolved, b.state).toEqual({ ok: true, state: b.state });
        expect(b.state).not.toMatch(/^minecraft:air\b/);
        expect(inBox(b.pos, m.size), `${key(b.pos)} outside ${key(m.size)}`).toBe(true);
        expect(seen.has(key(b.pos)), `duplicate ${key(b.pos)}`).toBe(false);
        seen.add(key(b.pos));
      }
    },
  );

  it('uses the whole bounding box (tight size) with default params', () => {
    const blocks = localBlocks(m);
    for (const axis of ['x', 'y', 'z'] as const) {
      const values = blocks.map((b) => b.pos[axis]);
      expect(Math.min(...values)).toBe(0);
      expect(Math.max(...values)).toBe(m.size[axis] - 1);
    }
  });

  it('ports are unique, on an existing block at the box boundary', () => {
    const cells = new Map(localBlocks(m).map((b) => [key(b.pos), b.state]));
    expect(new Set(m.ports.map((p) => p.name)).size).toBe(m.ports.length);
    expect(m.ports.length).toBeGreaterThan(0);
    for (const port of m.ports) {
      expect(inBox(port.pos, m.size)).toBe(true);
      expect(cells.has(key(port.pos)), `port ${port.name} has no block`).toBe(true);
      const d = DIRECTION_OFFSET[port.side];
      const outside = { x: port.pos.x + d.x, y: port.pos.y + d.y, z: port.pos.z + d.z };
      // The connection side faces out of the module (outside the box or into free space).
      expect(!inBox(outside, m.size) || !cells.has(key(outside)), `port ${port.name}`).toBe(true);
    }
  });

  it.each(FACINGS)('build facing %s equals the north build rotated', (facing) => {
    const axes = AXES[facing];
    const expected = m.build(undefined, 'north').map((b) => ({
      offset: {
        x: b.offset.x * axes.x.x + b.offset.z * axes.z.x,
        y: b.offset.y,
        z: b.offset.x * axes.x.z + b.offset.z * axes.z.z,
      },
      state: rotateStateY(registry, b.state as BlockStateString, axes.turns),
    }));
    const actual = m.build(undefined, facing);
    const norm = (list: readonly { offset: Pos; state: string }[]) =>
      list.map((b) => `${key(b.offset)} ${canonicalBlockState(b.state)}`).sort();
    expect(norm(actual)).toEqual(norm(expected));
    // Offsets are relative to the anchor: the anchor cell maps to (0,0,0) in every facing.
    const placed = placeModule(m, { x: 100, y: 64, z: -7 }, facing);
    expect(placed).toHaveLength(actual.length);
    expect(placed[0]?.pos).toEqual({
      x: 100 + (actual[0]?.offset.x ?? NaN),
      y: 64 + (actual[0]?.offset.y ?? NaN),
      z: -7 + (actual[0]?.offset.z ?? NaN),
    });
  });

  it('rejects invalid parameters', () => {
    expect(() => m.build({ notAParam: 1 }, 'north')).toThrow(ModuleParamsError);
    for (const [name, spec] of Object.entries(m.params ?? {})) {
      if (spec.type === 'integer') {
        expect(() => m.build({ [name]: spec.minimum - 1 })).toThrow(ModuleParamsError);
        expect(() => m.build({ [name]: spec.maximum + 1 })).toThrow(ModuleParamsError);
        expect(() => m.build({ [name]: spec.minimum + 0.5 })).toThrow(ModuleParamsError);
        expect(() => m.build({ [name]: String(spec.default) })).toThrow(ModuleParamsError);
        expect(spec.default).toBeGreaterThanOrEqual(spec.minimum);
        expect(spec.default).toBeLessThanOrEqual(spec.maximum);
      } else if (spec.type === 'string') {
        expect(() => m.build({ [name]: 'not-an-option' })).toThrow(ModuleParamsError);
        expect(() => m.build({ [name]: 1 })).toThrow(ModuleParamsError);
        expect(spec.enum).toContain(spec.default);
      } else {
        expect(() => m.build({ [name]: 'yes' })).toThrow(ModuleParamsError);
      }
    }
  });

  it('has a consistent behaviour spec', () => {
    const spec = m.behaviour;
    expect(spec.status).toBe('specified');
    expect(spec.steps.length).toBeGreaterThan(0);
    if (spec.params) expect(resolveModuleParams(m.params, spec.params).ok).toBe(true);
    const ports = new Map(m.ports.map((p) => [p.name, p]));
    const isPort = (name: string, kind: 'input' | 'output') => ports.get(name)?.kind === kind;
    const checkExpect = (e: BehaviourExpectation) => {
      for (const name of Object.keys(e.outputs ?? {}))
        expect(isPort(name, 'output'), name).toBe(true);
      for (const c of e.cells ?? []) expect(inBox(c.pos, m.size)).toBe(true);
      for (const p of e.properties ?? []) {
        expect(inBox(p.pos, m.size)).toBe(true);
        const cell = localBlocks(m, spec.params).find((b) => key(b.pos) === key(p.pos));
        expect(cell, `no block for property check at ${key(p.pos)}`).toBeDefined();
        expect(cell?.state).toContain(`${p.property}=`);
      }
      if (e.oscillation) {
        expect(isPort(e.oscillation.port, 'output')).toBe(true);
        expect(e.oscillation.onTicks).toBeLessThan(e.oscillation.periodTicks);
      }
      if (e.pulse) expect(isPort(e.pulse.port, 'output')).toBe(true);
      for (const i of e.items ?? []) expect(ports.get(i.port)?.carrier).toBe('items');
    };
    checkExpect(spec.initial);
    for (const step of spec.steps) {
      expect(step.waitTicks).toBeGreaterThan(0);
      for (const name of Object.keys(step.set ?? {}))
        expect(isPort(name, 'input'), name).toBe(true);
      if (step.pulse) {
        expect(isPort(step.pulse.port, 'input')).toBe(true);
        expect(step.pulse.ticks).toBeGreaterThan(0);
      }
      for (const i of step.insertItems ?? []) {
        expect(ports.get(i.port)).toMatchObject({ kind: 'input', carrier: 'items' });
      }
      const cells = new Set(localBlocks(m, spec.params).map((b) => key(b.pos)));
      for (const p of step.rebuild ?? []) {
        expect(cells.has(key(p)), `rebuild ${key(p)} has no module block`).toBe(true);
      }
      checkExpect(step.expect);
    }
    for (const p of spec.preload ?? []) expect(inBox(p.pos, m.size)).toBe(true);
  });
});

describe('resolveModuleParams', () => {
  it('fills defaults and keeps valid values', () => {
    const specs = {
      n: { type: 'integer', minimum: 1, maximum: 4, default: 2, descriptionKey: 'k' },
      b: { type: 'boolean', default: false, descriptionKey: 'k' },
      s: { type: 'string', enum: ['a', 'b'], default: 'a', descriptionKey: 'k' },
    } as const;
    expect(resolveModuleParams(specs, undefined)).toEqual({
      ok: true,
      params: { n: 2, b: false, s: 'a' },
    });
    expect(resolveModuleParams(specs, { n: 4, b: true, s: 'b' })).toEqual({
      ok: true,
      params: { n: 4, b: true, s: 'b' },
    });
    const bad = resolveModuleParams(specs, { n: 9, b: 1, s: 'c', x: 1 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toHaveLength(4);
    expect(resolveModuleParams(undefined, {})).toEqual({ ok: true, params: {} });
  });
});

describe('module-specific facts', () => {
  it('item sorter filter loadouts give signal 2 at rest and 3 with one extra item', () => {
    const fillers = Array.from({ length: 4 }, () => ({ count: 1, maxStack: 64 }));
    for (const [stack, max] of [
      ['64', 64],
      ['16', 16],
    ] as const) {
      const { sortItems, fillerSlots } = sorterFilterLoadout(stack);
      expect(fillerSlots).toBe(4);
      expect(hopperComparatorSignal([{ count: sortItems, maxStack: max }, ...fillers])).toBe(2);
      expect(hopperComparatorSignal([{ count: sortItems + 1, maxStack: max }, ...fillers])).toBe(3);
    }
    expect(hopperComparatorSignal([])).toBe(0);
  });

  it('observer clock runs at 6 gt and the T flip-flop needs 4 gt pulses', () => {
    // https://minecraft.wiki/w/Redstone_circuits/Clock: hand-placed pair = 6 gt (3 rt).
    expect(OBSERVER_CLOCK_PERIOD_TICKS).toBe(6);
    const clock = MODULE_CATALOGUE.get('observer_clock');
    expect(clock?.behaviour.steps.some((s) => (s.rebuild ?? []).length > 0)).toBe(true);
    const flipFlop = MODULE_CATALOGUE.get('t_flip_flop');
    const pulses = flipFlop?.behaviour.steps.flatMap((s) => (s.pulse ? [s.pulse.ticks] : []));
    // One negative case below the minimum, the rest at or above it.
    expect(pulses?.filter((t) => t < T_FLIP_FLOP_MIN_PULSE_TICKS)).toEqual([2]);
    expect(pulses).toContain(T_FLIP_FLOP_MIN_PULSE_TICKS);
  });

  it('repeater clock and pulse extender timing formulas', () => {
    expect(repeaterClockPeriodTicks(1)).toBe(12);
    expect(repeaterClockPeriodTicks(4)).toBe(36);
    // Torch burnout: more than 8 turn-offs within 60 game ticks. One turn-off per period.
    expect(60 / repeaterClockPeriodTicks(1)).toBeLessThanOrEqual(8);
    expect(pulseExtenderOutput(2, 2)).toEqual({ delayTicks: 6, lengthTicks: 16 });
    expect(pulseExtenderOutput(1, 20)).toEqual({ delayTicks: 4, lengthTicks: 26 });
  });

  it('repeater delay parameter is applied to the loop repeaters', () => {
    const m = MODULE_CATALOGUE.get('repeater_clock');
    const delays = m
      ?.build({ delay: 3 }, 'north')
      .filter((b) => b.state.startsWith('minecraft:repeater'))
      .map((b) => b.state.match(/delay=(\d)/)?.[1]);
    expect(delays).toEqual(['3', '3']);
  });
});
