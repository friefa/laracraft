import { boxSize, resolveBlockState, type BuildDocument } from '@laracraft/core-model';
import { validatePlan } from '../../lib/validator/validate-plan';
import { place, planOf, registry, step, v } from '../plan-builders';
import { GOLDEN_BUILDS, HOUSE, OBSERVER_CLOCK, PISTON_DOOR, SAND_ARCH } from './index';

function states(doc: BuildDocument): Map<string, string> {
  const out = new Map<string, string>();
  doc.volume.forEachBlock((x, y, z, i) => out.set(`${x},${y},${z}`, doc.palette.stateAt(i)));
  return out;
}

describe('golden builds', () => {
  it('have unique names and descriptions', () => {
    const names = GOLDEN_BUILDS.map((g) => g.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([
      'house',
      'tower',
      'sand-arch',
      'piston-door',
      'observer-clock',
      'waterfall',
    ]);
    for (const g of GOLDEN_BUILDS) expect(g.description.length).toBeGreaterThan(20);
  });

  it.each(GOLDEN_BUILDS.map((g) => [g.name, g] as const))(
    '%s is a valid document (every state resolves canonically in the registry)',
    (_, golden) => {
      const doc = golden.create(registry);
      const all = states(doc);
      expect(all.size).toBeGreaterThan(0);
      for (const state of all.values()) {
        const r = resolveBlockState(registry, state);
        expect(r).toEqual({ ok: true, state });
      }
      expect(doc.metadata.name).toBe(golden.name);
    },
  );

  it('house is 7×5×7', () => {
    const bounds = HOUSE.create(registry).volume.bounds();
    expect(bounds && boxSize(bounds)).toEqual({ x: 7, y: 5, z: 7 });
  });

  it('piston door has four retracted sticky pistons, one lever and one repeater', () => {
    const all = [...states(PISTON_DOOR.create(registry)).values()];
    expect(all.filter((s) => s.startsWith('minecraft:sticky_piston[extended=false'))).toHaveLength(
      4,
    );
    expect(all.filter((s) => s.startsWith('minecraft:lever'))).toHaveLength(1);
    expect(all.filter((s) => s.startsWith('minecraft:repeater'))).toHaveLength(1);
  });

  it('sand arch: every gravity block rests on a block', () => {
    const doc = SAND_ARCH.create(registry);
    doc.volume.forEachBlock((x, y, z, i) => {
      const id = doc.palette.stateAt(i).replace(/\[.*$/, '');
      if (!registry.get(id)?.physics.gravity || y === 0) return;
      expect(doc.getBlock(x, y - 1, z)).not.toBe('minecraft:air');
    });
  });

  it('every golden build without a plan reports only completeness issues', () => {
    for (const g of GOLDEN_BUILDS) {
      const issues = validatePlan(g.create(registry), registry, planOf());
      expect(issues.length).toBeGreaterThan(0);
      expect(new Set(issues.map((i) => i.rule))).toEqual(new Set(['completeness']));
    }
  });

  it('observer clock: a hand-written plan is valid (mutual observer pair allowed)', () => {
    const floor = 'minecraft:smooth_stone';
    const levelLook = (horizontal: 'east' | 'west') => ({ horizontal, vertical: 'level' as const });
    const plan = planOf(
      step(
        'structure',
        ...[-1, 0, 1, 2, 3].map((x) => place(v(x, 0, 0), floor)),
        place(v(-1, 1, 0), 'minecraft:redstone_lamp[lit=false]', { standAt: v(-1, 0, 2) }),
      ),
      step(
        'redstone',
        place(v(0, 1, 0), 'minecraft:observer[facing=east,powered=false]', {
          standAt: v(-3, 0, 0),
          look: levelLook('east'),
        }),
        place(v(1, 1, 0), 'minecraft:observer[facing=west,powered=false]', {
          standAt: v(5, 0, 0),
          look: levelLook('west'),
        }),
        place(v(2, 1, 0), 'minecraft:piston[extended=false,facing=east]', {
          standAt: v(5, 0, 0),
          look: levelLook('west'),
        }),
      ),
    );
    expect(validatePlan(OBSERVER_CLOCK.create(registry), registry, plan)).toEqual([]);
  });
});
