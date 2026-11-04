/**
 * Writes every golden build as a `.lcb.json` file (format v1).
 *
 *   pnpm exec tsx --tsconfig tsconfig.base.json libs/build-order/scripts/export-golden.ts <outDir>
 *   pnpm exec tsx --tsconfig tsconfig.base.json libs/build-order/scripts/export-golden.ts <outDir> --check
 *
 * The app ships these files as example builds (`apps/laracraft/public/examples`, targets
 * `laracraft:examples` and `laracraft:examples-check`). `--check` writes nothing and fails when
 * a file is missing, differs from the current golden build or has no golden build any more.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createJavaBlockRegistry, serializeBuildToString } from '@laracraft/core-model';
import { GOLDEN_BUILDS } from '../src/testing/golden';

const EXTENSION = '.lcb.json';

const args = process.argv.slice(2);
const check = args.includes('--check');
const out = args.find((a) => !a.startsWith('--')) ?? '.';

const registry = createJavaBlockRegistry();
const expected = new Map<string, string>();
for (const g of GOLDEN_BUILDS) {
  const doc = g.create(registry);
  doc.metadata.name = g.name;
  expected.set(`${g.name}${EXTENSION}`, serializeBuildToString(doc) + '\n');
}

if (check) {
  const problems: string[] = [];
  for (const [file, content] of expected) {
    const path = join(out, file);
    if (!existsSync(path)) problems.push(`missing: ${path}`);
    else if (readFileSync(path, 'utf8') !== content) problems.push(`stale: ${path}`);
  }
  const present = existsSync(out) ? readdirSync(out).filter((f) => f.endsWith(EXTENSION)) : [];
  for (const file of present) {
    if (!expected.has(file)) problems.push(`no golden build: ${join(out, file)}`);
  }
  if (problems.length > 0) {
    console.error(
      `Golden build files are out of date:\n  ${problems.join('\n  ')}\n` +
        'Regenerate them (for the app: pnpm exec nx run laracraft:examples).',
    );
    process.exit(1);
  }
  console.log(`OK: ${expected.size} golden build files in ${out} are up to date.`);
} else {
  mkdirSync(out, { recursive: true });
  for (const [file, content] of expected) writeFileSync(join(out, file), content);
  console.log(`Wrote ${expected.size} golden build files to ${out}.`);
}
