import {
  createJavaBlockRegistry,
  type BlockStateString,
  type BuildDocument,
  type Vec3,
} from '@laracraft/core-model';
import type {
  ContainerSnapshot,
  CreateSimulationFn,
  Scenario,
  Simulation,
  Stimulus,
} from '../lib/api';
import { runScenario } from './run-scenario';
import { SOURCE_SCENARIOS } from './scenarios/sources';

const registry = createJavaBlockRegistry();
const SETTLE_TICKS = 7;

interface FakeOptions {
  readonly applied?: { tick: number; stimulus: Stimulus }[];
  readonly containers?: ReadonlyMap<string, ContainerSnapshot>;
  readonly throwOnStepAt?: number;
}

/** A simulator that never changes anything: it only reports the document's states. */
function fakeCreate(opts: FakeOptions = {}): CreateSimulationFn {
  return (doc: BuildDocument): Simulation => {
    let tick = 100;
    const sim: Simulation = {
      get tick() {
        return tick;
      },
      getState: (pos: Vec3) => doc.getBlock(pos.x, pos.y, pos.z),
      getEmittedPower: () => 0,
      getReceivedPower: () => 0,
      isPowered: () => false,
      getContainer: (pos: Vec3) => opts.containers?.get(`${pos.x},${pos.y},${pos.z}`),
      apply: (stimulus) => {
        opts.applied?.push({ tick: tick - 100 - SETTLE_TICKS, stimulus });
      },
      step: (ticks = 1) => {
        if (
          opts.throwOnStepAt !== undefined &&
          tick + ticks - 100 - SETTLE_TICKS >= opts.throwOnStepAt
        ) {
          throw new Error('boom');
        }
        tick += ticks;
      },
      settle: () => {
        tick += SETTLE_TICKS;
        return SETTLE_TICKS;
      },
      toDocument: () => doc,
    };
    return sim;
  };
}

const leverScenario = SOURCE_SCENARIOS.find((s) => s.name === 'lever-toggles-lamp') as Scenario;

const tiny = (steps: Scenario['steps'], blocks?: Scenario['blocks']): Scenario => ({
  name: 'tiny',
  description: 'runner self-test',
  source: 'https://minecraft.wiki/w/Redstone_Lamp',
  blocks: blocks ?? [{ pos: { x: 0, y: 0, z: 0 }, state: 'minecraft:redstone_lamp' }],
  steps,
});
const ORIGIN = { x: 0, y: 0, z: 0 };

