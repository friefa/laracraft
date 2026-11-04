import {
  createJavaBlockRegistry,
  parseBlockState,
  resolveBlockState,
  vec3Key,
  type Vec3,
} from '@laracraft/core-model';
import type { Scenario } from '../lib/api';
import { JAVA_SCENARIOS, SCENARIO_GROUPS } from './index';

const registry = createJavaBlockRegistry();

const isSanePos = (pos: Vec3): boolean =>
  [pos.x, pos.y, pos.z].every(Number.isInteger) &&
  Math.abs(pos.x) <= 32 &&
  Math.abs(pos.z) <= 32 &&
  pos.y >= 0 &&
  pos.y <= 16;

/** Block ids that are at `pos` at some point of the scenario (initial or placed). */
function idsAt(scenario: Scenario, pos: Vec3): Set<string> {
  const key = vec3Key(pos);
  const ids = new Set<string>();
  for (const block of scenario.blocks) {
    if (vec3Key(block.pos) === key) ids.add(parseBlockState(block.state).id);
  }
  for (const step of scenario.steps) {
    if ('do' in step && step.do.kind === 'place' && vec3Key(step.do.pos) === key) {
      ids.add(parseBlockState(step.do.state).id);
    }
  }
  return ids;
}

const cases = JAVA_SCENARIOS.map((s) => [s.name, s] as const);

describe('Java redstone scenarios (data)', () => {
  it('has at least 60 scenarios with unique kebab-case names', () => {
    expect(JAVA_SCENARIOS.length).toBeGreaterThanOrEqual(60);
    const names = JAVA_SCENARIOS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('covers every mechanic group', () => {
    for (const [group, list] of Object.entries(SCENARIO_GROUPS)) {
      expect(list.length, group).toBeGreaterThanOrEqual(4);
    }
  });

  describe.each(cases)('%s', (_name, scenario) => {
    it('has a description and a minecraft.wiki source', () => {
      expect(scenario.description.length).toBeGreaterThan(20);
      expect(scenario.source).toMatch(/^https:\/\/minecraft\.wiki\/w\/[A-Za-z0-9_:%().-]+$/);
    });

    it('uses only blockstates the Java registry resolves', () => {
      const states = [
        ...scenario.blocks.map((b) => b.state),
        ...scenario.steps.flatMap((s) => ('do' in s && s.do.kind === 'place' ? [s.do.state] : [])),
        ...scenario.steps.flatMap((s) =>
          'expect' in s && s.expect.kind === 'state' ? [s.expect.state] : [],
        ),
      ];
      for (const state of states) {
        const resolved = resolveBlockState(registry, state);
        expect(resolved.ok ? true : resolved.error, state).toBe(true);
      }
    });

    it('has sane, unique positions and its lowest layer at y=0', () => {
      const keys = scenario.blocks.map((b) => vec3Key(b.pos));
      expect(new Set(keys).size).toBe(keys.length);
      for (const block of scenario.blocks)
        expect(isSanePos(block.pos), vec3Key(block.pos)).toBe(true);
      expect(Math.min(...scenario.blocks.map((b) => b.pos.y))).toBe(0);
      for (const step of scenario.steps) {
        const pos = 'do' in step ? ('pos' in step.do ? step.do.pos : undefined) : step.expect.pos;
        if (pos) expect(isSanePos(pos), vec3Key(pos)).toBe(true);
      }
    });

    it('has non-negative integer ticks in ascending order and at least one expectation', () => {
      const ticks = scenario.steps.map((s) => s.at);
      for (const t of ticks) expect(Number.isInteger(t) && t >= 0).toBe(true);
      expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
      expect(scenario.steps.some((s) => 'expect' in s)).toBe(true);
    });

    it('targets existing blocks with stimuli and valid properties with expectations', () => {
      for (const step of scenario.steps) {
        if ('do' in step) {
          const d = step.do;
          if (
            d.kind === 'use' ||
            d.kind === 'step-on' ||
            d.kind === 'step-off' ||
            d.kind === 'break'
          ) {
            expect(idsAt(scenario, d.pos).size, `${d.kind} ${vec3Key(d.pos)}`).toBeGreaterThan(0);
          }
          if (d.kind === 'insert-items') {
            expect(d.count).toBeGreaterThan(0);
            expect(idsAt(scenario, d.pos).size).toBeGreaterThan(0);
          }
          if (d.kind === 'set-daylight') {
            expect(Number.isInteger(d.level) && d.level >= 0 && d.level <= 15).toBe(true);
          }
          continue;
        }
        const e = step.expect;
        if (e.kind === 'props') {
          const ids = [...idsAt(scenario, e.pos)];
          expect(ids.length, `props at ${vec3Key(e.pos)}`).toBeGreaterThan(0);
          for (const [key, value] of Object.entries(e.props)) {
            const ok = ids.some((id) => registry.get(id)?.properties[key]?.values.includes(value));
            expect(ok, `${ids.join('|')}.${key}=${value}`).toBe(true);
          }
        }
        if (e.kind === 'power') expect(e.level >= 0 && e.level <= 15).toBe(true);
        if (e.kind === 'items') expect(e.count).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
