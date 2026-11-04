import {
  type BlockRegistry,
  type BlockStateString,
  canonicalBlockState,
  rotateStateY,
} from '@laracraft/core-model';
import type { HorizontalFacing, Pos } from '../types';

/**
 * Minimal module catalogue the DSL needs for `insertModule`. Implemented by
 * `@laracraft/redstone-modules` (built separately); the DSL only depends on this shape.
 */
export type ModuleParams = Readonly<Record<string, string | number | boolean>>;

export interface ModuleBlock {
  /** Offset from the module anchor (`InsertModuleOp.pos`), already oriented for `facing`. */
  readonly offset: Pos;
  /** Blockstate string; resolved and validated against the registry by the DSL. */
  readonly state: string;
}

export interface DslModule {
  readonly id: string;
  /** Bounding size of the module (informational; the DSL checks the built blocks). */
  readonly size: Pos;
  /**
   * Builds the module for the given parameters and orientation. May throw for invalid
   * params; the DSL reports that as `module-params`. See {@link orientModuleBlocks} for
   * modules authored in one orientation.
   */
  build(params: ModuleParams, facing: HorizontalFacing): readonly ModuleBlock[];
  /** Optional parameter check; each returned message becomes a `module-params` error. */
  validateParams?(params: ModuleParams): readonly string[];
}

export interface ModuleCatalogue {
  get(id: string): DslModule | undefined;
  /** Optional: all module ids, used to suggest alternatives for unknown ids. */
  ids?(): readonly string[];
}

const TURNS: Readonly<Record<HorizontalFacing, number>> = { north: 0, east: 1, south: 2, west: 3 };

/** Clockwise quarter turns from north to `facing`. */
export const facingTurns = (facing: HorizontalFacing): number => TURNS[facing];

/**
 * Helper for module authors: orients blocks authored facing **north** to `facing` by
 * rotating offsets clockwise around the anchor (0, 0, 0) and the blockstates with
 * `rotateStateY`.
 */
export function orientModuleBlocks(
  registry: BlockRegistry,
  blocks: readonly ModuleBlock[],
  facing: HorizontalFacing,
): ModuleBlock[] {
  const turns = TURNS[facing];
  return blocks.map(({ offset, state }) => {
    let { x, z } = offset;
    for (let i = 0; i < turns; i++) [x, z] = [-z, x];
    const rotated = rotateStateY(registry, canonicalBlockState(state) as BlockStateString, turns);
    return { offset: { x: x + 0, y: offset.y, z: z + 0 }, state: rotated };
  });
}

/** Simple in-memory catalogue (tests, fixtures). */
export function createModuleCatalogue(modules: readonly DslModule[]): ModuleCatalogue {
  const byId = new Map(modules.map((m) => [m.id, m]));
  const ids = [...byId.keys()].sort();
  return { get: (id) => byId.get(id), ids: () => ids };
}
