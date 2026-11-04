import type {
  BlockCategory,
  BlockDefinition,
  BlockTextures,
  ItemCost,
  PlacementRule,
  PlacementSource,
  PropertyDefinition,
  RedstoneInfo,
  RenderLayer,
  SupportRule,
  SupportFaces,
} from '../types';

/**
 * Small builders shared by the Java Edition block data files.
 *
 * Conventions used throughout `data/**`:
 * - Property names, values and defaults are copied from the Java Edition
 *   blockstate definitions (1.21.x). Value order follows Java where practical.
 * - Texture names are our own manifest names: `<block>`, `<block>_top`,
 *   `<block>_side`, `<block>_front`, … (not Mojang paths).
 * - Directional full blocks (furnace, observer, dispenser, …) use
 *   `textures.faces` described for the state `facing=north`; the renderer
 *   rotates the faces by the actual `facing` value. `side` covers all faces not
 *   listed explicitly. (The contract has no dedicated "front" slot.)
 * - Blocks that cost nothing (air, technical parts like `piston_head`, flowing
 *   fluids) are expressed as `{ item: 'minecraft:air', count: 0 }` (or a
 *   `countByProperty` entry of 0), see `NO_ITEM`.
 */

export type Props = Record<string, PropertyDefinition>;

export const HORIZONTAL = ['north', 'south', 'west', 'east'] as const;
export const ALL_DIRECTIONS = ['north', 'east', 'south', 'west', 'up', 'down'] as const;

export const prop = (values: readonly string[], def: string): PropertyDefinition => ({
  values,
  default: def,
});
export const bool = (def = false): PropertyDefinition => prop(['true', 'false'], String(def));
export const range = (min: number, max: number, def: number): PropertyDefinition =>
  prop(
    Array.from({ length: max - min + 1 }, (_, i) => String(min + i)),
    String(def),
  );
export const horizontalFacing = (def = 'north'): PropertyDefinition => prop(HORIZONTAL, def);
export const facing6 = (def = 'north'): PropertyDefinition => prop(ALL_DIRECTIONS, def);
export const axis = (): PropertyDefinition => prop(['x', 'y', 'z'], 'y');
export const waterlogged = (): PropertyDefinition => bool(false);
export const power = (): PropertyDefinition => range(0, 15, 0);

/** Cost entry for blocks that never consume an item. */
export const NO_ITEM: ItemCost = { item: 'minecraft:air', count: 0 };

export const NONE: SupportRule = { kind: 'none' };
export const BELOW: SupportRule = { kind: 'below' };

export const rules = (
  ...entries: readonly (readonly [string, PlacementSource])[]
): PlacementRule[] => entries.map(([property, source]) => ({ property, source }));

/** Strips the namespace: `minecraft:oak_log` → `oak_log`. */
export const pathOf = (id: string): string => id.slice(id.indexOf(':') + 1);

export interface BlockOptions {
  category: BlockCategory;
  properties?: Props;
  shape?: 'full' | 'model' | 'none';
  layer?: RenderLayer;
  textures?: BlockTextures;
  modelId?: string;
  lightEmission?: number;
  lightByProperty?: { property: string; levels: Record<string, number> };
  solid?: boolean;
  supportFaces?: SupportFaces;
  gravity?: boolean;
  fluid?: boolean;
  support?: SupportRule;
  placement?: PlacementRule[];
  redstone?: RedstoneInfo;
  item?: ItemCost;
  tags?: string[];
}

/** Base factory. Defaults to an opaque, solid, free-standing full cube textured `<path>`. */
export function block(path: string, o: BlockOptions): BlockDefinition {
  const shape = o.shape ?? 'full';
  const def: {
    -readonly [K in keyof BlockDefinition]: BlockDefinition[K];
  } = {
    id: `minecraft:${path}`,
    nameKey: `block.${path}`,
    category: o.category,
    properties: o.properties ?? {},
    render: {
      shape,
      layer: o.layer ?? 'opaque',
      ...(shape === 'none' ? {} : { textures: o.textures ?? { all: path } }),
      ...(o.modelId ? { modelId: o.modelId } : {}),
      ...(o.lightEmission ? { lightEmission: o.lightEmission } : {}),
      ...(o.lightByProperty ? { lightByProperty: o.lightByProperty } : {}),
    },
    solid: o.solid ?? shape === 'full',
    physics: {
      ...(o.gravity ? { gravity: true } : {}),
      ...(o.fluid ? { fluid: true } : {}),
      support: o.support ?? NONE,
    },
  };
  if (o.placement && o.placement.length > 0) def.placement = o.placement;
  if (o.supportFaces) def.supportFaces = o.supportFaces;
  if (o.redstone) def.redstone = o.redstone;
  if (o.item) def.item = o.item;
  def.tags = o.tags ?? path.split('_');
  return def;
}

