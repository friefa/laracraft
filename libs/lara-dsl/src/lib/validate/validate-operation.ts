import {
  type BlockRegistry,
  type BlockStateString,
  type Box3,
  parseBlockState,
} from '@laracraft/core-model';
import { boxContains, boxIntersectionVolume, boxVolume, regionBox, rotatedBox } from '../geometry';
import { defaultRidgeAxis, roofBounds, roofCells, type RoofSpec } from '../interpreter/roof';
import { describeValue, isPlainObject, validateJsonSchema } from '../schema/json-schema';
import {
  OPERATION_NAMES,
  OPERATION_TABLE,
  STRUCTURAL_SCHEMA,
  toolInputDefName,
} from '../schema/operation-schema';
import { TOOL_NAME_TO_OP, toolInputToOperation } from '../schema/tools';
import {
  DEFAULT_DSL_LIMITS,
  type DslError,
  type DslLimits,
  type HorizontalFacing,
  type Operation,
  type OperationName,
  type Pos,
  type Region,
  type RoofType,
  type ValidationResult,
} from '../types';
import {
  type BlockPattern,
  editDistance,
  type ReplaceTarget,
  resolvePatternArg,
  resolveReplaceTarget,
  resolveStateArg,
  suggestBlockIds,
} from './block-args';
import type { ModuleCatalogue, ModuleParams } from './module-catalogue';

/** Services the validator may need beyond the registry. */
export interface ValidationContext {
  /** Module catalogue for `insertModule` (without it, every module is unknown). */
  readonly modules?: ModuleCatalogue;
}

/** A validated operation with every block argument resolved (interpreter input). */
export type ResolvedOperation =
  | {
      readonly op: 'fill';
      readonly box: Box3;
      readonly state: BlockStateString;
      readonly mask?: readonly BlockPattern[];
    }
  | {
      readonly op: 'hollowBox';
      readonly box: Box3;
      readonly state: BlockStateString;
      readonly keepInterior: boolean;
      readonly mask?: readonly BlockPattern[];
    }
  | {
      readonly op: 'line';
      readonly from: Pos;
      readonly to: Pos;
      readonly state: BlockStateString;
      readonly mask?: readonly BlockPattern[];
    }
  | {
      readonly op: 'wall';
      readonly from: Pos;
      readonly to: Pos;
      readonly height: number;
      readonly state: BlockStateString;
      readonly mask?: readonly BlockPattern[];
    }
  | {
      readonly op: 'floor';
      readonly box: Box3;
      readonly state: BlockStateString;
      readonly mask?: readonly BlockPattern[];
    }
  | {
      readonly op: 'roof';
      readonly spec: RoofSpec;
      readonly stairs: BlockStateString;
      readonly block: BlockStateString;
    }
  | { readonly op: 'placeBlock'; readonly pos: Pos; readonly state: BlockStateString }
  | {
      readonly op: 'replace';
      readonly box: Box3;
      readonly from: BlockPattern;
      readonly to: ReplaceTarget;
    }
  | { readonly op: 'clear'; readonly box: Box3 }
  | { readonly op: 'mirror'; readonly box: Box3; readonly axis: 'x' | 'z' }
  | { readonly op: 'rotate'; readonly box: Box3; readonly turns: 1 | 2 | 3 }
  | {
      readonly op: 'copy';
      readonly box: Box3;
      readonly to: Pos;
      readonly repeat: number;
      readonly step: Pos;
    }
  | {
      readonly op: 'insertModule';
      readonly moduleId: string;
      readonly blocks: readonly { readonly pos: Pos; readonly state: BlockStateString }[];
    };

export type ResolveResult =
  | {
      readonly ok: true;
      readonly operation: Operation;
      readonly resolved: ResolvedOperation;
      readonly cells: number;
    }
  | { readonly ok: false; readonly errors: readonly DslError[] };

const STRUCTURAL_DEFS = new Map(
  OPERATION_TABLE.map((e) => [e.op, { $ref: `#/$defs/${e.def}` }] as const),
);

const err = (code: DslError['code'], path: string, message: string): DslError => ({
  code,
  path,
  message,
});

/**
 * Validates one operation (as produced by the model) against the schema, the limits, the
 * block registry and the module catalogue. Never throws; all problems are returned as
 * {@link DslError}s with JSON-pointer paths.
 */
