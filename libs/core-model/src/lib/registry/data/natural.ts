import type { BlockDefinition } from '../types';
import { bool, cube, rules } from './helpers';

/** Falling blocks: no support needed, but they drop if nothing is below (`gravity`). */
const falling = (path: string, tags: string[]): BlockDefinition =>
  cube(path, 'natural', { gravity: true, tags });

export const NATURAL_BLOCKS: readonly BlockDefinition[] = [
  cube('dirt', 'natural'),
  cube('coarse_dirt', 'natural'),
  cube('grass_block', 'natural', {
    // Java: `snowy` is true when snow (layer/block) is directly above.
    properties: { snowy: bool() },
    placement: rules(['snowy', 'neighbors']),
    textures: { top: 'grass_block_top', bottom: 'dirt', side: 'grass_block_side' },
    tags: ['grass', 'dirt', 'ground'],
  }),
  falling('sand', ['sand', 'beach', 'desert', 'gravity']),
  falling('red_sand', ['red', 'sand', 'mesa', 'badlands', 'gravity']),
  falling('gravel', ['gravel', 'gravity']),
  cube('clay', 'natural'),
  cube('snow_block', 'natural', { textures: { all: 'snow' }, tags: ['snow', 'white'] }),
  cube('ice', 'natural', { layer: 'translucent', tags: ['ice', 'frozen', 'slippery'] }),
];
