import type { Operation, OperationName } from '../types';
import { isPlainObject, type JsonSchema } from './json-schema';
import { OPERATION_SCHEMA, OPERATION_TABLE, toolInputDefName } from './operation-schema';

/**
 * Tool definitions for the LLM: one tool per operation.
 *
 * Why one tool per operation (13 tools) instead of one tool per group or a single
 * `build` tool with a union: every tool gets a flat, small, strict-compatible schema
 * without discriminated unions (strict tool use supports `anyOf` but no `oneOf`, and
 * unions over 13 shapes would cost the model accuracy and the request tokens); each
 * description can document exactly one semantics with its own examples; tool names
 * map 1:1 to `Operation['op']`, so a tool call converts to an operation without guessing.
 * The tool list is static and deterministic, so it is cached together with the system
 * prompt (ADR-0005).
 */

/** Tool definition in the Anthropic Messages API shape (`strict: true` capable). */
export interface LaraTool {
  readonly name: string;
  readonly description: string;
  readonly input_schema: JsonSchema;
}

export interface LaraToolExample {
  readonly tool: string;
  readonly input: Readonly<Record<string, unknown>>;
}

const COMMON =
  'Coordinates are integer block positions in the build (Y up; north = -Z, south = +Z, east = +X, west = -X). Regions are inclusive boxes between two corners given in any order. Blocks are Java Edition blockstates ("minecraft:oak_planks", "minecraft:oak_stairs[facing=east,half=top]"); the namespace is optional, omitted properties take their defaults, unknown blocks or properties are rejected with suggestions.';

const MASK =
  'Optional onlyReplace: list of blocks; only cells currently holding one of them are changed (a bare id matches every state of that block, "minecraft:air" = only empty cells).';

interface ToolDoc {
  readonly summary: string;
  readonly examples: readonly (readonly [string, Readonly<Record<string, unknown>>])[];
}

