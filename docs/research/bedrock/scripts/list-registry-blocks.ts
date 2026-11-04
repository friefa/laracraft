/**
 * Prints every block of the bundled Java registry with its properties as JSON
 * (input for `derive-mapping.py`). Research helper for package B0, not shipped.
 *
 * Usage (repo root):
 *   pnpm exec tsx docs/research/bedrock/scripts/list-registry-blocks.ts > registry-blocks.json
 */
import {
  JAVA_BLOCKS,
  JAVA_REGISTRY_VERSION,
} from '../../../../libs/core-model/src/lib/registry/java-registry';

const blocks = JAVA_BLOCKS.map((def) => ({
  id: def.id,
  category: def.category,
  properties: Object.fromEntries(
    Object.entries(def.properties).map(([name, p]) => [
      name,
      { values: [...p.values], default: p.default },
    ]),
  ),
}));

process.stdout.write(
  JSON.stringify({ javaVersion: JAVA_REGISTRY_VERSION, count: blocks.length, blocks }, null, 2) +
    '\n',
);
