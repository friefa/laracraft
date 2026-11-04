/**
 * The JSON Schema (draft 2020-12) subset used by the Lara DSL, plus a tiny validator for it.
 *
 * Why hand-written: the DSL schema uses ~15 keywords, the validator must never throw on
 * arbitrary model output, and its error paths/messages go straight back to the model.
 * A general validator (Ajv & co.) would add a large dependency to an engine lib that runs
 * in Web Workers, for features we do not use. The schema objects themselves are standard
 * JSON Schema, so the .NET backend validates the same file with any 2020-12 validator.
 */

export type JsonSchemaType = 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean';

export interface JsonSchema {
  readonly $schema?: string;
  readonly $id?: string;
  readonly $ref?: string;
  readonly $defs?: Readonly<Record<string, JsonSchema>>;
  readonly $comment?: string;
  readonly title?: string;
  readonly description?: string;
  readonly type?: JsonSchemaType;
  readonly enum?: readonly (string | number | boolean)[];
  readonly const?: string | number | boolean;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: false | JsonSchema;
  readonly propertyNames?: JsonSchema;
  readonly maxProperties?: number;
  readonly items?: JsonSchema;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly anyOf?: readonly JsonSchema[];
  readonly oneOf?: readonly JsonSchema[];
  readonly examples?: readonly unknown[];
}

export interface SchemaIssue {
  /** JSON pointer into the validated value, e.g. `/region/from/x` ('' = root). */
  readonly path: string;
  readonly message: string;
}

const MAX_DEPTH = 32;

/** Escapes one JSON-pointer segment (RFC 6901). */
export const pointerSegment = (key: string | number): string =>
  String(key).replace(/~/g, '~0').replace(/\//g, '~1');

export const describeValue = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    return Number.isInteger(value) ? `integer ${value}` : `number ${value}`;
  }
  if (typeof value === 'string') {
    const shown = value.length > 40 ? `${value.slice(0, 40)}…` : value;
    return `string ${JSON.stringify(shown)}`;
  }
  return typeof value;
};

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function matchesType(type: JsonSchemaType, value: unknown): boolean {
  switch (type) {
    case 'object':
      return isPlainObject(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isSafeInteger(value);
  }
}

const patternCache = new Map<string, RegExp>();
function regex(pattern: string): RegExp {
  let re = patternCache.get(pattern);
  if (!re) {
    re = new RegExp(pattern, 'u');
    patternCache.set(pattern, re);
  }
  return re;
}

function resolveRef(root: JsonSchema, ref: string): JsonSchema | undefined {
  const prefix = '#/$defs/';
  if (!ref.startsWith(prefix)) return undefined;
  const name = ref.slice(prefix.length);
  return root.$defs && Object.hasOwn(root.$defs, name) ? root.$defs[name] : undefined;
}

/**
 * Validates `value` against `schema` (subset above). Never throws for any input value;
 * returns all issues found (an empty array means valid). `root` resolves `$ref`s.
 */
export function validateJsonSchema(
  schema: JsonSchema,
  value: unknown,
  root: JsonSchema = schema,
): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  check(schema, value, '', root, issues, 0);
  return issues;
}

function check(
  schema: JsonSchema,
  value: unknown,
  path: string,
  root: JsonSchema,
  issues: SchemaIssue[],
  depth: number,
): void {
  if (depth > MAX_DEPTH) {
    issues.push({ path, message: 'value is nested too deeply' });
    return;
  }
  if (schema.$ref !== undefined) {
    const target = resolveRef(root, schema.$ref);
    if (!target) {
      issues.push({ path, message: `schema error: unresolved $ref ${schema.$ref}` });
      return;
    }
    check(target, value, path, root, issues, depth + 1);
  }
  if (schema.type !== undefined && !matchesType(schema.type, value)) {
    issues.push({ path, message: `expected ${schema.type}, got ${describeValue(value)}` });
    return;
  }
  if (schema.const !== undefined && value !== schema.const) {
    issues.push({
      path,
      message: `must be ${JSON.stringify(schema.const)}, got ${describeValue(value)}`,
    });
    return;
  }
  if (schema.enum !== undefined && !schema.enum.some((e) => e === value)) {
    issues.push({
      path,
      message: `must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}, got ${describeValue(value)}`,
    });
    return;
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push({ path, message: `must be >= ${schema.minimum}, got ${value}` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push({ path, message: `must be <= ${schema.maximum}, got ${value}` });
    }
  }
  if (typeof value === 'string') {
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength) {
      issues.push({ path, message: `must not be shorter than ${schema.minLength} characters` });
    }
    if (schema.maxLength !== undefined && length > schema.maxLength) {
      issues.push({ path, message: `must not be longer than ${schema.maxLength} characters` });
    }
    if (schema.pattern !== undefined && !regex(schema.pattern).test(value)) {
      issues.push({ path, message: `${describeValue(value)} has an invalid format` });
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issues.push({ path, message: `needs at least ${schema.minItems} item(s)` });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      issues.push({ path, message: `allows at most ${schema.maxItems} items` });
    }
    if (schema.items !== undefined) {
      // Do not walk huge arrays that are already rejected by maxItems.
      const n = Math.min(value.length, schema.maxItems ?? value.length, 1024);
      for (let i = 0; i < n; i++) {
        check(schema.items, value[i], `${path}/${i}`, root, issues, depth + 1);
      }
    }
  }
  if (isPlainObject(value)) {
    const props = schema.properties ?? {};
    const keys = Object.keys(value);
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) {
      issues.push({ path, message: `allows at most ${schema.maxProperties} properties` });
      return;
    }
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) {
        issues.push({ path, message: `missing required property "${key}"` });
      }
    }
    for (const key of keys) {
      const keyPath = `${path}/${pointerSegment(key)}`;
      if (schema.propertyNames !== undefined) {
        const sub: SchemaIssue[] = [];
        check(schema.propertyNames, key, keyPath, root, sub, depth + 1);
        if (sub.length > 0) {
          issues.push({ path: keyPath, message: `invalid property name "${key}"` });
          continue;
        }
      }
      const sub = Object.hasOwn(props, key) ? props[key] : undefined;
      if (sub) {
        check(sub, value[key], keyPath, root, issues, depth + 1);
      } else if (typeof schema.additionalProperties === 'object') {
        check(schema.additionalProperties, value[key], keyPath, root, issues, depth + 1);
      } else if (schema.additionalProperties === false) {
        const known = Object.keys(props);
        issues.push({
          path: keyPath,
          message: `unknown property "${key}"${known.length ? ` (allowed: ${known.join(', ')})` : ''}`,
        });
      }
    }
  }
  if (schema.anyOf !== undefined) {
    const results = schema.anyOf.map((s) => {
      const sub: SchemaIssue[] = [];
      check(s, value, path, root, sub, depth + 1);
      return sub;
    });
    if (!results.some((r) => r.length === 0)) {
      issues.push({ path, message: `does not match any allowed form (${describeValue(value)})` });
    }
  }
  if (schema.oneOf !== undefined) {
    const matches = schema.oneOf.filter((s) => {
      const sub: SchemaIssue[] = [];
      check(s, value, path, root, sub, depth + 1);
      return sub.length === 0;
    }).length;
    if (matches !== 1) {
      issues.push({
        path,
        message:
          matches === 0
            ? `does not match any allowed form (${describeValue(value)})`
            : 'matches more than one form',
      });
    }
  }
}
