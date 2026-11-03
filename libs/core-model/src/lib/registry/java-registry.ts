import { createBlockRegistry } from './registry';
import type { BlockDefinition, BlockRegistry } from './types';
import { COLORED_BLOCKS } from './data/colored';
import { GLASS_BLOCKS } from './data/glass';
import { NATURAL_BLOCKS } from './data/natural';
import { REDSTONE_BLOCKS } from './data/redstone';
import { FLUID_BLOCKS, TECHNICAL_BLOCKS } from './data/special';
import { STONE_BLOCKS } from './data/stone';
import { LIGHTING_BLOCKS, UTILITY_BLOCKS } from './data/utility';
import { WOOD_BLOCKS } from './data/wood';

/** Targeted Java Edition version of the bundled block data. */
export const JAVA_REGISTRY_VERSION = '1.21.x';

/** All bundled Java Edition block definitions (pure data). */
export const JAVA_BLOCKS: readonly BlockDefinition[] = Object.freeze([
  ...TECHNICAL_BLOCKS,
  ...NATURAL_BLOCKS,
  ...STONE_BLOCKS,
  ...WOOD_BLOCKS,
  ...COLORED_BLOCKS,
  ...GLASS_BLOCKS,
  ...UTILITY_BLOCKS,
  ...LIGHTING_BLOCKS,
  ...FLUID_BLOCKS,
  ...REDSTONE_BLOCKS,
]);

export function createJavaBlockRegistry(): BlockRegistry {
  return createBlockRegistry(JAVA_REGISTRY_VERSION, JAVA_BLOCKS);
}

/** Sorted, unique texture names referenced by `render.textures` of all blocks. */
export function collectTextureNames(registry: BlockRegistry): string[] {
  const names = new Set<string>();
  for (const def of registry.all()) {
    const textures = def.render.textures;
    if (!textures) continue;
    const values = 'faces' in textures ? Object.values(textures.faces) : Object.values(textures);
    for (const name of values) if (typeof name === 'string') names.add(name);
  }
  return [...names].sort();
}
