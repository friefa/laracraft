import type { BuildPlan, PlaceAction } from '@laracraft/build-order';
import {
  BuildDocument,
  type BlockStateString,
  type BuildMetadata,
  type Vec3,
} from '@laracraft/core-model';

/** Hand-written plan for unit tests (independent of the real planner). For tests only. */

const s = (v: string) => v as BlockStateString;
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const STONE = s('minecraft:stone');
export const DIRT = s('minecraft:dirt');
export const SAND = s('minecraft:sand');
export const STAIRS = s(
  'minecraft:oak_stairs[facing=north,half=bottom,shape=straight,waterlogged=false]',
);
export const PISTON = s('minecraft:piston[extended=false,facing=up]');
export const REPEATER = s('minecraft:repeater[delay=3,facing=north,locked=false,powered=false]');

const place = (
  pos: Vec3,
  state: BlockStateString,
  extra: Partial<PlaceAction> = {},
): PlaceAction => ({
  kind: 'place',
  pos,
  state,
  item: state.slice(0, state.includes('[') ? state.indexOf('[') : undefined),
  standAt: v(pos.x, 0, pos.z + 2),
  look: { horizontal: 'north', vertical: 'down' },
  clickOn: { pos: v(pos.x, pos.y - 1, pos.z), face: 'up' },
  ...extra,
});

export const FIXTURE_PLAN: BuildPlan = {
  steps: [
    {
      index: 0,
      phase: 'structure',
      actions: [
        place(v(0, 0, 0), STONE),
        place(v(1, 0, 0), STONE),
        place(v(2, 0, 0), DIRT, { temporary: true }),
      ],
      materials: [
        { item: 'minecraft:stone', count: 2 },
        { item: 'minecraft:dirt', count: 1 },
      ],
      hints: [{ code: 'temporary-support', positions: [v(2, 0, 0)] }],
      yRange: [0, 0],
    },
    {
      index: 1,
      phase: 'redstone',
      actions: [
        place(v(2, 1, 0), SAND),
        place(v(0, 1, 0), STAIRS, {
          look: { horizontal: 'north', vertical: 'level' },
          clickOn: { pos: v(0, 1, 1), face: 'north' },
          clickHalf: 'bottom',
        }),
        place(v(1, 1, 0), PISTON, { look: { horizontal: 'east', vertical: 'down' } }),
        place(v(1, 2, 0), REPEATER, { sneak: true, interactions: 2 }),
      ],
      materials: [
        { item: 'minecraft:sand', count: 1 },
        { item: 'minecraft:oak_stairs', count: 1 },
        { item: 'minecraft:piston', count: 1 },
        { item: 'minecraft:repeater', count: 1 },
      ],
      hints: [{ code: 'look-direction', positions: [v(1, 1, 0)] }, { code: 'interaction' }],
      yRange: [1, 2],
    },
    {
      index: 2,
      phase: 'cleanup',
      actions: [{ kind: 'remove', pos: v(2, 0, 0), state: DIRT, reason: 'temporary-support' }],
      materials: [],
      hints: [{ code: 'remove-temporary' }],
      yRange: [0, 0],
    },
  ],
  totalMaterials: [
    { item: 'minecraft:stone', count: 140 },
    { item: 'minecraft:sand', count: 1 },
    { item: 'minecraft:oak_stairs', count: 64 },
    { item: 'minecraft:piston', count: 1 },
    { item: 'minecraft:repeater', count: 1 },
  ],
  temporaryMaterials: [{ item: 'minecraft:dirt', count: 1 }],
  warnings: [{ code: 'unreachable', pos: v(5, 5, 5), message: 'no stand position' }],
  stats: { blocks: 6, placements: 7, removals: 1, millis: 3 },
};

export const FIXTURE_METADATA: BuildMetadata = {
  name: 'Fixture',
  edition: 'java',
  dataVersion: 4189,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};

/** The final build of {@link FIXTURE_PLAN} as a document. */
export function fixtureDocument(updatedAt = FIXTURE_METADATA.updatedAt): BuildDocument {
  const doc = new BuildDocument({ ...FIXTURE_METADATA, updatedAt });
  for (const step of FIXTURE_PLAN.steps) {
    for (const a of step.actions) {
      if (a.kind === 'place' && !a.temporary) doc.setBlock(a.pos, a.state);
    }
  }
  return doc;
}
