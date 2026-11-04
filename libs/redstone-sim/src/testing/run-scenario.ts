import {
  BuildDocument,
  JAVA_DATA_VERSION,
  parseBlockState,
  resolveBlockState,
  type BlockRegistry,
  type Vec3,
} from '@laracraft/core-model';
import type { CreateSimulationFn, Scenario, ScenarioStep, Simulation } from '../lib/api';

export type MismatchKind = 'setup' | 'error' | 'state' | 'props' | 'powered' | 'power' | 'items';

export interface ScenarioMismatch {
  /** Scenario tick (relative to the start after the initial settle). */
  readonly tick: number;
  readonly kind: MismatchKind;
  readonly pos?: Vec3;
  readonly expected: string;
  readonly actual: string;
  readonly message: string;
}

export interface ScenarioResult {
  readonly name: string;
  readonly passed: boolean;
  /** Number of expectations that were evaluated. */
  readonly checks: number;
  readonly mismatches: readonly ScenarioMismatch[];
}

export interface RunScenarioOptions {
  /** Upper bound for the initial `settle` (default 200 gt). */
  readonly settleTicks?: number;
}

type ExpectStep = Extract<ScenarioStep, { expect: unknown }>;

const fmtPos = (pos: Vec3): string => `(${pos.x},${pos.y},${pos.z})`;

/** Canonical full state (defaults filled in) when the registry knows it; else the input. */
function normalizeState(registry: BlockRegistry, state: string): string {
  const resolved = resolveBlockState(registry, state);
  return resolved.ok ? resolved.state : state;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function checkExpectation(
  sim: Simulation,
  registry: BlockRegistry,
  step: ExpectStep,
): ScenarioMismatch | undefined {
  const exp = step.expect;
  const at = step.at;
  const where = fmtPos(exp.pos);
  const miss = (expected: string, actual: string): ScenarioMismatch => ({
    tick: at,
    kind: exp.kind,
    pos: exp.pos,
    expected,
    actual,
    message: `t=${at} ${exp.kind} at ${where}: expected ${expected}, got ${actual}`,
  });

  switch (exp.kind) {
    case 'state': {
      const expected = normalizeState(registry, exp.state);
      const actual = normalizeState(registry, sim.getState(exp.pos));
      return expected === actual ? undefined : miss(expected, actual);
    }
    case 'props': {
      const raw = sim.getState(exp.pos);
      let actualProps: Readonly<Record<string, string>>;
      try {
        actualProps = parseBlockState(normalizeState(registry, raw)).properties;
      } catch {
        actualProps = {};
      }
      const wrong = Object.entries(exp.props).filter(
        ([key, value]) => !Object.hasOwn(actualProps, key) || actualProps[key] !== value,
      );
      if (wrong.length === 0) return undefined;
      const expected = wrong.map(([k, v]) => `${k}=${v}`).join(',');
      const actual = wrong
        .map(([k]) => `${k}=${Object.hasOwn(actualProps, k) ? actualProps[k] : '<missing>'}`)
        .join(',');
      return miss(expected, `${actual} (${raw})`);
    }
    case 'powered': {
      const actual = sim.isPowered(exp.pos);
      return actual === exp.value ? undefined : miss(String(exp.value), String(actual));
    }
    case 'power': {
      const actual = sim.getReceivedPower(exp.pos);
      return actual === exp.level ? undefined : miss(String(exp.level), String(actual));
    }
    case 'items': {
      const container = sim.getContainer(exp.pos);
      if (!container) return miss(`${exp.count} x ${exp.item}`, 'no container');
      let count = 0;
      for (const slot of container.slots) if (slot && slot.item === exp.item) count += slot.count;
      return count === exp.count
        ? undefined
        : miss(`${exp.count} x ${exp.item}`, `${count} x ${exp.item}`);
    }
  }
}

/**
 * Runs one behaviour scenario against a simulator implementation.
 *
 * 1. Builds a document from `scenario.blocks` (states resolved against `registry`).
 * 2. Creates the simulation (Java edition) and settles it.
 * 3. Walks the steps in tick order; steps with the same `at` run in their listed order.
 *    Before a step at tick `t` the simulation is advanced to scenario tick `t`; stimuli are
 *    then applied and expectations checked against the current view.
 *
 * Never throws because of a mismatch or a simulator error: everything is reported in
 * `mismatches` (a simulator exception ends the run with an `error` entry).
 */
export function runScenario(
  create: CreateSimulationFn,
  scenario: Scenario,
  registry: BlockRegistry,
  options: RunScenarioOptions = {},
): ScenarioResult {
  const mismatches: ScenarioMismatch[] = [];
  let checks = 0;
  const result = (): ScenarioResult => ({
    name: scenario.name,
    passed: mismatches.length === 0,
    checks,
    mismatches,
  });

  const doc = new BuildDocument({
    name: scenario.name,
    dataVersion: JAVA_DATA_VERSION,
    edition: 'java',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  });
  for (const block of scenario.blocks) {
    const resolved = resolveBlockState(registry, block.state);
    if (!resolved.ok) {
      mismatches.push({
        tick: 0,
        kind: 'setup',
        pos: block.pos,
        expected: 'valid blockstate',
        actual: block.state,
        message: `invalid block at ${fmtPos(block.pos)}: ${resolved.error}`,
      });
      continue;
    }
    doc.setBlock(block.pos, resolved.state);
  }
  if (mismatches.length > 0) return result();

  let sim: Simulation;
  let start: number;
  try {
    sim = create(doc, registry, { edition: 'java' });
    sim.settle(options.settleTicks ?? 200);
    start = sim.tick;
  } catch (e) {
    mismatches.push({
      tick: 0,
      kind: 'error',
      expected: 'simulation created and settled',
      actual: errorMessage(e),
      message: `simulator threw during setup: ${errorMessage(e)}`,
    });
    return result();
  }

  // Stable sort by tick so that steps listed out of order still run correctly.
  const steps = scenario.steps
    .map((step, index) => ({ step, index }))
    .sort((a, b) => a.step.at - b.step.at || a.index - b.index)
    .map(({ step }) => step);

  for (const step of steps) {
    try {
      const behind = step.at - (sim.tick - start);
      if (behind > 0) sim.step(behind);
      if ('do' in step) {
        sim.apply(step.do);
      } else {
        checks++;
        const mismatch = checkExpectation(sim, registry, step);
        if (mismatch) mismatches.push(mismatch);
      }
    } catch (e) {
      mismatches.push({
        tick: step.at,
        kind: 'error',
        expected: 'no exception',
        actual: errorMessage(e),
        message: `simulator threw at t=${step.at}: ${errorMessage(e)}`,
      });
      return result();
    }
  }
  return result();
}

/** One-line-per-mismatch report, handy in assertion messages. */
export function formatScenarioResult(result: ScenarioResult): string {
  if (result.passed) return `${result.name}: ok (${result.checks} checks)`;
  return [`${result.name}: ${result.mismatches.length} mismatch(es)`]
    .concat(result.mismatches.map((m) => `  ${m.message}`))
    .join('\n');
}
