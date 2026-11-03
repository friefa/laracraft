import { AIR, type BlockStateString } from '../blockstate/blockstate';

/** Index into a {@link BlockPalette}. Index 0 is always `minecraft:air`. */
export type PaletteIndex = number;

export const AIR_INDEX: PaletteIndex = 0;

/** Upper bound of distinct states per document (Uint16 storage). */
export const MAX_PALETTE_SIZE = 65535;

/**
 * Append-only mapping between canonical blockstate strings and small integer
 * indices. Entries are never removed while a document is open, so indices
 * stored in undo history stay valid. Compaction happens on serialization.
 */
export class BlockPalette {
  private readonly states: BlockStateString[] = [AIR];
  private readonly indexByState = new Map<BlockStateString, PaletteIndex>([[AIR, AIR_INDEX]]);

  /** Returns the index for a state, adding it if necessary. State must be canonical. */
  intern(state: BlockStateString): PaletteIndex {
    const existing = this.indexByState.get(state);
    if (existing !== undefined) return existing;
    if (this.states.length >= MAX_PALETTE_SIZE) throw new RangeError('Palette is full');
    const index = this.states.length;
    this.states.push(state);
    this.indexByState.set(state, index);
    return index;
  }

  indexOf(state: BlockStateString): PaletteIndex | undefined {
    return this.indexByState.get(state);
  }

  stateAt(index: PaletteIndex): BlockStateString {
    const s = this.states[index];
    if (s === undefined) throw new RangeError(`Palette index ${index} out of range`);
    return s;
  }

  get size(): number {
    return this.states.length;
  }

  entries(): readonly BlockStateString[] {
    return this.states;
  }
}