export function validateOperation(
  input: unknown,
  registry: BlockRegistry,
  limits: DslLimits = DEFAULT_DSL_LIMITS,
  ctx: ValidationContext = {},
): ValidationResult {
  const r = resolveOperation(input, registry, limits, ctx);
  return r.ok ? { ok: true, operation: r.operation } : r;
}

/**
 * Validates a tool call (tool name + arguments as sent by the model), see `LARA_TOOLS`.
 * Paths refer to the tool arguments.
 */
export function validateToolCall(
  name: string,
  input: unknown,
  registry: BlockRegistry,
  limits: DslLimits = DEFAULT_DSL_LIMITS,
  ctx: ValidationContext = {},
): ValidationResult {
  const r = resolveToolCall(name, input, registry, limits, ctx);
  return r.ok ? { ok: true, operation: r.operation } : r;
}

export function resolveToolCall(
  name: string,
  input: unknown,
  registry: BlockRegistry,
  limits: DslLimits = DEFAULT_DSL_LIMITS,
  ctx: ValidationContext = {},
): ResolveResult {
  try {
    const op = typeof name === 'string' ? TOOL_NAME_TO_OP.get(name) : undefined;
    if (op === undefined) {
      return {
        ok: false,
        errors: [
          err(
            'schema',
            '',
            `Unknown tool "${String(name)}". Available: ${[...TOOL_NAME_TO_OP.keys()].join(', ')}.`,
          ),
        ],
      };
    }
    const def = OPERATION_TABLE.find((e) => e.op === op)?.def as string;
    const issues = validateJsonSchema(
      { $ref: `#/$defs/${toolInputDefName(def)}` },
      input,
      STRUCTURAL_SCHEMA,
    );
    if (issues.length)
      return { ok: false, errors: issues.map((i) => err('schema', i.path, i.message)) };
    if (op === 'insertModule' && isPlainObject(input) && Array.isArray(input['params'])) {
      const seen = new Set<string>();
      const errors: DslError[] = [];
      (input['params'] as { name: string }[]).forEach((p, i) => {
        if (seen.has(p.name))
          errors.push(err('schema', `/params/${i}/name`, `duplicate parameter "${p.name}"`));
        seen.add(p.name);
      });
      if (errors.length) return { ok: false, errors };
    }
    const result = resolveOperation(toolInputToOperation(name, input), registry, limits, ctx);
    if (result.ok || op !== 'insertModule') return result;
    // Map record paths (/params/<name>) back to the list form (/params/<index>/value).
    const names =
      isPlainObject(input) && Array.isArray(input['params'])
        ? (input['params'] as { name: string }[]).map((p) => p.name)
        : [];
    return {
      ok: false,
      errors: result.errors.map((e) => {
        const m = /^\/params\/([^/]+)(.*)$/.exec(e.path);
        const idx = m ? names.indexOf(m[1] as string) : -1;
        return idx >= 0 ? { ...e, path: `/params/${idx}/value${m?.[2] ?? ''}` } : e;
      }),
    };
  } catch (e) {
    return {
      ok: false,
      errors: [err('schema', '', `Could not read the tool arguments: ${(e as Error).message}`)],
    };
  }
}

/** Like {@link validateOperation}, but also returns the resolved form for the interpreter. */
export function resolveOperation(
  input: unknown,
  registry: BlockRegistry,
  limits: DslLimits = DEFAULT_DSL_LIMITS,
  ctx: ValidationContext = {},
): ResolveResult {
  try {
    return resolveUnsafe(input, registry, limits, ctx);
  } catch (e) {
    return {
      ok: false,
      errors: [err('schema', '', `Could not read the operation: ${(e as Error).message}`)],
    };
  }
}

function resolveUnsafe(
  input: unknown,
  registry: BlockRegistry,
  limits: DslLimits,
  ctx: ValidationContext,
): ResolveResult {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: [err('schema', '', `expected an operation object, got ${describeValue(input)}`)],
    };
  }
  const opName = input['op'];
  if (typeof opName !== 'string' || !(OPERATION_NAMES as readonly string[]).includes(opName)) {
    return {
      ok: false,
      errors: [
        err(
          'schema',
          '/op',
          `${Object.hasOwn(input, 'op') ? `unknown operation ${describeValue(opName)}` : 'missing "op"'}; expected one of ${OPERATION_NAMES.join(', ')}`,
        ),
      ],
    };
  }
  const issues = validateJsonSchema(
    STRUCTURAL_DEFS.get(opName as OperationName) as { $ref: string },
    input,
    STRUCTURAL_SCHEMA,
  );
  if (issues.length) {
    return { ok: false, errors: issues.map((i) => err('schema', i.path, i.message)) };
  }
  // Structurally valid: a deep copy is a clean, fully typed operation.
  const op = JSON.parse(JSON.stringify(input)) as Operation;
  const errors: DslError[] = [];
  checkCoordinates(op, limits, errors);
  if (errors.length) return { ok: false, errors };
  return resolveSemantics(op, registry, limits, ctx);
}

