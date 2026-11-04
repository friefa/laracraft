import { DEFAULT_DSL_LIMITS, type OperationName } from '../types';
import type { JsonSchema } from './json-schema';

/**
 * JSON Schema (draft 2020-12) for every {@link Operation} of the contract in `types.ts`,
 * and for the matching tool inputs (see `tools.ts`).
 *
 * Tool inputs are the operation without its `op` field (the tool name selects the
 * operation). The only other difference: `insert_module.params` is a list of
 * `{ name, value }` pairs, because strict tool use requires `additionalProperties: false`
 * on every object and therefore cannot express an open map.
 */

export const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';
export const LARA_DSL_SCHEMA_ID = 'https://laracraft.app/schema/lara-dsl.schema.json';

/** Static limits that are part of the schema itself (not configurable per turn). */
export const SCHEMA_LIMITS = {
  maxBlockArgLength: 256,
  maxOnlyReplace: 16,
  maxRepeat: 256,
  maxModuleParams: 32,
  maxModuleIdLength: 128,
  maxParamNameLength: 64,
  maxParamStringLength: 256,
} as const;

/**
 * Accepted blockstate spelling: optional namespace, id, optional `[key=value,…]`
 * (spaces after commas tolerated). Registry checks happen in the validator.
 */
export const BLOCK_ARG_PATTERN = '^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+(?:\\[[a-z0-9_=, ]*\\])?$';
export const MODULE_ID_PATTERN = '^[a-z0-9_.:/-]+$';
export const PARAM_NAME_PATTERN = '^[A-Za-z][A-Za-z0-9_]*$';

/** Operation name ↔ tool name ↔ `$defs` names. Order = order of tools and `oneOf`. */
export const OPERATION_TABLE: readonly {
  readonly op: OperationName;
  readonly tool: string;
  readonly def: string;
}[] = [
  { op: 'fill', tool: 'fill', def: 'FillOp' },
  { op: 'hollowBox', tool: 'hollow_box', def: 'HollowBoxOp' },
  { op: 'line', tool: 'line', def: 'LineOp' },
  { op: 'wall', tool: 'wall', def: 'WallOp' },
  { op: 'floor', tool: 'floor', def: 'FloorOp' },
  { op: 'roof', tool: 'roof', def: 'RoofOp' },
  { op: 'placeBlock', tool: 'place_block', def: 'PlaceBlockOp' },
  { op: 'replace', tool: 'replace', def: 'ReplaceOp' },
  { op: 'clear', tool: 'clear', def: 'ClearOp' },
  { op: 'mirror', tool: 'mirror', def: 'MirrorOp' },
  { op: 'rotate', tool: 'rotate', def: 'RotateOp' },
  { op: 'copy', tool: 'copy', def: 'CopyOp' },
  { op: 'insertModule', tool: 'insert_module', def: 'InsertModuleOp' },
];

export const OPERATION_NAMES: readonly OperationName[] = OPERATION_TABLE.map((e) => e.op);

export const toolInputDefName = (def: string): string => `${def.replace(/Op$/, '')}ToolInput`;

export interface SchemaOptions {
  /** Absolute coordinate bound written into the schema; `null` = no bound (checked elsewhere). */
  readonly maxAbsCoord: number | null;
}

const ref = (name: string): JsonSchema => ({ $ref: `#/$defs/${name}` });
const described = (schema: JsonSchema, description: string): JsonSchema => ({
  ...schema,
  description,
});

interface OpShape {
  readonly properties: Readonly<Record<string, JsonSchema>>;
  readonly required: readonly string[];
}

const onlyReplace: JsonSchema = described(
  ref('BlockList'),
  'Mask: only cells currently holding one of these blocks are changed (patterns as in `replace.from`, `minecraft:air` allowed). Omit to change every cell.',
);

