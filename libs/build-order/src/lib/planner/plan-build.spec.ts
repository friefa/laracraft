import {
  BuildDocument,
  createJavaBlockRegistry,
  DIRECTION_OFFSET,
  resolveBlockState,
  type BlockStateString,
  type Vec3,
} from '@laracraft/core-model';
import type { BuildOrderOptions, BuildPhase, BuildPlan, PlaceAction, StepAction } from '../types';
import { planBuild } from './plan-build';

const registry = createJavaBlockRegistry();
const META = {
  name: 'test',
  dataVersion: 4189,
  edition: 'java' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function state(s: string): BlockStateString {
  const r = resolveBlockState(registry, s);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

type Blocks = readonly (readonly [number, number, number, string])[];

function makeDoc(blocks: Blocks): BuildDocument {
  const doc = new BuildDocument({ ...META });
  for (const [x, y, z, s] of blocks) doc.setBlock({ x, y, z }, state(s));
  return doc;
}

const key = (p: Vec3) => `${p.x},${p.y},${p.z}`;
const actions = (plan: BuildPlan): StepAction[] => plan.steps.flatMap((s) => s.actions);
const places = (plan: BuildPlan): PlaceAction[] =>
  actions(plan).filter((a): a is PlaceAction => a.kind === 'place');
const finalPlace = (plan: BuildPlan, x: number, y: number, z: number): PlaceAction => {
  const a = places(plan).find(
    (p) => !p.temporary && p.pos.x === x && p.pos.y === y && p.pos.z === z,
  );
  if (!a) throw new Error(`no placement at ${x},${y},${z}`);
  return a;
};
const indexOf = (plan: BuildPlan, x: number, y: number, z: number): number =>
  places(plan).indexOf(finalPlace(plan, x, y, z));

const PHASES: readonly BuildPhase[] = ['structure', 'redstone', 'power', 'fluids', 'cleanup'];

/**
 * Minimal independent replay of a plan: checks completeness, click targets,
 * stand positions, reach, phase order and cleanup. (The full validator lives
 * in `validator/`; this guards the planner's own invariants.)
 */
function replay(doc: BuildDocument, plan: BuildPlan, options: Partial<BuildOrderOptions> = {}) {
  const issues: string[] = [];
  const bounds = doc.volume.bounds();
  const groundY = options.groundY ?? (bounds ? bounds.min.y - 1 : 0);
  const reach = options.reach ?? 4.5;
  const world = new Map<string, { state: string; temporary: boolean }>();
  const occupied = (p: Vec3) =>
    world.has(key(p)) || (p.y <= groundY && doc.getBlock(p.x, p.y, p.z) === 'minecraft:air');
  const expected = new Map<string, string>();
  doc.volume.forEachBlock((x, y, z, i) => {
    const s = doc.palette.stateAt(i);
    if (/minecraft:(water|lava)\[level=([1-9]|1[0-5])\]/.test(s)) return;
    if (/half=upper/.test(s) && /_door/.test(s)) return;
    expected.set(key({ x, y, z }), s);
  });
  let lastPhase = 0;
  let fluidSeen = false;
  for (const step of plan.steps) {
    const p = PHASES.indexOf(step.phase);
    if (p < lastPhase) issues.push(`phase order: step ${step.index} ${step.phase}`);
    lastPhase = p;
    for (const a of step.actions) {
      const k = key(a.pos);
      if (a.kind === 'remove') {
        const cur = world.get(k);
        if (!cur?.temporary) issues.push(`remove of non-temporary at ${k}`);
        world.delete(k);
        continue;
      }
      if (occupied(a.pos)) issues.push(`placing into occupied ${k}`);
      const off = DIRECTION_OFFSET[a.clickOn.face];
      const c = a.clickOn.pos;
      if (c.x + off.x !== a.pos.x || c.y + off.y !== a.pos.y || c.z + off.z !== a.pos.z) {
        issues.push(`clickOn not adjacent at ${k}`);
      }
      if (!occupied(c)) issues.push(`clickOn missing at ${k}`);
      const f = a.standAt;
      if (occupied(f) || occupied({ ...f, y: f.y + 1 })) issues.push(`stand blocked at ${k}`);
      if (!occupied({ ...f, y: f.y - 1 })) issues.push(`stand floating at ${k}`);
      if (key(f) === k || key({ ...f, y: f.y + 1 }) === k) issues.push(`stand inside target ${k}`);
      const fc = {
        x: a.pos.x + 0.5 - off.x / 2,
        y: a.pos.y + 0.5 - off.y / 2,
        z: a.pos.z + 0.5 - off.z / 2,
      };
      const d = Math.hypot(fc.x - f.x - 0.5, fc.y - f.y - 1.62, fc.z - f.z - 0.5);
      if (d > reach + 1e-6) issues.push(`out of reach (${d.toFixed(2)}) at ${k}`);
      const facing =
        (f.x + 0.5 - fc.x) * off.x + (f.y + 1.62 - fc.y) * off.y + (f.z + 0.5 - fc.z) * off.z;
      if (facing <= 0) issues.push(`clicked face points away from the eye at ${k}`);
      const fluid = /minecraft:(water|lava)/.test(a.state);
      if (fluidSeen && !fluid) issues.push(`solid placement after a fluid at ${k}`);
      if (fluid) fluidSeen = true;
      world.set(k, { state: a.state, temporary: a.temporary === true });
      if (!a.temporary) {
        if (expected.get(k) !== a.state) issues.push(`wrong/duplicate state at ${k}: ${a.state}`);
        expected.delete(k);
      }
      if (/_door\[.*half=lower/.test(a.state))
        world.set(key({ ...a.pos, y: a.pos.y + 1 }), { state: 'door', temporary: false });
    }
  }
  for (const k of expected.keys()) issues.push(`never placed ${k}`);
  const leftovers = [...world.entries()].filter(([, v]) => v.temporary).map(([k]) => k);
  return { issues, leftovers };
}

function expectClean(
  doc: BuildDocument,
  plan: BuildPlan,
  options: Partial<BuildOrderOptions> = {},
) {
  const { issues, leftovers } = replay(doc, plan, options);
  expect(issues).toEqual([]);
  expect(leftovers).toEqual([]);
}

/** Plan without timing, for determinism checks. */
const stable = (plan: BuildPlan) =>
  JSON.stringify({ ...plan, stats: { ...plan.stats, millis: 0 } });

describe('planBuild basics', () => {
  it('returns an empty plan for an empty document', () => {
    const plan = planBuild(makeDoc([]), registry);
    expect(plan.steps).toEqual([]);
    expect(plan.stats.blocks).toBe(0);
  });

  it('places a small house bottom-up, every block exactly once, deterministically', () => {
    const blocks: [number, number, number, string][] = [];
    for (let x = 0; x < 7; x++) {
      for (let z = 0; z < 7; z++) {
        blocks.push([x, 0, z, 'oak_planks']);
        for (let y = 1; y <= 3; y++) {
          if (x === 0 || z === 0 || x === 6 || z === 6) blocks.push([x, y, z, 'cobblestone']);
        }
        blocks.push([x, 4, z, 'oak_slab[type=bottom]']);
      }
    }
    const doc = makeDoc(blocks);
    const plan = planBuild(doc, registry);
    expectClean(doc, plan);
    expect(plan.stats.blocks).toBe(blocks.length);
    expect(stable(planBuild(doc, registry))).toBe(stable(plan));
    // Y order inside the structure phase.
    const ys = places(plan)
      .filter((p) => !p.temporary)
      .map((p) => p.pos.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    for (const step of plan.steps) {
      expect(step.actions.length).toBeLessThanOrEqual(30);
      expect(step.materials.reduce((n, m) => n + m.count, 0)).toBeGreaterThan(0);
    }
    expect(plan.totalMaterials).toContainEqual({ item: 'minecraft:oak_slab', count: 49 });
    expect(plan.warnings).toEqual([]);
  });

  it('respects step size options and never mixes phases', () => {
    const blocks: [number, number, number, string][] = [];
    for (let x = 0; x < 10; x++) blocks.push([x, 0, 0, 'stone'], [x, 1, 0, 'redstone_wire']);
    blocks.push([10, 0, 0, 'stone'], [10, 1, 0, 'redstone_block']);
    const doc = makeDoc(blocks);
    const plan = planBuild(doc, registry, { minStepSize: 2, maxStepSize: 4 });
    for (const step of plan.steps) {
      expect(step.actions.length).toBeLessThanOrEqual(4);
      expect(new Set(step.actions.map((a) => a.kind)).size).toBe(1);
    }
    expect(plan.steps.map((s) => s.phase)).toEqual([
      'structure',
      'structure',
      'structure',
      'redstone',
      'redstone',
      'redstone',
      'power',
    ]);
    expectClean(doc, plan);
  });

  it('reports unknown blocks and still places them', () => {
    const doc = new BuildDocument({ ...META });
    doc.setBlock({ x: 0, y: 0, z: 0 }, 'mymod:thing' as BlockStateString);
    const plan = planBuild(doc, registry);
    expect(plan.warnings.map((w) => w.code)).toContain('unknown-block');
    expect(places(plan)).toHaveLength(1);
  });
});

describe('rule 1: attachments', () => {
  it('places a wall torch after its wall, clicking the wall face', () => {
    const doc = makeDoc([
      [0, 0, 0, 'stone'],
      [0, 1, 0, 'stone'],
      [1, 1, 0, 'wall_torch[facing=east]'],
    ]);
    const plan = planBuild(doc, registry);
    const torch = finalPlace(plan, 1, 1, 0);
    expect(torch.clickOn).toEqual({ pos: { x: 0, y: 1, z: 0 }, face: 'east' });
    expect(torch.item).toBe('minecraft:torch');
    expect(indexOf(plan, 1, 1, 0)).toBeGreaterThan(indexOf(plan, 0, 1, 0));
    expectClean(doc, plan);
  });

  it('places a lever on the floor and on a wall with the right click and look', () => {
    const doc = makeDoc([
      [0, 0, 0, 'stone'],
      [0, 1, 0, 'stone'],
      [1, 0, 0, 'stone'],
      [1, 1, 0, 'lever[face=floor,facing=east]'],
      [0, 1, 1, 'lever[face=wall,facing=south]'],
    ]);
    const plan = planBuild(doc, registry);
    const floor = finalPlace(plan, 1, 1, 0);
    expect(floor.clickOn).toEqual({ pos: { x: 1, y: 0, z: 0 }, face: 'up' });
    expect(floor.look.horizontal).toBe('east');
    const wall = finalPlace(plan, 0, 1, 1);
    expect(wall.clickOn).toEqual({ pos: { x: 0, y: 1, z: 0 }, face: 'south' });
    expect(plan.steps.find((s) => s.actions.includes(wall))?.phase).toBe('power');
    expectClean(doc, plan);
  });

  it('places redstone wire on a hopper (rigid top) after the hopper, sneaking', () => {
    const doc = makeDoc([
      [0, 0, 0, 'stone'],
      [0, 1, 0, 'hopper[facing=down]'],
      [0, 2, 0, 'redstone_wire'],
    ]);
    const plan = planBuild(doc, registry);
    const wire = finalPlace(plan, 0, 2, 0);
    expect(wire.item).toBe('minecraft:redstone');
    expect(wire.clickOn).toEqual({ pos: { x: 0, y: 1, z: 0 }, face: 'up' });
    expect(wire.sneak).toBe(true);
    expect(plan.warnings).toEqual([]);
    expectClean(doc, plan);
  });

  it('warns when the supporting face is too weak (wire on a bottom slab)', () => {
    const doc = makeDoc([
      [0, 0, 0, 'stone_slab[type=bottom]'],
      [0, 1, 0, 'redstone_wire'],
    ]);
    const plan = planBuild(doc, registry);
    expect(plan.warnings.map((w) => w.code)).toContain('unsupported-state');
  });

  it('places a hanging lantern after the block above by clicking its underside', () => {
    const doc = makeDoc([
      [0, 0, 0, 'stone'],
      [0, 1, 0, 'stone'],
      [0, 2, 0, 'stone'],
      [1, 2, 0, 'stone'],
      [1, 1, 0, 'lantern[hanging=true]'],
    ]);
    const plan = planBuild(doc, registry);
    const lantern = finalPlace(plan, 1, 1, 0);
    expect(lantern.clickOn).toEqual({ pos: { x: 1, y: 2, z: 0 }, face: 'down' });
    expect(indexOf(plan, 1, 1, 0)).toBeGreaterThan(indexOf(plan, 1, 2, 0));
    expectClean(doc, plan);
  });

  it('places a door as one placement covering both halves', () => {
    const doc = makeDoc([
      [0, 0, 0, 'stone'],
      [0, 1, 0, 'oak_door[facing=north,half=lower]'],
      [0, 2, 0, 'oak_door[facing=north,half=upper]'],
    ]);
    const plan = planBuild(doc, registry);
    expect(places(plan)).toHaveLength(2);
    expect(finalPlace(plan, 0, 1, 0).look.horizontal).toBe('north');
    expect(plan.totalMaterials).toContainEqual({ item: 'minecraft:oak_door', count: 1 });
    expect(plan.warnings).toEqual([]);
    expectClean(doc, plan);
  });
});

describe('rule 2: gravity', () => {
  it('places sand only after the block below', () => {
    const doc = makeDoc([
      [0, 0, 0, 'sand'],
      [0, 1, 0, 'sand'],
      [0, 2, 0, 'red_concrete_powder'],
    ]);
    const plan = planBuild(doc, registry);
    expect(
      places(plan)
        .filter((p) => !p.temporary)
        .map((p) => p.pos.y),
    ).toEqual([0, 1, 2]);
    expect(plan.warnings).toEqual([]);
    expectClean(doc, plan);
  });

  it('warns about overhanging sand and never puts a temporary block under it', () => {
    const doc = makeDoc([
      [0, 0, 0, 'stone'],
      [0, 1, 0, 'stone'],
      [0, 2, 0, 'stone'],
      [1, 2, 0, 'sand'],
      [3, 3, 0, 'gravel'],
    ]);
    const plan = planBuild(doc, registry);
    expect(plan.warnings).toContainEqual(
      expect.objectContaining({ code: 'unsupported-state', pos: { x: 1, y: 2, z: 0 } }),
    );
    expect(plan.warnings).toContainEqual(
      expect.objectContaining({ code: 'unsupported-state', pos: { x: 3, y: 3, z: 0 } }),
    );
    const temps = places(plan)
      .filter((p) => p.temporary)
      .map((p) => key(p.pos));
    expect(temps).not.toContain('1,1,0');
    expect(temps).not.toContain('3,2,0');
    expectClean(doc, plan);
  });

  it('places a floating stone block with a removable scaffold column', () => {
    const doc = makeDoc([
      [0, 0, 0, 'stone'],
      [3, 2, 0, 'stone'],
    ]);
    const plan = planBuild(doc, registry);
    expectClean(doc, plan);
    expect(actions(plan).filter((a) => a.kind === 'remove').length).toBeGreaterThan(0);
    expect(plan.warnings).toEqual([]);
  });
});

describe('rule 3: orientation', () => {
  const H = ['north', 'east', 'south', 'west'] as const;
  for (const facing of H) {
    for (const half of ['bottom', 'top'] as const) {
      it(`stairs facing=${facing} half=${half}`, () => {
        const doc = makeDoc([
          [0, 0, 0, 'stone'],
          [1, 0, 0, 'stone'],
          [0, 0, 1, 'stone'],
          [1, 0, 1, 'stone'],
          [1, 1, 1, 'stone'],
          [0, 1, 1, `oak_stairs[facing=${facing},half=${half}]`],
        ]);
        const plan = planBuild(doc, registry);
        const a = finalPlace(plan, 0, 1, 1);
        expect(a.look.horizontal).toBe(facing);
        const producedHalf =
          a.clickOn.face === 'up' ? 'bottom' : a.clickOn.face === 'down' ? 'top' : a.clickHalf;
        expect(producedHalf).toBe(half);
        expectClean(doc, plan);
      });
    }
  }

  it('observer and piston get the 3D look direction (incl. up/down)', () => {
    const doc = makeDoc([
      [0, 0, 0, 'stone'],
      [1, 0, 0, 'stone'],
      [2, 0, 0, 'stone'],
      [0, 1, 0, 'observer[facing=up]'],
      [1, 1, 0, 'piston[facing=up]'],
      [2, 1, 0, 'observer[facing=north]'],
      [3, 0, 0, 'stone'],
      [3, 1, 0, 'sticky_piston[facing=down]'],
    ]);
    const plan = planBuild(doc, registry);
    expect(finalPlace(plan, 0, 1, 0).look.vertical).toBe('up');
    expect(finalPlace(plan, 1, 1, 0).look.vertical).toBe('down');
    expect(finalPlace(plan, 2, 1, 0).look).toEqual({ horizontal: 'north', vertical: 'level' });
    expect(finalPlace(plan, 3, 1, 0).look.vertical).toBe('up');
    expectClean(doc, plan);
  });

  it('logs get their axis from the clicked face', () => {
    const doc = makeDoc([
      [0, 0, 0, 'stone'],
      [0, 1, 0, 'oak_log[axis=y]'],
      [1, 1, 0, 'oak_log[axis=x]'],
      [1, 1, 1, 'oak_log[axis=z]'],
    ]);
    const plan = planBuild(doc, registry);
    expect(['up', 'down']).toContain(finalPlace(plan, 0, 1, 0).clickOn.face);
    expect(['east', 'west']).toContain(finalPlace(plan, 1, 1, 0).clickOn.face);
    expect(['north', 'south']).toContain(finalPlace(plan, 1, 1, 1).clickOn.face);
    expectClean(doc, plan);
  });

  it('repeater/comparator/note block: interactions; hopper points into the clicked block', () => {
    const doc = makeDoc([
      [0, 0, 0, 'stone'],
      [1, 0, 0, 'stone'],
      [2, 0, 0, 'stone'],
      [3, 0, 0, 'stone'],
      [0, 1, 0, 'repeater[delay=3,facing=west]'],
      [1, 1, 0, 'comparator[facing=north,mode=subtract]'],
      [2, 1, 0, 'note_block[note=5]'],
      [3, 1, 0, 'hopper[facing=east]'],
      [4, 1, 0, 'stone'],
      [4, 0, 0, 'stone'],
    ]);
    const plan = planBuild(doc, registry);
    const rep = finalPlace(plan, 0, 1, 0);
    expect(rep.interactions).toBe(2);
    expect(rep.look.horizontal).toBe('east');
    expect(finalPlace(plan, 1, 1, 0).interactions).toBe(1);
    expect(finalPlace(plan, 2, 1, 0).interactions).toBe(5);
    const hopper = finalPlace(plan, 3, 1, 0);
    expect(hopper.clickOn).toEqual({ pos: { x: 4, y: 1, z: 0 }, face: 'west' });
    const step = plan.steps.find((s) => s.actions.includes(rep));
    expect(step?.hints.map((h) => h.code)).toEqual(
      expect.arrayContaining(['interaction', 'look-direction', 'keep-circuit-open']),
    );
    expectClean(doc, plan);
  });

  it('slabs: top via upper half, double counts two items', () => {
    const doc = makeDoc([
      [0, 0, 0, 'stone'],
      [1, 0, 0, 'stone_slab[type=top]'],
      [2, 0, 0, 'stone_slab[type=double]'],
    ]);
    const plan = planBuild(doc, registry);
    const top = finalPlace(plan, 1, 0, 0);
    expect(top.clickOn.face === 'down' || top.clickHalf === 'top').toBe(true);
    expect(plan.totalMaterials).toContainEqual({ item: 'minecraft:stone_slab', count: 3 });
    expectClean(doc, plan);
  });
});

describe('rule 4: redstone safety', () => {
  it('orders structure → redstone → power with hints; observers after the watched block', () => {
    const doc = makeDoc([
      [0, 0, 0, 'stone'],
      [1, 0, 0, 'stone'],
      [2, 0, 0, 'stone'],
      [3, 0, 0, 'stone'],
      [0, 1, 0, 'redstone_block'],
      [1, 1, 0, 'redstone_wire'],
      [2, 1, 0, 'piston[facing=up]'],
      [3, 1, 0, 'observer[facing=west]'],
      [2, 2, 0, 'redstone_torch'],
    ]);
    const plan = planBuild(doc, registry);
    const phaseOf = (x: number, y: number) =>
      plan.steps.find((s) => s.actions.includes(finalPlace(plan, x, y, 0)))?.phase;
    expect(phaseOf(0, 0)).toBe('structure');
    expect(phaseOf(1, 1)).toBe('redstone');
    expect(phaseOf(2, 1)).toBe('redstone');
    // The observer watches the piston, whose neighbour is a torch: it waits for the torch.
    expect(phaseOf(3, 1)).toBe('power');
    expect(indexOf(plan, 3, 1, 0)).toBeGreaterThan(indexOf(plan, 2, 2, 0));
    expect(phaseOf(0, 1)).toBe('power');
    expect(phaseOf(2, 2)).toBe('power');
    expect(indexOf(plan, 3, 1, 0)).toBeGreaterThan(indexOf(plan, 2, 1, 0));
    expect(indexOf(plan, 2, 1, 0)).toBeGreaterThan(indexOf(plan, 1, 1, 0));
    const codes = (phase: BuildPhase) =>
      plan.steps.filter((s) => s.phase === phase).flatMap((s) => s.hints.map((h) => h.code));
    expect(codes('redstone')).toContain('keep-circuit-open');
    expect(codes('power')).toEqual(expect.arrayContaining(['power-source-last', 'observer-order']));
    expectClean(doc, plan);
  });

  it('a block supported by a power source moves into the power phase', () => {
    const doc = makeDoc([
      [0, 0, 0, 'redstone_block'],
      [0, 1, 0, 'redstone_wire'],
    ]);
    const plan = planBuild(doc, registry);
    expect(plan.steps.map((s) => s.phase)).toEqual(['power']);
    expect(indexOf(plan, 0, 1, 0)).toBeGreaterThan(indexOf(plan, 0, 0, 0));
  });
});

describe('rule 4b: observer clock', () => {
  it('places a mutually watching observer pair without a cycle warning', () => {
    const doc = makeDoc([
      [0, 0, 0, 'stone'],
      [1, 0, 0, 'stone'],
      [0, 1, 0, 'observer[facing=east]'],
      [1, 1, 0, 'observer[facing=west]'],
    ]);
    const plan = planBuild(doc, registry);
    expect(plan.warnings).toEqual([]);
    expect(finalPlace(plan, 0, 1, 0).look).toEqual({ horizontal: 'east', vertical: 'level' });
    expectClean(doc, plan);
  });
});

describe('rule 5: fluids', () => {
  it('places water sources last and never flowing water', () => {
    const doc = makeDoc([
      [0, 0, 0, 'stone'],
      [1, 0, 0, 'stone'],
      [0, 1, 0, 'water[level=0]'],
      [1, 1, 0, 'water[level=1]'],
      [2, 0, 0, 'stone'],
      [2, 1, 0, 'stone'],
    ]);
    const plan = planBuild(doc, registry);
    const last = plan.steps[plan.steps.length - 1];
    expect(last?.phase).toBe('fluids');
    expect(last?.hints.map((h) => h.code)).toContain('fluids-last');
    const water = places(plan).filter((p) => p.state.startsWith('minecraft:water'));
    expect(water).toHaveLength(1);
    expect(water[0]?.item).toBe('minecraft:water_bucket');
    expect(plan.stats.blocks).toBe(6);
    expectClean(doc, plan);
  });
});

describe('rule 6: reachability', () => {
  it('builds and removes a scaffold tower for a tall pillar', () => {
    const blocks: [number, number, number, string][] = [];
    for (let y = 0; y < 20; y++) blocks.push([0, y, 0, 'stone']);
    const doc = makeDoc(blocks);
    const plan = planBuild(doc, registry);
    expectClean(doc, plan);
    const temps = places(plan).filter((p) => p.temporary);
    expect(temps.length).toBeGreaterThan(0);
    expect(plan.stats.removals).toBe(temps.length);
    expect(plan.temporaryMaterials).toEqual([{ item: 'minecraft:dirt', count: temps.length }]);
    expect(plan.steps[plan.steps.length - 1]?.phase).toBe('cleanup');
    expect(plan.steps.flatMap((s) => s.hints.map((h) => h.code))).toEqual(
      expect.arrayContaining(['scaffold', 'remove-temporary']),
    );
    expect(plan.warnings).toEqual([]);
  });

  it('honours a custom scaffold block, reach and ground level', () => {
    const blocks: [number, number, number, string][] = [];
    for (let y = 5; y < 15; y++) blocks.push([0, y, 0, 'stone']);
    const doc = makeDoc(blocks);
    const options = {
      scaffoldBlock: 'minecraft:cobblestone' as BlockStateString,
      reach: 3,
      groundY: 4,
    };
    const plan = planBuild(doc, registry, options);
    expectClean(doc, plan, options);
    expect(
      places(plan)
        .filter((p) => p.temporary)
        .every((p) => p.state === 'minecraft:cobblestone'),
    ).toBe(true);
  });
});