/** Every coordinate written by the model must be within ±maxAbsCoord. */
function checkCoordinates(op: Operation, limits: DslLimits, errors: DslError[]): void {
  const bound = limits.maxAbsCoord;
  const checkPos = (p: Pos, path: string): void => {
    for (const axis of ['x', 'y', 'z'] as const) {
      if (Math.abs(p[axis]) > bound) {
        errors.push(
          err('limit', `${path}/${axis}`, `coordinate ${p[axis]} is outside [-${bound}, ${bound}]`),
        );
      }
    }
  };
  const checkRegion = (r: Region, path: string): void => {
    checkPos(r.from, `${path}/from`);
    checkPos(r.to, `${path}/to`);
  };
  if ('region' in op) checkRegion(op.region, '/region');
  switch (op.op) {
    case 'line':
    case 'wall':
      checkPos(op.from, '/from');
      checkPos(op.to, '/to');
      break;
    case 'floor':
      if (Math.abs(op.y) > bound)
        errors.push(err('limit', '/y', `coordinate ${op.y} is outside [-${bound}, ${bound}]`));
      break;
    case 'placeBlock':
    case 'insertModule':
      checkPos(op.pos, '/pos');
      break;
    case 'copy':
      checkPos(op.to, '/to');
      if (op.step) checkPos(op.step, '/step');
      break;
    default:
      break;
  }
}

function outside(b: Box3, bound: number): boolean {
  return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].some((v) => Math.abs(v) > bound);
}

const tooMany = (cells: number, limits: DslLimits, path = ''): DslError =>
  err(
    'limit',
    path,
    `operation would touch ${cells} cells; at most ${limits.maxCellsPerOp} per operation. Split it into smaller operations.`,
  );