/** Fields of each operation except `op` (shared by operation and tool-input schemas). */
function opShapes(moduleParams: JsonSchema): Readonly<Record<OperationName, OpShape>> {
  return {
    fill: {
      properties: { region: ref('Region'), block: ref('Block'), onlyReplace },
      required: ['region', 'block'],
    },
    hollowBox: {
      properties: {
        region: ref('Region'),
        block: ref('Block'),
        keepInterior: {
          type: 'boolean',
          description: 'true: leave the interior untouched. Default false: interior becomes air.',
        },
        onlyReplace,
      },
      required: ['region', 'block'],
    },
    line: {
      properties: {
        from: described(ref('Pos'), 'Start cell (inclusive).'),
        to: described(ref('Pos'), 'End cell (inclusive).'),
        block: ref('Block'),
        onlyReplace,
      },
      required: ['from', 'to', 'block'],
    },
    wall: {
      properties: {
        from: described(ref('Pos'), 'Start of the wall base line; its y is the bottom layer.'),
        to: described(ref('Pos'), 'End of the wall base line; y must equal from.y.'),
        height: {
          type: 'integer',
          minimum: 1,
          description: 'Number of layers, counted upwards from from.y (>= 1).',
        },
        block: ref('Block'),
        onlyReplace,
      },
      required: ['from', 'to', 'height', 'block'],
    },
    floor: {
      properties: {
        region: described(ref('Region'), 'Only the X/Z footprint is used; its Y is ignored.'),
        y: described(ref('Coordinate'), 'Height of the single layer.'),
        block: ref('Block'),
        onlyReplace,
      },
      required: ['region', 'y', 'block'],
    },
    roof: {
      properties: {
        region: described(
          ref('Region'),
          'The building below the roof: the roof covers its X/Z footprint and starts at max Y + 1.',
        ),
        type: { type: 'string', enum: ['gable', 'hip', 'shed', 'flat'] },
        pitch: {
          type: 'integer',
          enum: [1, 2],
          description: '1 = 45° (stairs only), 2 = steep (full block under each stair).',
        },
        stairs: described(ref('Block'), 'A stairs block for the slopes (orientation is computed).'),
        block: described(ref('Block'), 'Full block for ridge, gable ends and flat roofs.'),
        ridgeAxis: {
          type: 'string',
          enum: ['x', 'z'],
          description:
            'gable/shed: axis the ridge (shed: high edge) runs along. Default: the longer side.',
        },
        overhang: {
          type: 'integer',
          enum: [0, 1, 2],
          description: 'Eaves beyond the footprint on every side (default 0).',
        },
      },
      required: ['region', 'type', 'pitch', 'stairs', 'block'],
    },
    placeBlock: {
      properties: { pos: ref('Pos'), block: ref('Block') },
      required: ['pos', 'block'],
    },
    replace: {
      properties: {
        region: ref('Region'),
        from: described(
          ref('Block'),
          'Pattern: a bare id matches every state of that block; listed properties must match.',
        ),
        to: described(
          ref('Block'),
          'Replacement. Properties not written here are kept from the replaced block when valid.',
        ),
      },
      required: ['region', 'from', 'to'],
    },
    clear: { properties: { region: ref('Region') }, required: ['region'] },
    mirror: {
      properties: {
        region: ref('Region'),
        axis: {
          type: 'string',
          enum: ['x', 'z'],
          description: 'x: flip east/west (X coordinates). z: flip north/south (Z coordinates).',
        },
      },
      required: ['region', 'axis'],
    },
    rotate: {
      properties: {
        region: ref('Region'),
        turns: {
          type: 'integer',
          enum: [1, 2, 3],
          description: 'Clockwise quarter turns seen from above (1 = 90°, 2 = 180°, 3 = 270°).',
        },
      },
      required: ['region', 'turns'],
    },
    copy: {
      properties: {
        region: described(ref('Region'), 'Source box.'),
        to: described(ref('Pos'), "Destination of the source's minimum corner (first copy)."),
        repeat: {
          type: 'integer',
          minimum: 1,
          maximum: SCHEMA_LIMITS.maxRepeat,
          description: 'Number of copies (default 1).',
        },
        step: described(
          ref('Offset'),
          'Offset between consecutive copies. Default: {x: source size along X, y: 0, z: 0}.',
        ),
      },
      required: ['region', 'to'],
    },
    insertModule: {
      properties: {
        moduleId: {
          type: 'string',
          minLength: 1,
          maxLength: SCHEMA_LIMITS.maxModuleIdLength,
          pattern: MODULE_ID_PATTERN,
          description: 'Id of a module from the module catalogue.',
        },
        pos: described(ref('Pos'), "Position of the module's documented anchor."),
        facing: described(ref('HorizontalFacing'), 'Direction the module faces.'),
        params: moduleParams,
      },
      required: ['moduleId', 'pos', 'facing'],
    },
  };
}

const PARAM_VALUE: JsonSchema = {
  anyOf: [
    { type: 'string', maxLength: SCHEMA_LIMITS.maxParamStringLength },
    { type: 'number' },
    { type: 'boolean' },
  ],
};

const OP_PARAMS: JsonSchema = {
  type: 'object',
  description: 'Module-specific parameters (checked by the module).',
  maxProperties: SCHEMA_LIMITS.maxModuleParams,
  propertyNames: { maxLength: SCHEMA_LIMITS.maxParamNameLength, pattern: PARAM_NAME_PATTERN },
  additionalProperties: PARAM_VALUE,
};

