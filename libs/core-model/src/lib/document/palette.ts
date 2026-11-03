import { AIR, canonicalBlockState, type BlockStateString } from '../blockstate/blockstate';

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

  /**
   * Returns the index for a state, adding it if necessary. Non-canonical
   * spellings (`stone`, unsorted keys) are canonicalized, so two spellings of
   * the same state always share one index. Throws on malformed input.
   */
  intern(state: BlockStateString): PaletteIndex {
    const existing = this.indexByState.get(state);
    if (existing !== undefined) return existing;
    const canonical = canonicalBlockState(state);
    let index = this.indexByState.get(canonical);
    if (index === undefined) {
      if (this.states.length >= MAX_PALETTE_SIZE) throw new RangeError('Palette is full');
      index = this.states.length;
      this.states.push(canonical);
      this.indexByState.set(canonical, index);
    }
    // Remember the alias for fast lookups (bounded by distinct inputs seen).
    this.indexByState.set(state, index);
    return index;
  }

  indexOf(state: BlockStateString): PaletteIndex | undefined {
    const direct = this.indexByState.get(state);
    if (direct !== undefined) return direct;
    try {
      return this.indexByState.get(canonicalBlockState(state));
    } catch {
      return undefined;
    }
  }

  /** Number of additional distinct states that still fit. */
  get remainingCapacity(): number {
    return MAX_PALETTE_SIZE - this.states.length;
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
