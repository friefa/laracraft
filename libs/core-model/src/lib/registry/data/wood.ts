import type { BlockDefinition } from '../types';
import {
  block,
  button,
  cube,
  door,
  fence,
  fenceGate,
  pillar,
  pressurePlate,
  range,
  slab,
  stairs,
  trapdoor,
  waterlogged,
  bool,
} from './helpers';

export const WOOD_TYPES = ['oak', 'spruce', 'birch', 'dark_oak'] as const;
export type WoodType = (typeof WOOD_TYPES)[number];

/**
 * Leaves. Java: `distance` 1–7 (default 7), `persistent` (default false),
 * `waterlogged`. Player-placed leaves are always `persistent=true`. Java's LeavesBlock overrides its support shape to empty, so torches,
 * buttons etc. cannot attach to leaves (`solid: false`) although they render
 * as full cutout cubes.
 */
const leaves = (wood: WoodType): BlockDefinition =>
  block(`${wood}_leaves`, {
    category: 'natural',
    layer: 'cutout',
    solid: false,
    properties: { distance: range(1, 7, 7), persistent: bool(), waterlogged: waterlogged() },
    placement: [
      { property: 'distance', source: 'neighbors' },
      { property: 'persistent', source: 'fixed', value: 'true' },
    ],
    tags: [wood, 'leaves', 'foliage', 'tree'],
  });

/** Full wood family: log, planks, stairs, slab, fence, fence gate, door, trapdoor, button, plate, leaves. */
export function woodFamily(wood: WoodType): BlockDefinition[] {
  const planks = `${wood}_planks`;
  const planksTex = { all: planks };
  return [
    pillar(`${wood}_log`, 'wood', { end: `${wood}_log_top`, side: `${wood}_log` }, [
      wood,
      'log',
      'wood',
      'tree',
    ]),
    cube(planks, 'wood', { tags: [wood, 'planks', 'wood'] }),
    stairs(`${wood}_stairs`, 'wood', planksTex),
    slab(`${wood}_slab`, 'wood', planksTex),
    fence(`${wood}_fence`, 'wood', planks),
    fenceGate(`${wood}_fence_gate`, 'wood', planks),
    door(`${wood}_door`, 'wood', `${wood}_door`),
    trapdoor(`${wood}_trapdoor`, 'wood', `${wood}_trapdoor`),
    button(`${wood}_button`, 'redstone', planks),
    pressurePlate(`${wood}_pressure_plate`, 'redstone', planks),
    leaves(wood),
  ];
}

export const WOOD_BLOCKS: readonly BlockDefinition[] = WOOD_TYPES.flatMap(woodFamily);
