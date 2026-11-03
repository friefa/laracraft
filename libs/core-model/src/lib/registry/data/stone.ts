import type { BlockDefinition, BlockTextures } from '../types';
import { cube, pillar, slab, stairs, wall } from './helpers';

const all = (texture: string): BlockTextures => ({ all: texture });
const sandstoneTex: BlockTextures = {
  top: 'sandstone_top',
  bottom: 'sandstone_bottom',
  side: 'sandstone',
};
const quartzTex: BlockTextures = {
  top: 'quartz_block_top',
  bottom: 'quartz_block_top',
  side: 'quartz_block_side',
};

/** Stone-like full blocks. */
const STONE_CUBES: readonly BlockDefinition[] = [
  cube('stone', 'stone'),
  cube('cobblestone', 'stone'),
  cube('mossy_cobblestone', 'stone'),
  cube('stone_bricks', 'stone'),
  cube('mossy_stone_bricks', 'stone'),
  cube('cracked_stone_bricks', 'stone'),
  cube('chiseled_stone_bricks', 'stone'),
  cube('smooth_stone', 'stone'),
  cube('andesite', 'stone'),
  cube('polished_andesite', 'stone'),
  cube('diorite', 'stone'),
  cube('polished_diorite', 'stone'),
  cube('granite', 'stone'),
  cube('polished_granite', 'stone'),
  // Java: deepslate has `axis` like logs (cobbled/polished/bricks/tiles do not).
  pillar('deepslate', 'stone', { end: 'deepslate_top', side: 'deepslate' }, ['deepslate', 'stone']),
  cube('cobbled_deepslate', 'stone'),
  cube('polished_deepslate', 'stone'),
  cube('deepslate_bricks', 'stone'),
  cube('deepslate_tiles', 'stone'),
  cube('bricks', 'building', { tags: ['bricks', 'brick', 'clay'] }),
  cube('sandstone', 'stone', { textures: sandstoneTex }),
  cube('smooth_sandstone', 'stone', { textures: all('sandstone_top') }),
  cube('cut_sandstone', 'stone', {
    textures: { top: 'sandstone_top', bottom: 'sandstone_top', side: 'cut_sandstone' },
  }),
  cube('chiseled_sandstone', 'stone', {
    textures: { top: 'sandstone_top', bottom: 'sandstone_top', side: 'chiseled_sandstone' },
  }),
  cube('quartz_block', 'building', { textures: quartzTex, tags: ['quartz', 'white', 'nether'] }),
  cube('obsidian', 'stone', { tags: ['obsidian', 'portal', 'blast', 'resistant'] }),
];

/** Stairs / slabs / walls of stone materials. Texture source is the base block. */
const STONE_SHAPES: readonly BlockDefinition[] = [
  stairs('stone_stairs', 'stone', all('stone')),
  slab('stone_slab', 'stone', all('stone')),
  slab('smooth_stone_slab', 'stone', {
    top: 'smooth_stone',
    bottom: 'smooth_stone',
    side: 'smooth_stone_slab_side',
  }),
  stairs('cobblestone_stairs', 'stone', all('cobblestone')),
  slab('cobblestone_slab', 'stone', all('cobblestone')),
  wall('cobblestone_wall', 'stone', 'cobblestone'),
  stairs('stone_brick_stairs', 'stone', all('stone_bricks')),
  slab('stone_brick_slab', 'stone', all('stone_bricks')),
  wall('stone_brick_wall', 'stone', 'stone_bricks'),
  stairs('cobbled_deepslate_stairs', 'stone', all('cobbled_deepslate')),
  slab('cobbled_deepslate_slab', 'stone', all('cobbled_deepslate')),
  wall('cobbled_deepslate_wall', 'stone', 'cobbled_deepslate'),
  stairs('brick_stairs', 'building', all('bricks')),
  slab('brick_slab', 'building', all('bricks')),
  wall('brick_wall', 'building', 'bricks'),
  stairs('sandstone_stairs', 'stone', sandstoneTex),
  slab('sandstone_slab', 'stone', sandstoneTex),
  wall('sandstone_wall', 'stone', 'sandstone'),
  stairs('quartz_stairs', 'building', quartzTex),
  slab('quartz_slab', 'building', quartzTex),
];

export const STONE_BLOCKS: readonly BlockDefinition[] = [...STONE_CUBES, ...STONE_SHAPES];
