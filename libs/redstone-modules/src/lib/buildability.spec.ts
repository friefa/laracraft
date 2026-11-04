import { planBuild, validatePlan } from '@laracraft/build-order';
import {
  BuildDocument,
  createJavaBlockRegistry,
  type BlockStateString,
  type BuildMetadata,
} from '@laracraft/core-model';
import { MODULE_CATALOGUE } from './catalogue';
import { placeModule } from './define';
import type { ModuleFacing, ModuleParams, RedstoneModule } from './types';

/**
 * Buildability gate: every module, in every facing, placed on a stone floor must give a
 * survival build plan that the independent validator accepts with zero issues, and the
 * planner must not report states a player cannot produce (`unsupported-state`) or any
 * other warning.
 */
const registry = createJavaBlockRegistry();
const FACINGS: readonly ModuleFacing[] = ['north', 'east', 'south', 'west'];
const FLOOR = 'minecraft:stone' as BlockStateString;
const MARGIN = 3;

function documentWith(
  m: RedstoneModule,
  facing: ModuleFacing,
  params?: ModuleParams,
): BuildDocument {
  const meta: BuildMetadata = {
    name: `module ${m.id}`,
    dataVersion: 5023,
    edition: 'java',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  const doc = new BuildDocument(meta);
  const blocks = placeModule(m, { x: 0, y: 0, z: 0 }, facing, params);
  const xs = blocks.map((b) => b.pos.x);
  const zs = blocks.map((b) => b.pos.z);
  for (let x = Math.min(...xs) - MARGIN; x <= Math.max(...xs) + MARGIN; x++) {
    for (let z = Math.min(...zs) - MARGIN; z <= Math.max(...zs) + MARGIN; z++) {
      doc.setBlock({ x, y: -1, z }, FLOOR);
    }
  }
  for (const b of blocks) doc.setBlock(b.pos, b.state as BlockStateString);
  return doc;
}

/** Default params plus every enum value (integer params only change interaction counts). */
function variants(m: RedstoneModule): ModuleParams[] {
  const out: ModuleParams[] = [{}];
  for (const [name, spec] of Object.entries(m.params ?? {})) {
    if (spec.type === 'string') {
      for (const v of spec.enum) if (v !== spec.default) out.push({ [name]: v });
    }
    if (spec.type === 'integer' && spec.maximum !== spec.default)
      out.push({ [name]: spec.maximum });
  }
  return out;
}

const cases = MODULE_CATALOGUE.all().flatMap((m) =>
  FACINGS.flatMap((facing) =>
    variants(m).map(
      (params) => [`${m.id} ${facing} ${JSON.stringify(params)}`, m, facing, params] as const,
    ),
  ),
);

describe('modules plan and validate on a stone floor', () => {
  it.each(cases)('%s', (_label, m, facing, params) => {
    const doc = documentWith(m, facing, params);
    const plan = planBuild(doc, registry);
    expect(plan.warnings).toEqual([]);
    expect(validatePlan(doc, registry, plan)).toEqual([]);
    expect(plan.stats.blocks).toBeGreaterThan(0);
  });
});