const DOCS: Readonly<Record<OperationName, ToolDoc>> = {
  fill: {
    summary: `Fills every cell of a region with one block (solid cuboid). ${MASK}`,
    examples: [
      [
        'Stone foundation 9×1×7',
        {
          region: { from: { x: 0, y: 0, z: 0 }, to: { x: 8, y: 0, z: 6 } },
          block: 'minecraft:stone_bricks',
        },
      ],
      [
        'Fill only the empty cells of a box with water',
        {
          region: { from: { x: 1, y: 1, z: 1 }, to: { x: 5, y: 2, z: 5 } },
          block: 'minecraft:water',
          onlyReplace: ['minecraft:air'],
        },
      ],
    ],
  },
  hollowBox: {
    summary: `Builds the six faces (one block thick) of a region: walls, floor and ceiling. The interior becomes air unless keepInterior is true. Typical first step for a room or house body; cut doors and windows afterwards with place_block or clear. ${MASK}`,
    examples: [
      [
        'Room 7×5×7 with planks walls and empty inside',
        {
          region: { from: { x: 0, y: 1, z: 0 }, to: { x: 6, y: 5, z: 6 } },
          block: 'minecraft:oak_planks',
        },
      ],
    ],
  },
  line: {
    summary: `Draws a one-block-thick straight line from "from" to "to" (both inclusive) using 3D Bresenham; diagonal and sloped lines are allowed. Good for beams, posts, fences and edges. ${MASK}`,
    examples: [
      [
        'Vertical log post 4 high',
        {
          from: { x: 0, y: 1, z: 0 },
          to: { x: 0, y: 4, z: 0 },
          block: 'minecraft:oak_log[axis=y]',
        },
      ],
      [
        'Diagonal line',
        { from: { x: 0, y: 5, z: 0 }, to: { x: 6, y: 5, z: 3 }, block: 'minecraft:cobblestone' },
      ],
    ],
  },
  wall: {
    summary: `Builds a vertical wall, one block thick, along the horizontal line from (from.x, from.z) to (to.x, to.z) (inclusive; diagonal lines use Bresenham), from layer from.y up to from.y + height - 1. to.y must equal from.y. ${MASK}`,
    examples: [
      [
        'Wall along X, 10 long and 4 high',
        {
          from: { x: 0, y: 1, z: 0 },
          to: { x: 9, y: 1, z: 0 },
          height: 4,
          block: 'minecraft:bricks',
        },
      ],
    ],
  },
  floor: {
    summary: `Places one horizontal layer at height y over the X/Z footprint of region (the region's Y values are ignored). ${MASK}`,
    examples: [
      [
        'Plank floor at y = 1',
        {
          region: { from: { x: 1, y: 0, z: 1 }, to: { x: 7, y: 0, z: 5 } },
          y: 1,
          block: 'minecraft:spruce_planks',
        },
      ],
    ],
  },
  roof: {
    summary:
      'Builds a roof over the X/Z footprint of region (the building), starting one layer above the region\'s max Y. The footprint is extended by overhang (0-2) on every side. Slopes use "stairs" (bottom half, facing up-slope, i.e. towards the ridge; corner stairs on hip lines); "block" is used for the ridge row when the span is odd, to close the triangular gable ends (gable) or the tall side (shed), and for flat roofs. Types: gable = two slopes meeting at a ridge parallel to ridgeAxis, closed gable ends; hip = slopes on all four sides (ridgeAxis ignored); shed = one slope rising towards north (ridgeAxis "x") or west (ridgeAxis "z"); flat = one layer of "block" (pitch and stairs unused). pitch 1: each row inwards is one layer higher (45°, stairs only); pitch 2: each row is two layers higher with a full block under every stair. ridgeAxis defaults to the longer side of the footprint (x on ties). Height of a gable/hip roof = pitch × ceil(span / 2) for span = footprint width across the ridge including overhang. Only cells of the roof are written; the space under the roof is not changed.',
    examples: [
      [
        'Gable roof over a 9×7 house whose walls end at y = 4, with 1 block overhang',
        {
          region: { from: { x: 0, y: 1, z: 0 }, to: { x: 8, y: 4, z: 6 } },
          type: 'gable',
          pitch: 1,
          stairs: 'minecraft:dark_oak_stairs',
          block: 'minecraft:dark_oak_planks',
          ridgeAxis: 'x',
          overhang: 1,
        },
      ],
      [
        'Steep hip roof',
        {
          region: { from: { x: 0, y: 1, z: 0 }, to: { x: 6, y: 4, z: 6 } },
          type: 'hip',
          pitch: 2,
          stairs: 'minecraft:stone_brick_stairs',
          block: 'minecraft:stone_bricks',
        },
      ],
    ],
  },
  placeBlock: {
    summary:
      'Places a single block at pos (overwrites what is there). Use for details: doors (place the lower half; the upper half "half=upper" separately), torches, windows, furniture.',
    examples: [
      [
        'Door facing south',
        {
          pos: { x: 3, y: 1, z: 6 },
          block: 'minecraft:oak_door[facing=south,half=lower]',
        },
      ],
    ],
  },
  replace: {
    summary:
      'Replaces blocks inside region: every cell matching "from" becomes "to". "from" is a pattern: a bare id ("minecraft:oak_stairs") matches every state of that block, written properties must match. Properties not written in "to" are copied from the replaced block where "to" supports them (so replacing oak_stairs by spruce_stairs keeps orientation); remaining ones take defaults.',
    examples: [
      [
        'Swap all oak stairs for spruce stairs, keeping their orientation',
        {
          region: { from: { x: 0, y: 0, z: 0 }, to: { x: 10, y: 10, z: 10 } },
          from: 'minecraft:oak_stairs',
          to: 'minecraft:spruce_stairs',
        },
      ],
    ],
  },
  clear: {
    summary: 'Sets every cell of region to air (removes blocks). Use to cut doors and windows.',
    examples: [
      ['Door opening 1×2', { region: { from: { x: 3, y: 1, z: 0 }, to: { x: 3, y: 2, z: 0 } } }],
    ],
  },
  mirror: {
    summary:
      'Mirrors the content of region in place: axis "x" flips east/west (X coordinates), axis "z" flips north/south (Z coordinates). Blockstates are mirrored too (stairs, doors, logs …). All cells of the region are rewritten, including air.',
    examples: [
      [
        'Flip a wing east/west',
        { region: { from: { x: 0, y: 0, z: 0 }, to: { x: 4, y: 6, z: 8 } }, axis: 'x' },
      ],
    ],
  },
  rotate: {
    summary:
      "Rotates the content of region clockwise (seen from above) by turns × 90° around the vertical axis, blockstates included. The result is anchored at the region's minimum corner; for 1 or 3 turns the X and Z sizes swap (a 5 wide (X) × 3 deep (Z) footprint becomes 3 wide × 5 deep). Source cells not covered by the result become air; cells covered by the result are overwritten (including with air).",
    examples: [
      [
        'Turn a 5×3 porch by 90°',
        { region: { from: { x: 0, y: 0, z: 0 }, to: { x: 4, y: 3, z: 2 } }, turns: 1 },
      ],
    ],
  },
  copy: {
    summary:
      'Copies the content of region (including air) so that the region\'s minimum corner lands at "to"; with repeat n, copy i (0-based) lands at to + i × step (step defaults to {x: region size along X, y: 0, z: 0}). The source is read before anything is written, so overlapping copies are safe; copies overwrite the destination. Use for rows of windows, columns, fence posts, repeated houses.',
    examples: [
      [
        'Window repeated 4 times, every 3 blocks along X',
        {
          region: { from: { x: 1, y: 2, z: 0 }, to: { x: 1, y: 3, z: 0 } },
          to: { x: 4, y: 2, z: 0 },
          repeat: 4,
          step: { x: 3, y: 0, z: 0 },
        },
      ],
    ],
  },
  insertModule: {
    summary:
      "Inserts a tested module (redstone circuits such as doors, clocks or farms, and prefabricated parts) from the module catalogue. pos is the module's documented anchor, facing its orientation; params are module-specific name/value pairs. Redstone must only be built with this tool. An unknown moduleId is rejected with the list of available modules.",
    examples: [
      [
        'Module facing east with one parameter',
        {
          moduleId: 'piston_door_2x2',
          pos: { x: 5, y: 1, z: 0 },
          facing: 'east',
          params: [{ name: 'sticky', value: true }],
        },
      ],
    ],
  },
};

