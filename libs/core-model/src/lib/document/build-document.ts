import type { BlockStateString } from '../blockstate/blockstate';
import type { Vec3 } from '../math/vec3';
import { ChunkedVolume } from './chunked-volume';
import { BlockPalette } from './palette';

/** Edition the document targets. Only `java` is supported; Bedrock is a later hint layer. */
export type Edition = 'java';

export interface BuildMetadata {
  name: string;
  description?: string;
  /** Java Edition data version the blockstates were authored against (e.g. 4189). */
  dataVersion: number;
  edition: Edition;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  /** Remix provenance (M4). */
  remixOf?: { readonly buildId: string; readonly author?: string };
  tags?: string[];
}

/** One block change. `before`/`after` are canonical states (air = `minecraft:air`). */
export interface BlockChange {
  readonly pos: Vec3;
  readonly before: BlockStateString;
  readonly after: BlockStateString;
}

/**
 * Atomic edit = one undo step. Produced by editor tools and by the Lara DSL
 * interpreter alike, so both share one undo history.
 */
export interface ChangeSet {
  readonly changes: readonly BlockChange[];
  /** Who produced it, for UI and analytics. */
  readonly origin: 'user' | 'lara' | 'import' | 'system';
  /** Short human-readable label, e.g. "Füllen" or a Lara operation summary. */
  readonly label?: string;
}

/** The in-memory build. Mutate only via {@link BuildDocument.apply}. */
export class BuildDocument {
  readonly palette = new BlockPalette();
  readonly volume = new ChunkedVolume();

  constructor(public metadata: BuildMetadata) {}

  getBlock(x: number, y: number, z: number): BlockStateString {
    return this.palette.stateAt(this.volume.get(x, y, z));
  }

  /**
   * Sets one block and returns the change actually made (or undefined when it
   * was a no-op). The state must already be canonical and registry-valid;
   * validation is the caller's job (editor tools / DSL interpreter).
   */
  setBlock(pos: Vec3, state: BlockStateString): BlockChange | undefined {
    const index = this.palette.intern(state);
    const previous = this.volume.set(pos.x, pos.y, pos.z, index);
    if (previous === index) return undefined;
    return { pos, before: this.palette.stateAt(previous), after: state };
  }

  /**
   * Applies a change set by writing every `after` state. Returns the change set
   * that was effectively applied (`before` re-read from the document, no-ops
   * dropped), which is what belongs on the undo stack.
   */
  apply(changeSet: ChangeSet): ChangeSet {
    const applied: BlockChange[] = [];
    for (const change of changeSet.changes) {
      const c = this.setBlock(change.pos, change.after);
      if (c) applied.push(c);
    }
    return { ...changeSet, changes: applied };
  }
}

/** Inverse of a change set (for undo). Order is reversed so overlapping edits restore correctly. */
export function invertChangeSet(changeSet: ChangeSet): ChangeSet {
  const changes: BlockChange[] = [];
  for (let i = changeSet.changes.length - 1; i >= 0; i--) {
    const c = changeSet.changes[i] as BlockChange;
    changes.push({ pos: c.pos, before: c.after, after: c.before });
  }
  return { ...changeSet, changes };
}
