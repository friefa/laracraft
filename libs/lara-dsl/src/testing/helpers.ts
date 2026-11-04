import {
  AIR,
  type BlockRegistry,
  type BlockStateString,
  BuildDocument,
  type BuildMetadata,
  type ChangeSet,
  canonicalBlockState,
  createJavaBlockRegistry,
} from '@laracraft/core-model';
import type { Pos } from '../lib/types';
import {
  createModuleCatalogue,
  type DslModule,
  type ModuleCatalogue,
  orientModuleBlocks,
} from '../lib/validate/module-catalogue';

/** Test-only helpers (not exported from the package). */

export const META: BuildMetadata = {
  name: 'test',
  dataVersion: 4189,
  edition: 'java',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

export const registry: BlockRegistry = createJavaBlockRegistry();

export const s = (state: string): BlockStateString => {
  const r = canonicalBlockState(state.includes(':') ? state : `minecraft:${state}`);
  // Fill defaults so tests can write short states.
  const def = registry.get(r.replace(/\[.*$/, ''));
  if (!def) throw new Error(`unknown ${state}`);
  const props: Record<string, string> = {};
  for (const [k, p] of Object.entries(def.properties)) props[k] = p.default;
  const m = /\[(.*)\]$/.exec(r);
  for (const pair of m?.[1]?.split(',') ?? []) {
    const [k, v] = pair.split('=') as [string, string];
    props[k] = v;
  }
  const keys = Object.keys(props).sort();
  return (
    keys.length ? `${def.id}[${keys.map((k) => `${k}=${props[k]}`).join(',')}]` : def.id
  ) as BlockStateString;
};

export function newDoc(cells: readonly { pos: Pos; state: string }[] = []): BuildDocument {
  const doc = new BuildDocument({ ...META });
  for (const c of cells) doc.setBlock(c.pos, s(c.state));
  return doc;
}

export const key = (p: Pos): string => `${p.x},${p.y},${p.z}`;

/** Resulting non-air cells after applying a change set to a copy of the document's cells. */
export function resultCells(
  doc: BuildDocument,
  changeSet: ChangeSet,
): Map<string, BlockStateString> {
  const cells = new Map<string, BlockStateString>();
  doc.volume.forEachBlock((x, y, z, index) => {
    if (index !== 0) cells.set(key({ x, y, z }), doc.palette.stateAt(index));
  });
  for (const c of changeSet.changes) {
    if (c.after === AIR) cells.delete(key(c.pos));
    else cells.set(key(c.pos), c.after);
  }
  return cells;
}

/** Sorted "x,y,z=state" lines of a cell map (for snapshot-like comparisons). */
export const dump = (cells: ReadonlyMap<string, string>): string[] =>
  [...cells].map(([k, v]) => `${k}=${v}`).sort();

/**
 * A tiny module catalogue: a 3-block fake "door" authored facing north (oriented with
 * `orientModuleBlocks`), a module producing an invalid block and one whose build throws.
 */
export const testModules: ModuleCatalogue = createModuleCatalogue([
  {
    id: 'piston_door_2x2',
    size: { x: 2, y: 2, z: 1 },
    validateParams: (params) =>
      Object.keys(params)
        .filter((k) => k !== 'sticky')
        .map((k) => `unknown parameter "${k}"`),
    build: (params, facing) =>
      orientModuleBlocks(
        registry,
        [
          {
            offset: { x: 0, y: 0, z: 0 },
            state: params['sticky']
              ? 'minecraft:sticky_piston[facing=north]'
              : 'minecraft:piston[facing=north]',
          },
          { offset: { x: 1, y: 0, z: 0 }, state: 'minecraft:observer[facing=north]' },
          { offset: { x: 0, y: 1, z: 1 }, state: 'minecraft:oak_stairs[facing=north]' },
        ],
        facing,
      ),
  } satisfies DslModule,
  {
    id: 'broken',
    size: { x: 1, y: 1, z: 1 },
    build: () => [{ offset: { x: 0, y: 0, z: 0 }, state: 'minecraft:nope' }],
  },
  {
    id: 'throws',
    size: { x: 1, y: 1, z: 1 },
    build: () => {
      throw new Error('size must be even');
    },
  },
]);
