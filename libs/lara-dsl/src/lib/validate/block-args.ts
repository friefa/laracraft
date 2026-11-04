import {
  AIR_ID,
  type BlockDefinition,
  type BlockRegistry,
  type BlockState,
  type BlockStateString,
  parseBlockState,
  resolveBlockState,
} from '@laracraft/core-model';
import type { DslError } from '../types';

/**
 * Block argument resolution with model-friendly errors.
 *
 * Two kinds of block arguments:
 * - **states** (what is written): resolved via `resolveBlockState` to a canonical,
 *   fully specified state. Technical blocks other than `minecraft:air` are rejected.
 * - **patterns** (`onlyReplace`, `replace.from`): a bare id matches every state of the
 *   block; written properties must match. Properties/values are checked against the registry.
 */

export type BlockArgResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: DslError };

export interface BlockPattern {
  readonly id: string;
  /** Properties that must match (validated against the registry). */
  readonly properties: Readonly<Record<string, string>>;
}

/** Parsed `replace.to`: the explicitly written properties win, others may be carried over. */
export interface ReplaceTarget {
  readonly id: string;
  readonly explicit: Readonly<Record<string, string>>;
  /** Fully resolved state with defaults (used when nothing can be carried over). */
  readonly state: BlockStateString;
}

const MAX_SUGGESTIONS = 5;

/** Levenshtein distance with an early exit above `max`. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(
        (prev[j] as number) + 1,
        (cur[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length] as number;
}

const stripNs = (id: string): string => id.slice(id.indexOf(':') + 1);

/** Close registry ids for an unknown id: substring matches first, then by edit distance. */
export function suggestBlockIds(registry: BlockRegistry, id: string): string[] {
  const wanted = stripNs(id);
  const words = wanted.split(/[_./-]/).filter((w) => w.length >= 3);
  const scored: { id: string; score: number }[] = [];
  const budget = Math.max(2, Math.floor(wanted.length / 3));
  for (const def of registry.all()) {
    if (def.category === 'technical' && def.id !== AIR_ID) continue;
    const name = stripNs(def.id);
    let score: number;
    if (name.includes(wanted) || wanted.includes(name))
      score = Math.abs(name.length - wanted.length) * 0.01;
    else {
      const d = editDistance(wanted, name, budget);
      if (d <= budget) score = d;
      else {
        const shared = words.filter((w) => name.includes(w)).length;
        if (shared === 0) continue;
        score = budget + 1 + (words.length - shared);
      }
    }
    scored.push({ id: def.id, score });
  }
  scored.sort((a, b) => a.score - b.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return scored.slice(0, MAX_SUGGESTIONS).map((s) => s.id);
}

function describeProperties(def: BlockDefinition): string {
  const entries = Object.entries(def.properties);
  if (entries.length === 0) return `${def.id} has no properties`;
  return `${def.id} properties: ${entries
    .map(([k, p]) => `${k}=${p.values.join('|')} (default ${p.default})`)
    .join(', ')}`;
}

function parse(input: string, path: string): BlockArgResult<BlockState> {
  try {
    return { ok: true, value: parseBlockState(input) };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'schema',
        path,
        message: `${(e as Error).message}. Expected e.g. "minecraft:oak_stairs[facing=east]".`,
      },
    };
  }
}

function lookup(
  registry: BlockRegistry,
  state: BlockState,
  path: string,
): BlockArgResult<BlockDefinition> {
  const def = registry.get(state.id);
  if (def) return { ok: true, value: def };
  const close = suggestBlockIds(registry, state.id);
  return {
    ok: false,
    error: {
      code: 'unknown-block',
      path,
      message: `Unknown block "${state.id}".${close.length ? ` Did you mean: ${close.join(', ')}?` : ''}`,
    },
  };
}

