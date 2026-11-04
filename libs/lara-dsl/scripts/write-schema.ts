/**
 * Writes the generated Lara DSL schema files (JSON Schema + tool definitions).
 *
 *   pnpm exec nx run lara-dsl:schema
 *   pnpm exec tsx --tsconfig tsconfig.base.json libs/lara-dsl/scripts/write-schema.ts [--check]
 *
 * `--check` writes nothing and fails when a file is missing or out of date.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { SCHEMA_DIR, schemaFiles } from '../src/lib/schema/schema-files';

const check = process.argv.includes('--check');

async function main(): Promise<void> {
  mkdirSync(SCHEMA_DIR, { recursive: true });
  let stale = 0;
  for (const [name, content] of Object.entries(schemaFiles())) {
    const path = join(SCHEMA_DIR, name);
    const options = (await resolveConfig(path)) ?? {};
    const text = await format(JSON.stringify(content), { ...options, filepath: path });
    const current = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
    if (current === text) continue;
    if (check) {
      console.error(`${path} is out of date; run \`pnpm exec nx run lara-dsl:schema\``);
      stale++;
    } else {
      writeFileSync(path, text);
      console.log(`wrote ${path}`);
    }
  }
  if (stale) process.exit(1);
}

void main();
