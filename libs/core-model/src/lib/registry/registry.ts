import {
  type BlockId,
  type BlockState,
  type BlockStateString,
  isWellFormedBlockState,
  parseBlockState,
  stringifyBlockState,
} from '../blockstate/blockstate';
import type { BlockDefinition, BlockRegistry } from './types';

export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistryError';
  }
}

/** Builds an immutable registry and checks internal consistency of the data. */
export function createBlockRegistry(
  version: string,
  definitions: readonly BlockDefinition[],
): BlockRegistry {
  const byId = new Map<BlockId, BlockDefinition>();
  for (const def of definitions) {
    if (byId.has(def.id)) throw new RegistryError(`Duplicate block id ${def.id}`);
    for (const [name, prop] of Object.entries(def.properties)) {
      if (prop.values.length === 0) throw new RegistryError(`${def.id}.${name} has no values`);
      if (!prop.values.includes(prop.default)) {
        throw new RegistryError(`${def.id}.${name} default "${prop.default}" not in values`);
      }
    }
    for (const rule of def.placement ?? []) {
      if (!(rule.property in def.properties)) {
        throw new RegistryError(`${def.id} placement refers to unknown property ${rule.property}`);
      }
    }
    byId.set(def.id, def);
  }
  const all = Object.freeze([...byId.values()]);
  return {
    version,
    get: (id) => byId.get(id),
    has: (id) => byId.has(id),
    all: () => all,
  };
}

export type StateValidation =
  | { readonly ok: true; readonly state: BlockStateString }
  | { readonly ok: false; readonly error: string };

/**
 * Validates a blockstate against the registry and fills in defaults for
 * missing properties. Unknown properties or values are errors.
 * Returns the canonical, fully-specified state string.
 */
export function resolveBlockState(
  registry: BlockRegistry,
  input: string | BlockState,
): StateValidation {
  let state: BlockState;
  try {
    state = typeof input === 'string' ? parseBlockState(input) : input;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!isWellFormedBlockState(state)) return { ok: false, error: 'Malformed blockstate object' };
  const def = registry.get(state.id);
  if (!def) return { ok: false, error: `Unknown block ${state.id}` };
  const properties: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [key, value] of Object.entries(state.properties)) {
    const prop = Object.hasOwn(def.properties, key) ? def.properties[key] : undefined;
    if (!prop) return { ok: false, error: `${state.id} has no property "${key}"` };
    if (!prop.values.includes(value)) {
      return { ok: false, error: `${state.id}.${key} does not allow "${value}"` };
    }
    properties[key] = value;
  }
  for (const [key, prop] of Object.entries(def.properties)) {
    if (!Object.hasOwn(properties, key)) properties[key] = prop.default;
  }
  return { ok: true, state: stringifyBlockState({ id: state.id, properties }) };
}

/** Default (all-defaults) state of a block. */
export function defaultState(def: BlockDefinition): BlockStateString {
  const properties: Record<string, string> = {};
  for (const [key, prop] of Object.entries(def.properties)) properties[key] = prop.default;
  return stringifyBlockState({ id: def.id, properties });
}
