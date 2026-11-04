import {
  BuildDocument,
  JAVA_DATA_VERSION,
  createJavaBlockRegistry,
  resolveBlockState,
  type BlockRegistry,
  type Vec3,
} from '@laracraft/core-model';
import { JavaSimulation } from './simulation';

/** Test support: build a simulation from `[x, y, z, state]` tuples (states resolved). */

let registry: BlockRegistry | undefined;
export const javaRegistry = (): BlockRegistry => (registry ??= createJavaBlockRegistry());

export type BlockTuple = readonly [number, number, number, string];

export function makeDoc(blocks: readonly { pos: Vec3; state: string }[]): BuildDocument {
  const doc = new BuildDocument({
    name: 'spec',
    dataVersion: JAVA_DATA_VERSION,
    edition: 'java',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  });
  for (const b of blocks) {
    const r = resolveBlockState(javaRegistry(), b.state);
    if (!r.ok) throw new Error(r.error);
    doc.setBlock(b.pos, r.state);
  }
  return doc;
}

export function simOf(blocks: readonly BlockTuple[], settle = true): JavaSimulation {
  const sim = new JavaSimulation(
    makeDoc(blocks.map(([x, y, z, state]) => ({ pos: { x, y, z }, state }))),
    javaRegistry(),
    { edition: 'java' },
  );
  if (settle) sim.settle(200);
  return sim;
}

export const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** Value of one property of the block at `pos`. */
export function prop(sim: JavaSimulation, pos: Vec3, name: string): string {
  const m = new RegExp(`[[,]${name}=([a-z0-9_]+)`).exec(sim.getState(pos));
  return m?.[1] ?? '';
}

/** Records `fn()` once per game tick for `ticks` ticks (sample taken after each tick). */
export function trace<T>(sim: JavaSimulation, ticks: number, fn: () => T): T[] {
  const out: T[] = [];
  for (let i = 0; i < ticks; i++) {
    sim.step();
    out.push(fn());
  }
  return out;
}

export const wire = (c: { n?: string; e?: string; s?: string; w?: string }, power = 0): string =>
  `minecraft:redstone_wire[east=${c.e ?? 'none'},north=${c.n ?? 'none'},power=${power},south=${c.s ?? 'none'},west=${c.w ?? 'none'}]`;

export const LAMP = 'minecraft:redstone_lamp[lit=false]';
export const LEVER = 'minecraft:lever[face=floor,facing=north,powered=false]';
export const STONE = 'minecraft:stone';
export const RB = 'minecraft:redstone_block';
export const repeater = (facing: string, delay = 1): string =>
  `minecraft:repeater[delay=${delay},facing=${facing},locked=false,powered=false]`;
