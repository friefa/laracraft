import { createJavaBlockRegistry } from '@laracraft/core-model';
import type { CreateSimulationFn } from '../lib/api';
import { JAVA_SCENARIOS, formatScenarioResult, runScenario } from './index';

/*
 * Oracle run: every Java scenario against the library's own simulator. The simulator is
 * developed independently; until the library exports `createSimulation` this suite is
 * skipped (relative dynamic import inside the same lib, so no Nx boundary is crossed).
 */
const lib: Record<string, unknown> = await import('../index');
const exported = lib['createSimulation'];
const createSimulation =
  typeof exported === 'function' ? (exported as CreateSimulationFn) : undefined;

const SKIP_REASON =
  'skipped: @laracraft/redstone-sim does not export createSimulation yet (scenarios are ready)';

describe.skipIf(createSimulation === undefined)(
  'Java redstone scenarios vs createSimulation',
  () => {
    const registry = createJavaBlockRegistry();
    it.each(JAVA_SCENARIOS.map((s) => [s.name, s] as const))('%s', (_name, scenario) => {
      const result = runScenario(createSimulation as CreateSimulationFn, scenario, registry);
      expect(result.passed, formatScenarioResult(result)).toBe(true);
    });
  },
);

describe.runIf(createSimulation === undefined)(
  'Java redstone scenarios vs createSimulation',
  () => {
    it.skip(SKIP_REASON, () => undefined);
  },
);
