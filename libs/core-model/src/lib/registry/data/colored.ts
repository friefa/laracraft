import type { BlockDefinition } from '../types';
import { carpet, cube } from './helpers';

/** Subset of the 16 dye colors we ship for the colored families. */
export const COLORS = [
  'white',
  'light_gray',
  'gray',
  'black',
  'red',
  'blue',
  'yellow',
  'green',
] as const;
export type DyeColor = (typeof COLORS)[number];

const words = (color: DyeColor): string[] => color.split('_');

export function colorFamily(color: DyeColor): BlockDefinition[] {
  return [
    cube(`${color}_wool`, 'colored', { tags: [...words(color), 'wool', 'cloth'] }),
    // Carpet uses the wool texture.
    carpet(`${color}_carpet`, `${color}_wool`),
    cube(`${color}_concrete`, 'colored', { tags: [...words(color), 'concrete'] }),
    cube(`${color}_concrete_powder`, 'colored', {
      gravity: true,
      tags: [...words(color), 'concrete', 'powder', 'gravity'],
    }),
    cube(`${color}_terracotta`, 'colored', { tags: [...words(color), 'terracotta', 'clay'] }),
  ];
}

export const COLORED_BLOCKS: readonly BlockDefinition[] = [
  cube('terracotta', 'colored', { tags: ['terracotta', 'clay', 'hardened'] }),
  ...COLORS.flatMap(colorFamily),
];