function checkProperties(
  def: BlockDefinition,
  props: Readonly<Record<string, string>>,
  path: string,
): DslError | undefined {
  for (const [key, value] of Object.entries(props)) {
    const prop = Object.hasOwn(def.properties, key) ? def.properties[key] : undefined;
    if (!prop) {
      return {
        code: 'invalid-state',
        path,
        message: `${def.id} has no property "${key}". ${describeProperties(def)}.`,
      };
    }
    if (!prop.values.includes(value)) {
      return {
        code: 'invalid-state',
        path,
        message: `${def.id}: "${key}" does not allow "${value}" (allowed: ${prop.values.join(', ')}).`,
      };
    }
  }
  return undefined;
}

/** Resolves a block argument that will be written. */
export function resolveStateArg(
  registry: BlockRegistry,
  input: string,
  path: string,
): BlockArgResult<BlockStateString> {
  const parsed = parse(input, path);
  if (!parsed.ok) return parsed;
  const def = lookup(registry, parsed.value, path);
  if (!def.ok) return def;
  if (def.value.category === 'technical' && def.value.id !== AIR_ID) {
    return {
      ok: false,
      error: {
        code: 'unknown-block',
        path,
        message: `${def.value.id} is a technical block and cannot be placed. Use minecraft:air for empty cells.`,
      },
    };
  }
  const propError = checkProperties(def.value, parsed.value.properties, path);
  if (propError) return { ok: false, error: propError };
  const resolved = resolveBlockState(registry, parsed.value);
  if (!resolved.ok)
    return { ok: false, error: { code: 'invalid-state', path, message: resolved.error } };
  return { ok: true, value: resolved.state };
}

/** Resolves a block pattern (bare id = all states). */
export function resolvePatternArg(
  registry: BlockRegistry,
  input: string,
  path: string,
): BlockArgResult<BlockPattern> {
  const parsed = parse(input, path);
  if (!parsed.ok) return parsed;
  const def = lookup(registry, parsed.value, path);
  if (!def.ok) return def;
  const propError = checkProperties(def.value, parsed.value.properties, path);
  if (propError) return { ok: false, error: propError };
  return { ok: true, value: { id: parsed.value.id, properties: { ...parsed.value.properties } } };
}

/** Resolves `replace.to`. */
export function resolveReplaceTarget(
  registry: BlockRegistry,
  input: string,
  path: string,
): BlockArgResult<ReplaceTarget> {
  const state = resolveStateArg(registry, input, path);
  if (!state.ok) return state;
  const parsed = parseBlockState(input);
  return {
    ok: true,
    value: { id: parsed.id, explicit: { ...parsed.properties }, state: state.value },
  };
}

/** Matcher for a list of patterns over canonical states, with a per-state cache. */
export function createPatternMatcher(
  patterns: readonly BlockPattern[],
): (state: BlockStateString) => boolean {
  const cache = new Map<BlockStateString, boolean>();
  return (state) => {
    let hit = cache.get(state);
    if (hit === undefined) {
      const parsed = parseBlockState(state);
      hit = patterns.some(
        (p) =>
          p.id === parsed.id &&
          Object.entries(p.properties).every(([k, v]) => parsed.properties[k] === v),
      );
      cache.set(state, hit);
    }
    return hit;
  };
}

/**
 * The state written by `replace` for a matched cell: explicit `to` properties, then
 * properties carried over from the matched state where the target allows them, then defaults.
 */
export function replacementState(
  registry: BlockRegistry,
  target: ReplaceTarget,
  matched: BlockStateString,
): BlockStateString {
  const def = registry.get(target.id);
  if (!def) return target.state;
  const source = parseBlockState(matched);
  const props: Record<string, string> = {};
  for (const [key, prop] of Object.entries(def.properties)) {
    const explicit = Object.hasOwn(target.explicit, key) ? target.explicit[key] : undefined;
    const carried = Object.hasOwn(source.properties, key) ? source.properties[key] : undefined;
    if (explicit !== undefined) props[key] = explicit;
    else if (carried !== undefined && prop.values.includes(carried)) props[key] = carried;
    else props[key] = prop.default;
  }
  const resolved = resolveBlockState(registry, { id: def.id, properties: props });
  return resolved.ok ? resolved.state : target.state;
}
