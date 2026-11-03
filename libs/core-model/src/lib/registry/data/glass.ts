import type { BlockDefinition } from '../types';
import { cube, pane } from './helpers';

/**
 * Glass. `solid: true`: in modern Java (1.14+ sturdy-face rules) glass has a
 * full, sturdy collision face, so torches/buttons/levers can attach to its top
 * AND sides (old pre-1.13 behaviour allowed top only; Bedrock differs). It is
 * not a redstone conductor — that is a separate concern for the redstone sim.
 * Panes are never attachment surfaces.
 */
const STAINED = ['white', 'black', 'red', 'blue', 'light_blue'] as const;

export const GLASS_BLOCKS: readonly BlockDefinition[] = [
  cube('glass', 'glass', { layer: 'cutout', tags: ['glass', 'window', 'clear'] }),
  pane(
    'glass_pane',
    'glass',
    { top: 'glass_pane_top', bottom: 'glass_pane_top', side: 'glass' },
    'cutout',
    ['glass', 'pane', 'window'],
  ),
  ...STAINED.flatMap((color) => [
    cube(`${color}_stained_glass`, 'glass', {
      layer: 'translucent',
      tags: [...color.split('_'), 'stained', 'glass'],
    }),
    pane(
      `${color}_stained_glass_pane`,
      'glass',
      {
        top: `${color}_stained_glass_pane_top`,
        bottom: `${color}_stained_glass_pane_top`,
        side: `${color}_stained_glass`,
      },
      'translucent',
      [...color.split('_'), 'stained', 'glass', 'pane', 'window'],
    ),
  ]),
];
