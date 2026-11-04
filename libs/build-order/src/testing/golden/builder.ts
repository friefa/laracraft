import {
  BuildDocument,
  resolveBlockState,
  type BlockRegistry,
  type BuildMetadata,
} from '@laracraft/core-model';

/** A reference build for golden tests of the planner and the validator. */
export interface GoldenBuild {
  /** Stable identifier, e.g. `house`. */
  readonly name: string;
  /** What the build contains and which build-order rules it exercises. */
  readonly description: string;
  /** Builds a fresh document (callers may mutate it). */
  readonly create: (registry: BlockRegistry) => BuildDocument;
}

/**
 * Small helper to author golden documents. Every state goes through
 * `resolveBlockState`, so missing properties get their registry defaults and a
 * typo fails loudly instead of producing an unknown block.
 */
export class GoldenDocBuilder {
  readonly doc: BuildDocument;

  constructor(
    private readonly registry: BlockRegistry,
    name: string,
    description: string,
  ) {
    const meta: BuildMetadata = {
      name,
      description,
      dataVersion: 4189,
      edition: 'java',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      tags: ['golden'],
    };
    this.doc = new BuildDocument(meta);
  }

  /** Sets one block; `state` may omit properties that have their default value. */
  set(x: number, y: number, z: number, state: string): this {
    const resolved = resolveBlockState(this.registry, state);
    if (!resolved.ok) throw new Error(`Golden build: ${resolved.error}`);
    this.doc.setBlock({ x, y, z }, resolved.state);
    return this;
  }

  /** Fills the inclusive box with one state. */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, state: string) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, z, state);
      }
    }
    return this;
  }

  /** Clears one position back to air. */
  clear(x: number, y: number, z: number): this {
    return this.set(x, y, z, 'minecraft:air');
  }
}
