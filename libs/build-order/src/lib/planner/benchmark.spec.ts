import { createJavaBlockRegistry } from '@laracraft/core-model';
import { generateCity } from '../../testing/city';
import { planBuild } from './plan-build';

const registry = createJavaBlockRegistry();

describe('planner performance', () => {
  it('plans ~50 000 blocks in under 5 s', () => {
    const doc = generateCity(registry);
    expect(doc.volume.blockCount).toBeGreaterThanOrEqual(50_000);
    const start = Date.now();
    const plan = planBuild(doc, registry);
    const millis = Date.now() - start;
    console.log(
      `planBuild: ${plan.stats.blocks} blocks, ${plan.stats.placements} placements, ` +
        `${plan.stats.removals} removals, ${plan.steps.length} steps, ` +
        `${plan.warnings.length} warnings in ${millis} ms`,
    );
    expect(plan.stats.blocks).toBe(doc.volume.blockCount);
    expect(millis).toBeLessThan(5000);
  }, 60_000);
});