/** Every example of every tool description (as tool inputs). */
export const LARA_TOOL_EXAMPLES: readonly LaraToolExample[] = OPERATION_TABLE.flatMap(
  ({ op, tool }) => DOCS[op].examples.map(([, input]) => ({ tool, input })),
);

const DROPPED_KEYWORDS = [
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'pattern',
  'maxItems',
  'maxProperties',
  'propertyNames',
  '$comment',
  'examples',
] as const;

/**
 * Converts a schema to the subset accepted by strict tool use: `$ref`s inlined,
 * numeric/string/array bounds removed (they are still enforced by the validator and the
 * backend's schema check) and summarised in the description instead.
 */
export function toStrictToolSchema(schema: JsonSchema, root: JsonSchema = schema): JsonSchema {
  let node: JsonSchema = schema;
  if (schema.$ref) {
    const name = schema.$ref.replace('#/$defs/', '');
    const target = root.$defs?.[name];
    if (!target) throw new Error(`Unresolved ${schema.$ref}`);
    const { $ref: _ref, ...rest } = schema;
    void _ref;
    node = { ...target, ...rest };
  }
  const out: Record<string, unknown> = {};
  const notes: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if ((DROPPED_KEYWORDS as readonly string[]).includes(key)) continue;
    if (key === 'minItems' && typeof value === 'number' && value > 1) continue;
    if (key === '$defs' || key === '$schema' || key === '$id' || key === 'title') continue;
    out[key] = value;
  }
  // Bounds are summarised only on described nodes (not on every coordinate) and only when
  // the description does not mention them already.
  const said = (n: number): boolean => node.description?.includes(String(n)) ?? false;
  if (node.description !== undefined) {
    if (node.minimum !== undefined && node.maximum !== undefined) {
      if (!said(node.maximum)) notes.push(`Range ${node.minimum}..${node.maximum}.`);
    } else if (node.minimum !== undefined && !said(node.minimum)) {
      notes.push(`Minimum ${node.minimum}.`);
    } else if (node.maximum !== undefined && !said(node.maximum)) {
      notes.push(`Maximum ${node.maximum}.`);
    }
    if (node.maxItems !== undefined && !said(node.maxItems)) {
      notes.push(`At most ${node.maxItems} items.`);
    }
  }
  if (node.properties) {
    const props: Record<string, JsonSchema> = {};
    for (const [k, v] of Object.entries(node.properties)) props[k] = toStrictToolSchema(v, root);
    out['properties'] = props;
  }
  if (node.items) out['items'] = toStrictToolSchema(node.items, root);
  if (node.anyOf) out['anyOf'] = node.anyOf.map((s) => toStrictToolSchema(s, root));
  if (typeof node.additionalProperties === 'object') {
    throw new Error('Strict tool schemas need additionalProperties: false');
  }
  if (notes.length) {
    out['description'] = [node.description, ...notes].filter(Boolean).join(' ');
  }
  return out as JsonSchema;
}

