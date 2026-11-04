/** Dev check: plans the generated 50k-block city and validates it. Usage: tsx --tsconfig tsconfig.base.json libs/build-order/scripts/validate-city.ts */
import { createJavaBlockRegistry } from '@laracraft/core-model';
import { planBuild, validatePlan } from '../src/index';
import { generateCity } from '../src/testing/city';

const registry = createJavaBlockRegistry();
const doc = generateCity(registry);
const t = Date.now();
const plan = planBuild(doc, registry);
const issues = validatePlan(doc, registry, plan);
const byRule: Record<string, number> = {};
for (const i of issues) byRule[i.rule] = (byRule[i.rule] ?? 0) + 1;
console.log(
  `blocks=${plan.stats.blocks} placements=${plan.stats.placements} removals=${plan.stats.removals} steps=${plan.steps.length} warnings=${plan.warnings.length} issues=${issues.length} ${JSON.stringify(byRule)} ms=${Date.now() - t}`,
);
for (const i of issues.slice(0, 5)) console.log(JSON.stringify(i));
