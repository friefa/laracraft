import { createJavaBlockRegistry } from '@laracraft/core-model';
import { planBuild } from './planner/plan-build';
import { validatePlan } from './validator/validate-plan';
import { GOLDEN_BUILDS } from '../testing/golden';

/**
 * Lead-owned integration gate (MVP): the planner's output for every golden build
 * must pass the independently written validator with zero issues. Planner and
 * validator were written by different agents against the same contract.
 */
describe('planner × validator on golden builds', () => {
  const registry = createJavaBlockRegistry();

  it.each(GOLDEN_BUILDS.map((g) => [g.name, g] as const))(
    '%s: zero validation issues',
    (_name, golden) => {
      const doc = golden.create(registry);
      const plan = planBuild(doc, registry);
      const issues = validatePlan(doc, registry, plan);
      expect(issues).toEqual([]);
      expect(plan.steps.length).toBeGreaterThan(0);
      for (const step of plan.steps) {
        expect(step.actions.length).toBeLessThanOrEqual(30);
      }
    },
  );

  it('is deterministic', () => {
    const golden = GOLDEN_BUILDS[0];
    if (!golden) throw new Error('no golden builds');
    const strip = (p: ReturnType<typeof planBuild>) =>
      JSON.stringify({ ...p, stats: { ...p.stats, millis: 0 } });
    expect(strip(planBuild(golden.create(registry), registry))).toBe(
      strip(planBuild(golden.create(registry), registry)),
    );
  });
});

describe('planner × validator: switched-on lever', () => {
  it('a lever stored powered=true is placed and then right-clicked, with zero issues', () => {
    const registry = createJavaBlockRegistry();
    const golden = GOLDEN_BUILDS[0];
    if (!golden) throw new Error('no golden builds');
    const doc = golden.create(registry);
    const b = doc.volume.bounds();
    if (!b) throw new Error('empty');
    // A stone block with a powered lever on top, next to the build.
    const x = b.max.x + 2;
    const y = b.min.y;
    doc.setBlock({ x, y, z: b.min.z }, 'minecraft:stone' as never);
    doc.setBlock(
      { x, y: y + 1, z: b.min.z },
      'minecraft:lever[face=floor,facing=north,powered=true]' as never,
    );
    const plan = planBuild(doc, registry);
    expect(validatePlan(doc, registry, plan)).toEqual([]);
  });
});