/** Plain full cube. */
export const cube = (
  path: string,
  category: BlockCategory,
  extra: Partial<BlockOptions> = {},
): BlockDefinition => block(path, { category, ...extra });

/** Pillar-like block with `axis` (logs, deepslate, …). `axis` = axis of the clicked face. */
export const pillar = (
  path: string,
  category: BlockCategory,
  textures: BlockTextures,
  tags?: string[],
): BlockDefinition =>
  block(path, {
    category,
    properties: { axis: axis() },
    textures,
    placement: rules(['axis', 'clickedFace']),
    ...(tags ? { tags } : {}),
  });

/** Stairs. Java: `facing` = player's horizontal look direction; `half` from clicked half. */
export const stairs = (
  path: string,
  category: BlockCategory,
  textures: BlockTextures,
  tags?: string[],
): BlockDefinition =>
  block(path, {
    category,
    shape: 'model',
    modelId: 'stairs',
    textures,
    // Stairs have a full back face but are not treated as attachment surfaces.
    solid: false,
    supportFaces: {
      default: { up: 'none', down: 'full', side: 'none' },
      cases: [{ when: { half: 'top' }, faces: { up: 'full', down: 'none', side: 'none' } }],
    },
    properties: {
      facing: horizontalFacing(),
      half: prop(['top', 'bottom'], 'bottom'),
      shape: prop(
        ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right'],
        'straight',
      ),
      waterlogged: waterlogged(),
    },
    placement: rules(['facing', 'playerFacing'], ['half', 'clickedHalf'], ['shape', 'neighbors']),
    tags: tags ?? [...path.split('_')],
  });

/**
 * Slab. `type` from the clicked half; `double` = second slab placed into the
 * same space and costs 2 items.
 */
export const slab = (
  path: string,
  category: BlockCategory,
  textures: BlockTextures,
  item?: string,
): BlockDefinition =>
  block(path, {
    category,
    shape: 'model',
    modelId: 'slab',
    textures,
    solid: false,
    supportFaces: {
      default: { up: 'none', down: 'full', side: 'none' },
      cases: [
        { when: { type: 'top' }, faces: { up: 'full', down: 'none', side: 'none' } },
        { when: { type: 'double' }, faces: { up: 'full', down: 'full', side: 'full' } },
      ],
    },
    properties: { type: prop(['top', 'bottom', 'double'], 'bottom'), waterlogged: waterlogged() },
    placement: rules(['type', 'clickedHalf']),
    item: {
      item: item ?? `minecraft:${path}`,
      countByProperty: { property: 'type', counts: { top: 1, bottom: 1, double: 2 } },
    },
  });

/** Fence: connections derived from neighbours. */
export const fence = (path: string, category: BlockCategory, texture: string): BlockDefinition =>
  block(path, {
    category,
    shape: 'model',
    modelId: 'fence',
    textures: { all: texture },
    solid: false,
    supportFaces: { default: { up: 'center', down: 'center', side: 'none' } },
    properties: {
      east: bool(),
      north: bool(),
      south: bool(),
      west: bool(),
      waterlogged: waterlogged(),
    },
    placement: rules(
      ['east', 'neighbors'],
      ['north', 'neighbors'],
      ['south', 'neighbors'],
      ['west', 'neighbors'],
    ),
  });

/** Glass pane / iron bars: connections derived from neighbours. */
export const pane = (
  path: string,
  category: BlockCategory,
  textures: BlockTextures,
  layer: RenderLayer,
  tags?: string[],
): BlockDefinition => ({
  ...fence(path, category, 'unused'),
  render: { shape: 'model', layer, modelId: 'pane', textures },
  ...(tags ? { tags } : {}),
});

/** Wall: `up` post and low/tall side connections, derived from neighbours. */
export const wall = (path: string, category: BlockCategory, texture: string): BlockDefinition => {
  const side = (): PropertyDefinition => prop(['none', 'low', 'tall'], 'none');
  return block(path, {
    category,
    shape: 'model',
    modelId: 'wall',
    textures: { all: texture },
    solid: false,
    supportFaces: { default: { up: 'center', down: 'center', side: 'none' } },
    properties: {
      east: side(),
      north: side(),
      south: side(),
      up: bool(true),
      waterlogged: waterlogged(),
      west: side(),
    },
    placement: rules(
      ['east', 'neighbors'],
      ['north', 'neighbors'],
      ['south', 'neighbors'],
      ['west', 'neighbors'],
      ['up', 'neighbors'],
    ),
  });
};

/**
 * Door (two-block structure). The player places the lower half; the upper half
 * appears with it and costs nothing (`primaryPart`). Java: `facing` = player's
 * look direction; `hinge` depends on neighbouring doors/blocks and the click
 * position; `open`/`powered` reflect redstone power at placement.
 */