describe('runScenario', () => {
  it('reports every expectation a do-nothing simulator misses, with tick/pos/expected/actual', () => {
    const result = runScenario(fakeCreate(), leverScenario, registry);
    expect(result.passed).toBe(false);
    expect(result.checks).toBe(5);
    expect(result.mismatches.map((m) => [m.tick, m.kind, m.pos])).toEqual([
      [0, 'props', { x: 0, y: 0, z: 0 }],
      [0, 'props', { x: 1, y: 0, z: 0 }],
      [13, 'props', { x: 1, y: 0, z: 0 }],
    ]);
    const first = result.mismatches[0];
    expect(first?.expected).toBe('powered=true');
    expect(first?.actual).toContain('powered=false');
    expect(first?.message).toContain('t=0');
  });

  it('applies stimuli at their scenario tick, counted from after the initial settle', () => {
    const applied: { tick: number; stimulus: Stimulus }[] = [];
    runScenario(fakeCreate({ applied }), leverScenario, registry);
    expect(applied.map((a) => a.tick)).toEqual([0, 10]);
    expect(applied.every((a) => a.stimulus.kind === 'use')).toBe(true);
  });

  it('runs out-of-order steps in tick order', () => {
    const applied: { tick: number; stimulus: Stimulus }[] = [];
    const scenario = tiny([
      { at: 5, do: { kind: 'use', pos: ORIGIN } },
      { at: 2, do: { kind: 'use', pos: ORIGIN } },
    ]);
    runScenario(fakeCreate({ applied }), scenario, registry);
    expect(applied.map((a) => a.tick)).toEqual([2, 5]);
  });

  it('passes when the view matches; state checks compare with defaults filled in', () => {
    const result = runScenario(
      fakeCreate(),
      tiny([
        { at: 0, expect: { kind: 'state', pos: ORIGIN, state: 'minecraft:redstone_lamp' } },
        { at: 3, expect: { kind: 'props', pos: ORIGIN, props: { lit: 'false' } } },
        { at: 3, expect: { kind: 'powered', pos: ORIGIN, value: false } },
        { at: 4, expect: { kind: 'power', pos: ORIGIN, level: 0 } },
        { at: 4, expect: { kind: 'state', pos: { x: 5, y: 0, z: 0 }, state: 'minecraft:air' } },
      ]),
      registry,
    );
    expect(result).toEqual({ name: 'tiny', passed: true, checks: 5, mismatches: [] });
  });

  it('reports wrong powered/power values and unknown properties', () => {
    const result = runScenario(
      fakeCreate(),
      tiny([
        { at: 0, expect: { kind: 'powered', pos: ORIGIN, value: true } },
        { at: 0, expect: { kind: 'power', pos: ORIGIN, level: 15 } },
        { at: 0, expect: { kind: 'props', pos: ORIGIN, props: { nope: 'x' } } },
        { at: 0, expect: { kind: 'state', pos: ORIGIN, state: 'minecraft:stone' } },
      ]),
      registry,
    );
    expect(result.mismatches.map((m) => [m.kind, m.expected, m.actual.split(' ')[0]])).toEqual([
      ['powered', 'true', 'false'],
      ['power', '15', '0'],
      ['props', 'nope=x', 'nope=<missing>'],
      ['state', 'minecraft:stone', 'minecraft:redstone_lamp[lit=false]'],
    ]);
  });

  it('counts container items and reports missing containers', () => {
    const containers = new Map<string, ContainerSnapshot>([
      [
        '0,0,0',
        {
          pos: ORIGIN,
          slots: [
            { item: 'minecraft:cobblestone', count: 64 },
            null,
            { item: 'minecraft:cobblestone', count: 3 },
            { item: 'minecraft:dirt', count: 9 },
          ],
        },
      ],
    ]);
    const result = runScenario(
      fakeCreate({ containers }),
      tiny(
        [
          {
            at: 0,
            expect: { kind: 'items', pos: ORIGIN, item: 'minecraft:cobblestone', count: 67 },
          },
          { at: 0, expect: { kind: 'items', pos: ORIGIN, item: 'minecraft:dirt', count: 1 } },
          {
            at: 0,
            expect: { kind: 'items', pos: { x: 1, y: 0, z: 0 }, item: 'minecraft:dirt', count: 0 },
          },
        ],
        [
          { pos: ORIGIN, state: 'minecraft:chest' },
          { pos: { x: 1, y: 0, z: 0 }, state: 'minecraft:hopper' },
        ],
      ),
      registry,
    );
    expect(result.mismatches.map((m) => m.actual)).toEqual(['9 x minecraft:dirt', 'no container']);
  });

  it('reports invalid blocks as setup mismatches without creating a simulation', () => {
    const create = vi.fn(fakeCreate());
    const result = runScenario(
      create,
      tiny([], [{ pos: ORIGIN, state: 'minecraft:not_a_block' }]),
      registry,
    );
    expect(create).not.toHaveBeenCalled();
    expect(result.passed).toBe(false);
    expect(result.mismatches[0]?.kind).toBe('setup');
  });

  it('turns simulator exceptions into error mismatches instead of throwing', () => {
    const throwing: CreateSimulationFn = () => {
      throw new Error('not implemented');
    };
    const setup = runScenario(throwing, leverScenario, registry);
    expect(setup.mismatches).toHaveLength(1);
    expect(setup.mismatches[0]).toMatchObject({ kind: 'error', actual: 'not implemented' });

    const midway = runScenario(fakeCreate({ throwOnStepAt: 10 }), leverScenario, registry);
    const last = midway.mismatches[midway.mismatches.length - 1];
    expect(last).toMatchObject({ kind: 'error', tick: 10, actual: 'boom' });
  });

  it('passes the java edition option to the factory', () => {
    const create = vi.fn(fakeCreate());
    runScenario(create, tiny([]), registry);
    expect(create.mock.calls[0]?.[2]).toEqual({ edition: 'java' });
    const doc = create.mock.calls[0]?.[0];
    expect(doc?.getBlock(0, 0, 0)).toBe('minecraft:redstone_lamp[lit=false]' as BlockStateString);
  });
});
