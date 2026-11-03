/**
 * Java Edition blockstate handling.
 *
 * Canonical string form: `namespace:id[key=value,...]` with properties sorted
 * alphabetically by key and no whitespace. A state without properties has no
 * brackets. Example: `minecraft:oak_stairs[facing=east,half=bottom,shape=straight,waterlogged=false]`.
 */

/** Canonical blockstate string (see module docs). Branded to avoid mixing with plain ids. */
export type BlockStateString = string & { readonly __brand: 'BlockStateString' };

/** Namespaced block id, e.g. `minecraft:stone`. */
export type BlockId = string;

export interface BlockState {
  readonly id: BlockId;
  readonly properties: Readonly<Record<string, string>>;
}

export const AIR_ID: BlockId = 'minecraft:air';
export const AIR = 'minecraft:air' as BlockStateString;

const ID_RE = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const KEY_RE = /^[a-z0-9_]+$/;
const VALUE_RE = /^[a-z0-9_]+$/;

export class BlockStateParseError extends Error {
  constructor(input: string, reason: string) {
    super(`Invalid blockstate "${input}": ${reason}`);
    this.name = 'BlockStateParseError';
  }
}

/** Parses a blockstate string. A missing namespace defaults to `minecraft:`. */
export function parseBlockState(input: string): BlockState {
  const trimmed = input.trim();
  const bracket = trimmed.indexOf('[');
  let id = bracket === -1 ? trimmed : trimmed.slice(0, bracket);
  if (!id.includes(':')) id = `minecraft:${id}`;
  if (!ID_RE.test(id)) throw new BlockStateParseError(input, 'malformed id');

  const properties: Record<string, string> = {};
  if (bracket !== -1) {
    if (!trimmed.endsWith(']')) throw new BlockStateParseError(input, 'missing closing "]"');
    const body = trimmed.slice(bracket + 1, -1);
    if (body.length > 0) {
      for (const pair of body.split(',')) {
        const eq = pair.indexOf('=');
        if (eq === -1) throw new BlockStateParseError(input, `property "${pair}" has no "="`);
        const key = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (!KEY_RE.test(key)) throw new BlockStateParseError(input, `bad key "${key}"`);
        if (!VALUE_RE.test(value)) throw new BlockStateParseError(input, `bad value "${value}"`);
        if (Object.prototype.hasOwnProperty.call(properties, key)) {
          throw new BlockStateParseError(input, `duplicate key "${key}"`);
        }
        properties[key] = value;
      }
    }
  }
  return { id, properties };
}

/** Serializes to the canonical string form (sorted keys). */
export function stringifyBlockState(state: BlockState): BlockStateString {
  const keys = Object.keys(state.properties).sort();
  if (keys.length === 0) return state.id as BlockStateString;
  const body = keys.map((k) => `${k}=${state.properties[k]}`).join(',');
  return `${state.id}[${body}]` as BlockStateString;
}

/** Normalizes any accepted blockstate spelling to its canonical form. */
export function canonicalBlockState(input: string): BlockStateString {
  return stringifyBlockState(parseBlockState(input));
}

export function withProperties(
  state: BlockState,
  changes: Readonly<Record<string, string>>,
): BlockState {
  return { id: state.id, properties: { ...state.properties, ...changes } };
}
