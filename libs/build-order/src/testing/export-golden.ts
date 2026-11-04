/** Dev helper: writes every golden build as a `.lcb.json` file. Usage: tsx export-golden.ts <outDir> */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createJavaBlockRegistry, serializeBuildToString } from '@laracraft/core-model';
import { GOLDEN_BUILDS } from './golden';

const out = process.argv[2] ?? '.';
const registry = createJavaBlockRegistry();
for (const g of GOLDEN_BUILDS) {
  const doc = g.create(registry);
  doc.metadata.name = g.name;
  writeFileSync(join(out, `${g.name}.lcb.json`), serializeBuildToString(doc));
}