export const door = (
  path: string,
  category: BlockCategory,
  texture: string,
  redstone?: RedstoneInfo,
): BlockDefinition =>
  block(path, {
    category,
    shape: 'model',
    modelId: 'door',
    textures: { top: `${texture}_top`, bottom: `${texture}_bottom`, side: `${texture}_bottom` },
    layer: 'cutout',
    solid: false,
    properties: {
      facing: horizontalFacing(),
      half: prop(['upper', 'lower'], 'lower'),
      hinge: prop(['left', 'right'], 'left'),
      open: bool(),
      powered: bool(),
    },
    // Lower half stands on the block below; upper half stands on the lower half.
    support: BELOW,
    placement: rules(
      ['facing', 'playerFacing'],
      ['half', 'fixed'],
      ['hinge', 'neighbors'],
      ['open', 'neighbors'],
      ['powered', 'neighbors'],
    ),
    redstone: redstone ?? { role: 'actuator' },
    item: { item: `minecraft:${path}`, primaryPart: { property: 'half', value: 'lower' } },
  });

/**
 * Trapdoor. Java (TrapDoorBlock#getStateForPlacement): clicking the side of a
 * block gives `facing` = clicked face and `half` from the click height; clicking
 * a top/bottom face gives `facing` = opposite of the player's look direction and
 * `half` = bottom (top face) / top (bottom face). The contract allows a single
 * source, we record the common floor/ceiling case (`playerFacingOpposite`).
 */
export const trapdoor = (path: string, category: BlockCategory, texture: string): BlockDefinition =>
  block(path, {
    category,
    shape: 'model',
    modelId: 'trapdoor',
    textures: { all: texture },
    layer: 'cutout',
    solid: false,
    properties: {
      facing: horizontalFacing(),
      half: prop(['top', 'bottom'], 'bottom'),
      open: bool(),
      powered: bool(),
      waterlogged: waterlogged(),
    },
    placement: rules(
      ['facing', 'playerFacingOpposite'],
      ['half', 'clickedHalf'],
      ['open', 'neighbors'],
      ['powered', 'neighbors'],
    ),
    redstone: { role: 'actuator' },
  });

/** Fence gate. Java: `facing` = player's look direction. */
export const fenceGate = (
  path: string,
  category: BlockCategory,
  texture: string,
): BlockDefinition =>
  block(path, {
    category,
    shape: 'model',
    modelId: 'fence_gate',
    textures: { all: texture },
    solid: false,
    properties: {
      facing: horizontalFacing(),
      in_wall: bool(),
      open: bool(),
      powered: bool(),
    },
    placement: rules(
      ['facing', 'playerFacing'],
      ['in_wall', 'neighbors'],
      ['open', 'neighbors'],
      ['powered', 'neighbors'],
    ),
    redstone: { role: 'actuator' },
  });

/**
 * Face-attached block (button, lever). `face` comes from the clicked face
 * (top → floor, bottom → ceiling, side → wall). Java: on walls `facing` = the
 * clicked face (points away from the wall); on floor/ceiling `facing` = the
 * player's look direction.
 */
export const faceAttached = (
  path: string,
  category: BlockCategory,
  modelId: string,
  texture: string,
): BlockDefinition =>
  block(path, {
    category,
    shape: 'model',
    modelId,
    textures: { all: texture },
    solid: false,
    properties: {
      face: prop(['floor', 'wall', 'ceiling'], 'wall'),
      facing: horizontalFacing(),
      powered: bool(),
    },
    support: { kind: 'face', faceProperty: 'face', facingProperty: 'facing' },
    placement: [
      { property: 'face', source: 'clickedFace' },
      { property: 'facing', source: 'clickedFace', when: { property: 'face', value: 'wall' } },
      { property: 'facing', source: 'playerFacing' },
      { property: 'powered', source: 'fixed' },
    ],
    redstone: { role: 'source' },
  });

export const button = (path: string, category: BlockCategory, texture: string): BlockDefinition =>
  faceAttached(path, category, 'button', texture);

export const pressurePlate = (
  path: string,
  category: BlockCategory,
  texture: string,
): BlockDefinition =>
  block(path, {
    category,
    shape: 'model',
    modelId: 'pressure_plate',
    textures: { all: texture },
    solid: false,
    properties: { powered: bool() },
    support: { kind: 'below', needs: 'center' },
    placement: rules(['powered', 'fixed']),
    redstone: { role: 'source' },
  });

/** Carpet: survives on any non-air block below. */
export const carpet = (path: string, texture: string): BlockDefinition =>
  block(path, {
    category: 'colored',
    shape: 'model',
    modelId: 'carpet',
    textures: { all: texture },
    solid: false,
    support: { kind: 'below', needs: 'none' },
  });
