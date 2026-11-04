import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { registry, testModules } from '../../testing/helpers';
import { validateToolCall } from '../validate/validate-operation';
import { type JsonSchema, validateJsonSchema } from './json-schema';
import {
  OPERATION_NAMES,
  OPERATION_SCHEMA,
  OPERATION_TABLE,
  toolInputDefName,
} from './operation-schema';
import { SCHEMA_DIR, schemaFiles } from './schema-files';
import {
  LARA_TOOL_EXAMPLES,
  LARA_TOOLS,
  operationToToolInput,
  toolInputToOperation,
} from './tools';

const workspaceRoot = join(import.meta.dirname, '../../../../..');

describe('generated schema files', () => {
  it.each(Object.keys(schemaFiles()))('%s is committed and up to date', (name) => {
    const path = join(workspaceRoot, SCHEMA_DIR, name);
    const committed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    const expected: unknown = JSON.parse(JSON.stringify(schemaFiles()[name]));
    // Fails when the schema changed without `pnpm exec nx run lara-dsl:schema`.
    expect(committed).toEqual(expected);
  });
});

describe('OPERATION_SCHEMA', () => {
  it('is a draft 2020-12 schema with one $def per operation and tool input', () => {
    expect(OPERATION_SCHEMA.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(OPERATION_SCHEMA.oneOf).toHaveLength(OPERATION_NAMES.length);
    for (const { def } of OPERATION_TABLE) {
      expect(OPERATION_SCHEMA.$defs?.[def]).toBeDefined();
      expect(OPERATION_SCHEMA.$defs?.[toolInputDefName(def)]).toBeDefined();
    }
  });

  it('every object schema forbids additional properties and requires known fields', () => {
    const visit = (s: JsonSchema, where: string): void => {
      if (s.type === 'object' && s.properties) {
        expect(s.additionalProperties, where).toBe(false);
        for (const r of s.required ?? []) expect(Object.keys(s.properties), where).toContain(r);
      }
      for (const [k, v] of Object.entries(s.properties ?? {})) visit(v, `${where}.${k}`);
      if (s.items) visit(s.items, `${where}[]`);
      for (const v of s.anyOf ?? []) visit(v, where);
    };
    for (const [name, def] of Object.entries(OPERATION_SCHEMA.$defs ?? {})) visit(def, name);
  });

  it('accepts every tool example converted to an operation (oneOf matches exactly one)', () => {
    for (const ex of LARA_TOOL_EXAMPLES) {
      const op = toolInputToOperation(ex.tool, ex.input);
      expect(validateJsonSchema(OPERATION_SCHEMA, op), ex.tool).toEqual([]);
    }
  });

  it('rejects malformed operations', () => {
    const bad: unknown[] = [
      {},
      { op: 'fill' },
      { op: 'fill', region: { from: { x: 0, y: 0, z: 0 }, to: { x: 1, y: 1, z: 1 } } },
      {
        op: 'fill',
        region: { from: { x: 0, y: 0, z: 0 }, to: { x: 1, y: 1, z: 1.5 } },
        block: 'stone',
      },
      {
        op: 'fill',
        region: { from: { x: 0, y: 0, z: 0 }, to: { x: 1, y: 1, z: 9999 } },
        block: 'stone',
      },
      { op: 'placeBlock', pos: { x: 0, y: 0, z: 0 }, block: 'stone', extra: 1 },
      { op: 'rotate', region: { from: { x: 0, y: 0, z: 0 }, to: { x: 1, y: 1, z: 1 } }, turns: 4 },
    ];
    for (const b of bad) expect(validateJsonSchema(OPERATION_SCHEMA, b).length).toBeGreaterThan(0);
  });
});

describe('LARA_TOOLS', () => {
  const FORBIDDEN = [
    'minimum',
    'maximum',
    'minLength',
    'maxLength',
    'pattern',
    'maxItems',
    'oneOf',
    '$ref',
    'propertyNames',
    'maxProperties',
  ];

  it('has one tool per operation with valid, unique names', () => {
    expect(LARA_TOOLS.map((t) => t.name)).toEqual(OPERATION_TABLE.map((e) => e.tool));
    for (const t of LARA_TOOLS) {
      expect(t.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
      expect(t.description.length).toBeGreaterThan(80);
      expect(t.description).toContain('Examples:');
    }
  });

  it('input schemas are strict-tool compatible', () => {
    let optional = 0;
    let unions = 0;
    const visit = (s: JsonSchema, where: string): void => {
      for (const k of FORBIDDEN) expect(Object.keys(s), `${where} uses ${k}`).not.toContain(k);
      if (s.minItems !== undefined) expect(s.minItems).toBeLessThanOrEqual(1);
      if (s.anyOf) unions++;
      if (s.type === 'object') {
        expect(s.additionalProperties, where).toBe(false);
        const props = Object.keys(s.properties ?? {});
        for (const r of s.required ?? []) expect(props, where).toContain(r);
        optional += props.filter((p) => !(s.required ?? []).includes(p)).length;
      }
      for (const [k, v] of Object.entries(s.properties ?? {})) visit(v, `${where}.${k}`);
      if (s.items) visit(s.items, `${where}[]`);
      for (const v of s.anyOf ?? []) visit(v, where);
    };
    for (const t of LARA_TOOLS) {
      expect(t.input_schema.type).toBe('object');
      visit(t.input_schema, t.name);
    }
    // Anthropic structured-output limits across all strict tools of a request.
    expect(LARA_TOOLS.length).toBeLessThanOrEqual(20);
    expect(optional).toBeLessThanOrEqual(24);
    expect(unions).toBeLessThanOrEqual(16);
  });

  it('every example in the descriptions validates (strict schema, full schema, semantics)', () => {
    expect(LARA_TOOL_EXAMPLES.length).toBeGreaterThanOrEqual(LARA_TOOLS.length);
    for (const ex of LARA_TOOL_EXAMPLES) {
      const tool = LARA_TOOLS.find((t) => t.name === ex.tool) as (typeof LARA_TOOLS)[number];
      expect(tool.description).toContain(JSON.stringify(ex.input));
      expect(validateJsonSchema(tool.input_schema, ex.input), ex.tool).toEqual([]);
      const def = OPERATION_TABLE.find((e) => e.tool === ex.tool)?.def as string;
      expect(
        validateJsonSchema(
          { $ref: `#/$defs/${toolInputDefName(def)}` },
          ex.input,
          OPERATION_SCHEMA,
        ),
      ).toEqual([]);
      const result = validateToolCall(ex.tool, ex.input, registry, undefined, {
        modules: testModules,
      });
      expect(result, `${ex.tool}: ${JSON.stringify(result)}`).toMatchObject({ ok: true });
    }
  });

  it('every example of the JSON descriptions is parseable JSON', () => {
    for (const t of LARA_TOOLS) {
      for (const line of t.description.split('\n').filter((l) => l.startsWith('- '))) {
        const json = line.slice(line.indexOf(': {') + 2);
        expect(() => JSON.parse(json) as unknown, line).not.toThrow();
      }
    }
  });

  it('tool input ↔ operation conversion round-trips', () => {
    for (const ex of LARA_TOOL_EXAMPLES) {
      const result = validateToolCall(ex.tool, ex.input, registry, undefined, {
        modules: testModules,
      });
      if (!result.ok) throw new Error(JSON.stringify(result.errors));
      expect(operationToToolInput(result.operation)).toEqual({ name: ex.tool, input: ex.input });
    }
  });
});
