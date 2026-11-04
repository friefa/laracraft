import {
  createJavaBlockRegistry,
  resolveBlockState,
  rotateStateY,
  type BlockRegistry,
  type BlockStateString,
} from '@laracraft/core-model';
import {
  ModuleParamsError,
  type ModuleBlock,
  type ModuleFacing,
  type ModuleParamValue,
  type ModuleParams,
  type ParamSpec,
  type Pos,
  type RedstoneModule,
} from './types';

let registry: BlockRegistry | undefined;

/** The Java registry used to resolve and rotate module states (created once). */
export function moduleRegistry(): BlockRegistry {
  registry ??= createJavaBlockRegistry();
  return registry;
}

const TURNS: Readonly<Record<ModuleFacing, number>> = { north: 0, east: 1, south: 2, west: 3 };

/** Clockwise quarter turns (seen from above) from the north orientation to `facing`. */
export function facingTurns(facing: ModuleFacing): number {
  const turns = Object.hasOwn(TURNS, facing) ? TURNS[facing] : undefined;
  if (turns === undefined) throw new RangeError(`Invalid module facing "${String(facing)}"`);
  return turns;
}

/** Rotates a vector clockwise around the Y axis (north → east → south → west). */
export function rotateOffsetY(v: Pos, quarterTurns: number): Pos {
  let { x, z } = v;
  const turns = (((quarterTurns % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  for (let i = 0; i < turns; i++) [x, z] = [-z, x];
  // Normalise -0 so offsets compare and serialise cleanly.
  return { x: x + 0, y: v.y, z: z + 0 };
}

export type ResolvedParams = Readonly<Record<string, ModuleParamValue>>;

export type ParamResolution =
  | { readonly ok: true; readonly params: ResolvedParams }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Validates `params` against `specs` and fills in defaults. Unknown keys are errors. */
export function resolveModuleParams(
  specs: Readonly<Record<string, ParamSpec>> | undefined,
  params: ModuleParams | undefined,
): ParamResolution {
  const errors: string[] = [];
  const out: Record<string, ModuleParamValue> = {};
  const given = params ?? {};
  for (const key of Object.keys(given)) {
    if (!specs || !Object.hasOwn(specs, key)) errors.push(`unknown parameter "${key}"`);
  }
  for (const [key, spec] of Object.entries(specs ?? {})) {
    if (!Object.hasOwn(given, key)) {
      out[key] = spec.default;
      continue;
    }
    const value = given[key];
    switch (spec.type) {
      case 'integer':
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          errors.push(`"${key}" must be an integer`);
        } else if (value < spec.minimum || value > spec.maximum) {
          errors.push(`"${key}" must be between ${spec.minimum} and ${spec.maximum}`);
        } else out[key] = value;
        break;
      case 'boolean':
        if (typeof value !== 'boolean') errors.push(`"${key}" must be a boolean`);
        else out[key] = value;
        break;
      case 'string':
        if (typeof value !== 'string' || !spec.enum.includes(value)) {
          errors.push(`"${key}" must be one of ${spec.enum.join(', ')}`);
        } else out[key] = value;
        break;
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, params: out };
}

/** One block in local north coordinates (box `[0, size)`). */
export interface LocalBlock {
  readonly pos: Pos;
  readonly state: string;
}

export interface ModuleDefinition extends Omit<RedstoneModule, 'build'> {
  /** The module's blocks for facing north, local coordinates, resting state. */
  blocks(params: ResolvedParams): readonly LocalBlock[];
}

/** Resolves a state against the registry (defaults filled in), throwing on errors. */
function canonical(moduleId: string, state: string): BlockStateString {
  const resolved = resolveBlockState(moduleRegistry(), state);
  if (!resolved.ok) throw new Error(`Module ${moduleId}: ${resolved.error}`);
  return resolved.state;
}

/** Turns a definition into a module with a rotating, validating `build`. */
export function defineModule(def: ModuleDefinition): RedstoneModule {
  const { blocks, ...rest } = def;
  return {
    ...rest,
    build(params?: ModuleParams, facing: ModuleFacing = 'north'): readonly ModuleBlock[] {
      const resolved = resolveModuleParams(def.params, params);
      if (!resolved.ok) throw new ModuleParamsError(def.id, resolved.errors);
      const turns = facingTurns(facing);
      const reg = moduleRegistry();
      return blocks(resolved.params).map((b) => ({
        offset: rotateOffsetY(
          { x: b.pos.x - def.anchor.x, y: b.pos.y - def.anchor.y, z: b.pos.z - def.anchor.z },
          turns,
        ),
        state: rotateStateY(reg, canonical(def.id, b.state), turns),
      }));
    },
  };
}

/** Absolute placement of a module: world position = `pos` + offset. */
export function placeModule(
  module: Pick<RedstoneModule, 'build'>,
  pos: Pos,
  facing: ModuleFacing = 'north',
  params?: ModuleParams,
): { readonly pos: Pos; readonly state: string }[] {
  return module.build(params, facing).map((b) => ({
    pos: { x: pos.x + b.offset.x, y: pos.y + b.offset.y, z: pos.z + b.offset.z },
    state: b.state,
  }));
}

// --- Authoring helpers ---------------------------------------------------------

type WireSide = 'side' | 'up';

/** Redstone wire with the given connections (unlisted sides `none`). */
export function wire(
  c: { readonly n?: WireSide; readonly e?: WireSide; readonly s?: WireSide; readonly w?: WireSide },
  power = 0,
): string {
  return (
    `minecraft:redstone_wire[east=${c.e ?? 'none'},north=${c.n ?? 'none'},` +
    `power=${power},south=${c.s ?? 'none'},west=${c.w ?? 'none'}]`
  );
}

/** Small builder collecting local blocks; rejects duplicates. */
export class LocalBuilder {
  private readonly cells = new Map<string, LocalBlock>();

  set(x: number, y: number, z: number, state: string): this {
    const key = `${x},${y},${z}`;
    if (this.cells.has(key)) throw new Error(`Duplicate module block at ${key}`);
    this.cells.set(key, { pos: { x, y, z }, state });
    return this;
  }

  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, state: string) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, y, z, state);
    }
    return this;
  }

  blocks(): readonly LocalBlock[] {
    return [...this.cells.values()];
  }
}

/** i18n keys of a module. */
export const moduleKey = (id: string, suffix: string): string => `redstoneModule.${id}.${suffix}`;
