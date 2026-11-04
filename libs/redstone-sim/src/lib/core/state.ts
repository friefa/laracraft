import {
  parseBlockState,
  stringifyBlockState,
  type BlockDefinition,
  type BlockRegistry,
  type BlockStateString,
} from '@laracraft/core-model';
import type { Behaviour } from '../blocks/behaviour';

/**
 * Interned, immutable blockstate. Identical states are the same object, so `===`
 * compares states like Java's `BlockState` identity.
 */
export class BState {
  private readonly cache = new Map<string, BState>();
  /** Lazily cached per-state data used by the level (behaviour, conductivity). */
  behaviour: Behaviour | undefined;
  conductor: boolean | undefined;

  constructor(
    readonly table: StateTable,
    readonly id: string,
    readonly props: Readonly<Record<string, string>>,
    readonly key: BlockStateString,
    readonly def: BlockDefinition | undefined,
  ) {}

  /** Property value, `''` when the state has no such property. */
  get(name: string): string {
    return this.props[name] ?? '';
  }

  has(name: string): boolean {
    return Object.hasOwn(this.props, name);
  }

  bool(name: string): boolean {
    return this.props[name] === 'true';
  }

  int(name: string): number {
    return Number(this.props[name] ?? 0);
  }

  is(id: string): boolean {
    return this.id === id;
  }

  get isAir(): boolean {
    return (
      this.id === 'minecraft:air' ||
      this.id === 'minecraft:cave_air' ||
      this.id === 'minecraft:void_air'
    );
  }

  /** Copy with one property changed (Java `setValue`). Unknown properties are ignored. */
  with(name: string, value: string | number | boolean): BState {
    const v = String(value);
    if (!this.has(name) || this.props[name] === v) return this;
    const ck = `${name}=${v}`;
    let s = this.cache.get(ck);
    if (!s) {
      s = this.table.of(this.id, { ...this.props, [name]: v });
      this.cache.set(ck, s);
    }
    return s;
  }
}

/** Interns blockstates; fills missing properties with registry defaults. */
export class StateTable {
  private readonly byKey = new Map<string, BState>();

  constructor(readonly registry: BlockRegistry) {}

  parse(input: string): BState {
    const hit = this.byKey.get(input);
    if (hit) return hit;
    const parsed = parseBlockState(input);
    const s = this.of(parsed.id, parsed.properties);
    this.byKey.set(input, s);
    return s;
  }

  of(id: string, props: Readonly<Record<string, string>>): BState {
    const def = this.registry.get(id);
    const full: Record<string, string> = {};
    if (def) for (const [k, p] of Object.entries(def.properties)) full[k] = p.default;
    for (const [k, v] of Object.entries(props)) full[k] = v;
    const key = stringifyBlockState({ id, properties: full });
    const hit = this.byKey.get(key);
    if (hit) return hit;
    const s = new BState(this, id, Object.freeze(full), key, def);
    this.byKey.set(key, s);
    return s;
  }

  /** Default state of a block id. */
  block(id: string): BState {
    return this.of(id, {});
  }
}
