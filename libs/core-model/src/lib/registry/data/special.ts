import type { BlockDefinition } from '../types';
import { NO_ITEM, block, facing6, prop, range, rules } from './helpers';

const technical = (path: string, tags: string[], extra: Partial<BlockDefinition> = {}) =>
  ({
    ...block(path, {
      category: 'technical',
      shape: 'none',
      layer: 'cutout',
      solid: false,
      item: NO_ITEM,
      tags,
    }),
    ...extra,
  }) satisfies BlockDefinition;

/** Air variants and non-placeable technical blocks: never rendered, cost nothing. */
export const TECHNICAL_BLOCKS: readonly BlockDefinition[] = [
  technical('air', ['air', 'empty']),
  technical('cave_air', ['air', 'cave']),
  technical('void_air', ['air', 'void']),
  // Block-entity stand-in while a piston moves blocks (Java renders it invisible).
  technical('moving_piston', ['piston', 'moving', 'technical'], {
    properties: { facing: facing6(), type: prop(['normal', 'sticky'], 'normal') },
  }),
];

/**
 * Fluids. `level=0` is a source block (placed with a bucket, costs one bucket);
 * levels 1–15 are flowing fluid that appears on its own and costs nothing.
 */
const fluid = (path: string, layer: 'translucent' | 'opaque', light?: number): BlockDefinition => {
  const counts: Record<string, number> = { '0': 1 };
  for (let i = 1; i <= 15; i++) counts[String(i)] = 0;
  return block(path, {
    category: 'fluid',
    shape: 'model',
    modelId: 'fluid',
    layer,
    textures: { top: `${path}_still`, bottom: `${path}_still`, side: `${path}_flow` },
    ...(light ? { lightEmission: light } : {}),
    solid: false,
    fluid: true,
    properties: { level: range(0, 15, 0) },
    placement: rules(['level', 'fixed']),
    item: {
      item: `minecraft:${path}_bucket`,
      countByProperty: { property: 'level', counts },
    },
    tags: [path, 'fluid', 'liquid', 'bucket'],
  });
};

export const FLUID_BLOCKS: readonly BlockDefinition[] = [
  fluid('water', 'translucent'),
  fluid('lava', 'opaque', 15),
];