function formatExample(input: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(input);
}

function toolDescription(op: OperationName): string {
  const doc = DOCS[op];
  const examples = doc.examples.map(([title, input]) => `- ${title}: ${formatExample(input)}`);
  return `${doc.summary}\n\n${COMMON}\n\nExamples:\n${examples.join('\n')}`;
}

/** One tool per operation, deterministic order (see module docs for the design). */
export const LARA_TOOLS: readonly LaraTool[] = OPERATION_TABLE.map(({ op, tool, def }) => ({
  name: tool,
  description: toolDescription(op),
  input_schema: toStrictToolSchema({ $ref: `#/$defs/${toolInputDefName(def)}` }, OPERATION_SCHEMA),
}));

export const TOOL_NAME_TO_OP: ReadonlyMap<string, OperationName> = new Map(
  OPERATION_TABLE.map((e) => [e.tool, e.op]),
);

export const OP_TO_TOOL_NAME: ReadonlyMap<OperationName, string> = new Map(
  OPERATION_TABLE.map((e) => [e.op, e.tool]),
);

/**
 * Converts structurally valid tool arguments (checked by `validateToolCall`) into an
 * operation candidate for `validateOperation`. Unknown tool names yield `undefined`.
 * `insert_module.params` (list of name/value pairs) becomes the contract's record.
 */
export function toolInputToOperation(name: string, input: unknown): unknown {
  const op = TOOL_NAME_TO_OP.get(name);
  if (op === undefined) return undefined;
  if (!isPlainObject(input)) return input;
  const out: Record<string, unknown> = { ...input, op };
  if (op === 'insertModule' && Array.isArray(input['params'])) {
    const record: Record<string, unknown> = {};
    for (const entry of input['params'] as unknown[]) {
      if (isPlainObject(entry) && typeof entry['name'] === 'string') {
        Object.defineProperty(record, entry['name'], {
          value: entry['value'],
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }
    out['params'] = record;
  }
  return out;
}

/** Inverse of {@link toolInputToOperation}: tool name and arguments for an operation. */
export function operationToToolInput(operation: Operation): {
  readonly name: string;
  readonly input: Record<string, unknown>;
} {
  const { op, ...rest } = operation;
  const name = OP_TO_TOOL_NAME.get(op) as string;
  const input: Record<string, unknown> = { ...rest };
  if (operation.op === 'insertModule' && operation.params) {
    input['params'] = Object.entries(operation.params).map(([n, value]) => ({ name: n, value }));
  }
  return { name, input };
}
