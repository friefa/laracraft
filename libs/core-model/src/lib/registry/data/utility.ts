import type { BlockDefinition } from '../types';
import {
  block,
  bool,
  cube,
  facing6,
  horizontalFacing,
  pane,
  prop,
  rules,
  waterlogged,
} from './helpers';

/** Utility, storage, decoration and lighting blocks. */
export const UTILITY_BLOCKS: readonly BlockDefinition[] = [
  cube('bookshelf', 'decoration', {
    textures: { top: 'oak_planks', bottom: 'oak_planks', side: 'bookshelf' },
    tags: ['bookshelf', 'books', 'enchanting', 'library'],
  }),
  cube('crafting_table', 'utility', {
    textures: {
      faces: {
        up: 'crafting_table_top',
        down: 'oak_planks',
        north: 'crafting_table_front',
        west: 'crafting_table_front',
        side: 'crafting_table_side',
      },
    },
    tags: ['crafting', 'table', 'workbench'],
  }),
  cube('furnace', 'utility', {
    properties: { facing: horizontalFacing(), lit: bool() },
    // Java: front faces the player → `facing` = opposite of look direction.
    placement: rules(['facing', 'playerFacingOpposite'], ['lit', 'fixed']),
    textures: {
      faces: {
        north: 'furnace_front',
        up: 'furnace_top',
        down: 'furnace_top',
        side: 'furnace_side',
      },
    },
    redstone: { role: 'container' },
    tags: ['furnace', 'smelt', 'cook', 'oven'],
  }),
  block('chest', {
    category: 'utility',
    shape: 'model',
    modelId: 'chest',
    // Own drawings (pack laracraft_own); double chest halves add `_left` / `_right` variants.
    textures: {
      faces: { north: 'chest_front', up: 'chest_top', down: 'chest_top', side: 'chest_side' },
    },
    solid: false,
    properties: {
      facing: horizontalFacing(),
      type: prop(['single', 'left', 'right'], 'single'),
      waterlogged: waterlogged(),
    },
    // Java: lid/front faces the player → `facing` = opposite of look direction.
    // `type` (double chest half) is derived from an adjacent chest with the same
    // facing (sneaking prevents joining) — each half costs one chest.
    placement: rules(['facing', 'playerFacingOpposite'], ['type', 'neighbors']),
    redstone: { role: 'container' },
    tags: ['chest', 'storage'],
  }),
  cube('barrel', 'utility', {
    properties: { facing: facing6(), open: bool() },
    // Java: BarrelBlock uses nearestLookingDirection().getOpposite() → the lid
    // faces the player (3D: looking down places it lid-up).
    placement: rules(['facing', 'playerLook3dOpposite'], ['open', 'fixed']),
    textures: {
      faces: { north: 'barrel_top', south: 'barrel_bottom', side: 'barrel_side' },
    },
    redstone: { role: 'container' },
    tags: ['barrel', 'storage'],
  }),
  block('ladder', {
    category: 'utility',
    shape: 'model',
    modelId: 'ladder',
    layer: 'cutout',
    solid: false,
    properties: { facing: horizontalFacing(), waterlogged: waterlogged() },
    // Ladder hangs on the block opposite of `facing`; `facing` = clicked face.
    support: { kind: 'facing', property: 'facing' },
    placement: rules(['facing', 'clickedFace']),
    tags: ['ladder', 'climb'],
  }),
  pane('iron_bars', 'decoration', { all: 'iron_bars' }, 'cutout', [
    'iron',
    'bars',
    'fence',
    'jail',
  ]),
  cube('iron_block', 'building', { tags: ['iron', 'metal', 'block'] }),
  cube('gold_block', 'building', { tags: ['gold', 'metal', 'block'] }),
  cube('diamond_block', 'building', { tags: ['diamond', 'block'] }),
];

export const LIGHTING_BLOCKS: readonly BlockDefinition[] = [
  block('torch', {
    category: 'lighting',
    shape: 'model',
    modelId: 'torch',
    layer: 'cutout',
    lightEmission: 14,
    support: { kind: 'below', needs: 'center' },
    tags: ['torch', 'light'],
  }),
  block('wall_torch', {
    category: 'lighting',
    shape: 'model',
    modelId: 'wall_torch',
    layer: 'cutout',
    lightEmission: 14,
    textures: { all: 'torch' },
    properties: { facing: horizontalFacing() },
    // Hangs on the block opposite of `facing`; `facing` = clicked face (points away from the wall).
    support: { kind: 'facing', property: 'facing' },
    placement: rules(['facing', 'clickedFace']),
    item: { item: 'minecraft:torch' },
    tags: ['torch', 'wall', 'light'],
  }),
  block('lantern', {
    category: 'lighting',
    shape: 'model',
    modelId: 'lantern',
    layer: 'cutout',
    lightEmission: 15,
    properties: { hanging: bool(), waterlogged: waterlogged() },
    // Java: clicking the underside of a block → hanging=true (needs block above);
    // otherwise standing (needs block below).
    support: {
      kind: 'conditional',
      property: 'hanging',
      cases: {
        true: { kind: 'ceiling', needs: 'center' },
        false: { kind: 'below', needs: 'center' },
      },
    },
    placement: rules(['hanging', 'clickedFace']),
    tags: ['lantern', 'light', 'lamp'],
  }),
  cube('glowstone', 'lighting', { lightEmission: 15, tags: ['glowstone', 'light', 'nether'] }),
  cube('sea_lantern', 'lighting', {
    lightEmission: 15,
    tags: ['sea', 'lantern', 'light', 'ocean'],
  }),
];