const TOOL_PARAMS: JsonSchema = {
  type: 'array',
  description: 'Module-specific parameters as name/value pairs (names must be unique).',
  maxItems: SCHEMA_LIMITS.maxModuleParams,
  items: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        minLength: 1,
        maxLength: SCHEMA_LIMITS.maxParamNameLength,
        pattern: PARAM_NAME_PATTERN,
      },
      value: PARAM_VALUE,
    },
    required: ['name', 'value'],
    additionalProperties: false,
  },
};

function commonDefs(opts: SchemaOptions): Record<string, JsonSchema> {
  const bound = opts.maxAbsCoord;
  // No description on the coordinate itself: it is repeated many times in tool schemas.
  const coordinate: JsonSchema =
    bound === null ? { type: 'integer' } : { type: 'integer', minimum: -bound, maximum: bound };
  const range = bound === null ? '' : ` in [-${bound}, ${bound}]`;
  const xyz = (description: string): JsonSchema => ({
    type: 'object',
    description,
    properties: { x: ref('Coordinate'), y: ref('Coordinate'), z: ref('Coordinate') },
    required: ['x', 'y', 'z'],
    additionalProperties: false,
  });
  return {
    Coordinate: coordinate,
    Pos: xyz(
      `Block position, integers${range}. Y is up; north = -Z, south = +Z, east = +X, west = -X.`,
    ),
    Offset: xyz(`Integer offset (x, y, z), each${range}.`),
    Region: {
      type: 'object',
      description: 'Inclusive box between two corner cells (any order).',
      properties: { from: ref('Pos'), to: ref('Pos') },
      required: ['from', 'to'],
      additionalProperties: false,
    },
    Block: {
      type: 'string',
      minLength: 1,
      maxLength: SCHEMA_LIMITS.maxBlockArgLength,
      pattern: BLOCK_ARG_PATTERN,
      description:
        'Java Edition blockstate, e.g. "minecraft:stone_bricks" or "minecraft:oak_stairs[facing=east,half=top]". Namespace optional; omitted properties take their defaults.',
    },
    BlockList: {
      type: 'array',
      minItems: 1,
      maxItems: SCHEMA_LIMITS.maxOnlyReplace,
      items: ref('Block'),
    },
    HorizontalFacing: { type: 'string', enum: ['north', 'east', 'south', 'west'] },
  };
}

/** Builds the full schema document: shared `$defs`, every operation and every tool input. */
export function buildDslSchema(opts: SchemaOptions): JsonSchema {
  const defs: Record<string, JsonSchema> = commonDefs(opts);
  const opShape = opShapes(OP_PARAMS);
  const toolShape = opShapes(TOOL_PARAMS);
  for (const { op, def } of OPERATION_TABLE) {
    const shape = opShape[op];
    defs[def] = {
      type: 'object',
      properties: { op: { const: op }, ...shape.properties },
      required: ['op', ...shape.required],
      additionalProperties: false,
    };
  }
  for (const { op, def } of OPERATION_TABLE) {
    const shape = toolShape[op];
    defs[toolInputDefName(def)] = {
      type: 'object',
      properties: shape.properties,
      required: shape.required,
      additionalProperties: false,
    };
  }
  return {
    $schema: JSON_SCHEMA_DIALECT,
    $id: LARA_DSL_SCHEMA_ID,
    title: 'Lara build operation',
    description:
      'One Lara DSL operation (see libs/lara-dsl/src/lib/types.ts). Tool call arguments of tool <name> validate against $defs/<Op>ToolInput (see lara-tools.json for the name mapping). Generated by `nx run lara-dsl:schema`; do not edit.',
    oneOf: OPERATION_TABLE.map((e) => ref(e.def)),
    $defs: defs,
  };
}

/** The schema with the default coordinate bound (this is what `lara-dsl.schema.json` contains). */
export const OPERATION_SCHEMA: JsonSchema = buildDslSchema({
  maxAbsCoord: DEFAULT_DSL_LIMITS.maxAbsCoord,
});

/** Schema without coordinate bounds: the validator checks bounds against the actual limits. */
export const STRUCTURAL_SCHEMA: JsonSchema = buildDslSchema({ maxAbsCoord: null });

export function operationDef(op: OperationName): string {
  const entry = OPERATION_TABLE.find((e) => e.op === op);
  if (!entry) throw new Error(`Unknown operation ${op}`);
  return entry.def;
}
