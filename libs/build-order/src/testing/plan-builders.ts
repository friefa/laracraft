import {
  BuildDocument,
  createJavaBlockRegistry,
  resolveBlockState,
  type BlockStateString,
  type Direction,
  type HorizontalDirection,
  type Vec3,
} from '@laracraft/core-model';
import type {
  BuildPhase,
  BuildPlan,
  BuildStep,
  PlaceAction,
  RemoveAction,
  StepAction,
} from '../lib/types';

/** Helpers for hand-written plans in specs (validator rule tests, planner tests). */

export const registry = createJavaBlockRegistry();

/** Canonical, fully specified state (throws on typos). */
export function st(state: string): BlockStateString {
  const r = resolveBlockState(registry, state);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

export const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export function docOf(blocks: readonly (readonly [number, number, number, string])[]) {
  const doc = new BuildDocument({
    name: 'spec',
    dataVersion: 4189,
    edition: 'java',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  });
  for (const [x, y, z, s] of blocks) doc.setBlock({ x, y, z }, st(s));
  return doc;
}

export interface PlaceOptions {
  standAt?: Vec3;
  look?: { horizontal: HorizontalDirection; vertical?: 'up' | 'level' | 'down' };
  clickOn?: { pos: Vec3; face: Direction };
  clickHalf?: 'top' | 'bottom';
  sneak?: boolean;
  interactions?: number;
  temporary?: boolean;
}

/**
 * A placement with convenient defaults: click the top face of the block below,
 * stand two blocks south of `pos` at the same height, look north and down.
 */
export function place(pos: Vec3, state: string, o: PlaceOptions = {}): PlaceAction {
  const s = st(state);
  return {
    kind: 'place',
    pos,
    state: s,
    item: s.replace(/\[.*$/, ''),
    standAt: o.standAt ?? v(pos.x, pos.y, pos.z + 2),
    look: { horizontal: o.look?.horizontal ?? 'north', vertical: o.look?.vertical ?? 'down' },
    clickOn: o.clickOn ?? { pos: v(pos.x, pos.y - 1, pos.z), face: 'up' },
    ...(o.clickHalf ? { clickHalf: o.clickHalf } : {}),
    ...(o.sneak ? { sneak: true } : {}),
    ...(o.interactions !== undefined ? { interactions: o.interactions } : {}),
    ...(o.temporary ? { temporary: true } : {}),
  };
}

export function remove(pos: Vec3, state: string): RemoveAction {
  return { kind: 'remove', pos, state: st(state), reason: 'temporary-support' };
}

export function step(phase: BuildPhase, ...actions: StepAction[]): BuildStep {
  return { index: 0, phase, actions, materials: [], hints: [], yRange: [0, 0] };
}

export function planOf(...steps: BuildStep[]): BuildPlan {
  return {
    steps: steps.map((s, index) => ({ ...s, index })),
    totalMaterials: [],
    temporaryMaterials: [],
    warnings: [],
    stats: { blocks: 0, placements: 0, removals: 0, millis: 0 },
  };
}