function resolveSemantics(
  op: Operation,
  registry: BlockRegistry,
  limits: DslLimits,
  ctx: ValidationContext,
): ResolveResult {
  const errors: DslError[] = [];
  const state = (value: string, path: string): BlockStateString => {
    const r = resolveStateArg(registry, value, path);
    if (r.ok) return r.value;
    errors.push(r.error);
    return '' as BlockStateString;
  };
  const mask = (list: readonly string[] | undefined): BlockPattern[] | undefined => {
    if (list === undefined) return undefined;
    return list.flatMap((b, i) => {
      const r = resolvePatternArg(registry, b, `/onlyReplace/${i}`);
      if (r.ok) return [r.value];
      errors.push(r.error);
      return [];
    });
  };
  const done = (resolved: ResolvedOperation, cells: number): ResolveResult => {
    if (cells > limits.maxCellsPerOp) errors.push(tooMany(cells, limits));
    return errors.length ? { ok: false, errors } : { ok: true, operation: op, resolved, cells };
  };
  const bounded = (b: Box3, what: string): void => {
    if (outside(b, limits.maxAbsCoord)) {
      errors.push(
        err(
          'limit',
          '',
          `${what} reaches outside the allowed coordinate range ±${limits.maxAbsCoord}`,
        ),
      );
    }
  };

  switch (op.op) {
    case 'fill':
    case 'hollowBox': {
      const box = regionBox(op.region);
      const s = state(op.block, '/block');
      const m = mask(op.onlyReplace);
      const cells = boxVolume(box);
      if (op.op === 'fill')
        return done({ op: 'fill', box, state: s, ...(m ? { mask: m } : {}) }, cells);
      return done(
        {
          op: 'hollowBox',
          box,
          state: s,
          keepInterior: op.keepInterior ?? false,
          ...(m ? { mask: m } : {}),
        },
        cells,
      );
    }
    case 'line': {
      const s = state(op.block, '/block');
      const m = mask(op.onlyReplace);
      const cells =
        Math.max(
          Math.abs(op.to.x - op.from.x),
          Math.abs(op.to.y - op.from.y),
          Math.abs(op.to.z - op.from.z),
        ) + 1;
      return done(
        { op: 'line', from: op.from, to: op.to, state: s, ...(m ? { mask: m } : {}) },
        cells,
      );
    }
    case 'wall': {
      if (op.to.y !== op.from.y) {
        errors.push(
          err(
            'schema',
            '/to/y',
            `must equal from.y (${op.from.y}); use height for the wall's height`,
          ),
        );
      }
      const s = state(op.block, '/block');
      const m = mask(op.onlyReplace);
      const top = op.from.y + op.height - 1;
      if (Math.abs(top) > limits.maxAbsCoord) {
        errors.push(err('limit', '/height', `wall top y=${top} is outside ±${limits.maxAbsCoord}`));
      }
      const length = Math.max(Math.abs(op.to.x - op.from.x), Math.abs(op.to.z - op.from.z)) + 1;
      return done(
        {
          op: 'wall',
          from: op.from,
          to: op.to,
          height: op.height,
          state: s,
          ...(m ? { mask: m } : {}),
        },
        length * op.height,
      );
    }
    case 'floor': {
      const b = regionBox(op.region);
      const box: Box3 = { min: { ...b.min, y: op.y }, max: { ...b.max, y: op.y } };
      const s = state(op.block, '/block');
      const m = mask(op.onlyReplace);
      return done({ op: 'floor', box, state: s, ...(m ? { mask: m } : {}) }, boxVolume(box));
    }
    case 'roof':
      return resolveRoof(op, registry, limits, errors, state, done, bounded);
    case 'placeBlock':
      return done({ op: 'placeBlock', pos: op.pos, state: state(op.block, '/block') }, 1);
    case 'replace': {
      const box = regionBox(op.region);
      const from = resolvePatternArg(registry, op.from, '/from');
      if (!from.ok) errors.push(from.error);
      const to = resolveReplaceTarget(registry, op.to, '/to');
      if (!to.ok) errors.push(to.error);
      if (!from.ok || !to.ok) return { ok: false, errors };
      return done({ op: 'replace', box, from: from.value, to: to.value }, boxVolume(box));
    }
    case 'clear': {
      const box = regionBox(op.region);
      return done({ op: 'clear', box }, boxVolume(box));
    }
    case 'mirror': {
      const box = regionBox(op.region);
      return done({ op: 'mirror', box, axis: op.axis }, boxVolume(box));
    }
    case 'rotate': {
      const box = regionBox(op.region);
      const target = rotatedBox(box, op.turns);
      bounded(target, 'the rotated region');
      const cells = 2 * boxVolume(box) - boxIntersectionVolume(box, target);
      return done({ op: 'rotate', box, turns: op.turns }, cells);
    }
    case 'copy': {
      const box = regionBox(op.region);
      const repeat = op.repeat ?? 1;
      const step = op.step ?? { x: box.max.x - box.min.x + 1, y: 0, z: 0 };
      const size = { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z };
      for (const i of [0, repeat - 1]) {
        const min = { x: op.to.x + i * step.x, y: op.to.y + i * step.y, z: op.to.z + i * step.z };
        bounded(
          { min, max: { x: min.x + size.x, y: min.y + size.y, z: min.z + size.z } },
          i === 0 ? 'the first copy' : 'the last copy',
        );
      }
      return done({ op: 'copy', box, to: op.to, repeat, step }, boxVolume(box) * repeat);
    }
    case 'insertModule':
      return resolveModule(op, registry, limits, ctx, errors, done);
  }
}

function resolveRoof(
  op: Extract<Operation, { op: 'roof' }>,
  registry: BlockRegistry,
  limits: DslLimits,
  errors: DslError[],
  state: (value: string, path: string) => BlockStateString,
  done: (resolved: ResolvedOperation, cells: number) => ResolveResult,
  bounded: (b: Box3, what: string) => void,
): ResolveResult {
  const box = regionBox(op.region);
  const stairs = state(op.stairs, '/stairs');
  const block = state(op.block, '/block');
  if (stairs) {
    const def = registry.get(parseBlockState(stairs).id);
    const isStairs =
      def !== undefined &&
      ['facing', 'half', 'shape'].every((p) => Object.hasOwn(def.properties, p)) &&
      def.properties['half']?.values.includes('bottom') === true;
    if (!isStairs) {
      const close = suggestBlockIds(registry, `${op.stairs.replace(/\[.*$/, '')}_stairs`).filter(
        (id) => id.endsWith('_stairs'),
      );
      errors.push(
        err(
          'invalid-state',
          '/stairs',
          `"${op.stairs}" is not a stairs block.${close.length ? ` Did you mean: ${close.join(', ')}?` : ' Use e.g. minecraft:oak_stairs.'}`,
        ),
      );
    }
  }
  const spec: RoofSpec = {
    box,
    type: op.type as RoofType,
    pitch: op.pitch as 1 | 2,
    ridgeAxis: op.ridgeAxis ?? defaultRidgeAxis(box),
    overhang: op.overhang ?? 0,
  };
  const bounds = roofBounds(spec);
  bounded(bounds, 'the roof');
  const footprint = (bounds.max.x - bounds.min.x + 1) * (bounds.max.z - bounds.min.z + 1);
  // A roof writes at most footprint × pitch cells plus its closed ends; check before generating.
  if (footprint * 2 > limits.maxCellsPerOp || errors.length) {
    return done({ op: 'roof', spec, stairs, block }, Math.max(footprint * 2, 1));
  }
  const cells = roofCells(spec).length;
  return done({ op: 'roof', spec, stairs, block }, cells);
}

function resolveModule(
  op: Extract<Operation, { op: 'insertModule' }>,
  registry: BlockRegistry,
  limits: DslLimits,
  ctx: ValidationContext,
  errors: DslError[],
  done: (resolved: ResolvedOperation, cells: number) => ResolveResult,
): ResolveResult {
  const catalogue = ctx.modules;
  const module = catalogue?.get(op.moduleId);
  if (!catalogue || !module) {
    const ids = catalogue?.ids?.() ?? [];
    const close = [...ids]
      .map((id) => ({ id, d: editDistance(op.moduleId, id) }))
      .sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1))
      .slice(0, 8)
      .map((e) => e.id);
    return {
      ok: false,
      errors: [
        err(
          'unknown-module',
          '/moduleId',
          !catalogue
            ? 'No module catalogue is available; insertModule cannot be used right now.'
            : `Unknown module "${op.moduleId}".${close.length ? ` Available: ${close.join(', ')}.` : ''}`,
        ),
      ],
    };
  }
  const params: ModuleParams = op.params ?? {};
  for (const message of module.validateParams?.(params) ?? []) {
    errors.push(err('module-params', '/params', message));
  }
  if (errors.length) return { ok: false, errors };
  let built: ReturnType<typeof module.build>;
  try {
    built = module.build(params, op.facing as HorizontalFacing);
  } catch (e) {
    return { ok: false, errors: [err('module-params', '/params', (e as Error).message)] };
  }
  if (built.length > limits.maxCellsPerOp)
    return { ok: false, errors: [tooMany(built.length, limits)] };
  const blocks: { pos: Pos; state: BlockStateString }[] = [];
  const bound = limits.maxAbsCoord;
  for (const b of built) {
    const pos = { x: op.pos.x + b.offset.x, y: op.pos.y + b.offset.y, z: op.pos.z + b.offset.z };
    if (![pos.x, pos.y, pos.z].every((v) => Number.isSafeInteger(v))) {
      return {
        ok: false,
        errors: [
          err('module-params', '/moduleId', `module ${module.id} produced a non-integer offset`),
        ],
      };
    }
    if (
      !boxContains(
        { min: { x: -bound, y: -bound, z: -bound }, max: { x: bound, y: bound, z: bound } },
        pos,
      )
    ) {
      return {
        ok: false,
        errors: [
          err(
            'limit',
            '/pos',
            `module ${module.id} reaches outside the allowed coordinate range ±${bound}`,
          ),
        ],
      };
    }
    const s = resolveStateArg(registry, b.state, '/moduleId');
    if (!s.ok) {
      return {
        ok: false,
        errors: [
          {
            ...s.error,
            code: 'module-params',
            message: `module ${module.id} produced an invalid block: ${s.error.message}`,
          },
        ],
      };
    }
    blocks.push({ pos, state: s.value });
  }
  return done({ op: 'insertModule', moduleId: module.id, blocks }, blocks.length);
}
