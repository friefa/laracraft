import type { BlockDefinition, BlockTextures } from '../types';
import {
  NO_ITEM,
  block,
  bool,
  button,
  cube,
  door,
  faceAttached,
  facing6,
  horizontalFacing,
  power,
  pressurePlate,
  prop,
  range,
  rules,
  trapdoor,
  waterlogged,
} from './helpers';

/*
 * Direction semantics used below (verified against minecraft.wiki blockstate
 * docs and the Java placement code):
 * - repeater/comparator `facing`: "direction from the output side to the input
 *   side", i.e. opposite of the player's look direction when placed
 *   (DiodeBlock: getHorizontalDirection().getOpposite()) → `playerFacingOpposite`.
 * - observer `facing`: "the direction the observer is observing; the same
 *   direction the player faces when placing" — the face looks AWAY from the
 *   player, the output (red dot) points at the player → `playerLook3d`.
 * - piston/sticky piston/dispenser/dropper `facing`: the head/front points
 *   towards the player (nearestLookingDirection().getOpposite()) → `playerLook3dOpposite`.
 * - hopper `facing`: output points INTO the clicked block, i.e. the opposite of
 *   the clicked face; clicking a top/bottom face gives `down`.
 */

const wireSide = () => prop(['up', 'side', 'none'], 'none');

const pistonFaces = (front: string): BlockTextures => ({
  faces: { north: front, south: 'piston_bottom', side: 'piston_side' },
});

const piston = (path: string, front: string): BlockDefinition =>
  block(path, {
    category: 'redstone',
    // Model because the extended base is not a full cube.
    shape: 'model',
    modelId: 'piston',
    textures: pistonFaces(front),
    // Retracted pistons are full sturdy cubes; torches etc. may attach.
    solid: true,
    properties: { extended: bool(), facing: facing6() },
    placement: rules(['facing', 'playerLook3dOpposite'], ['extended', 'fixed']),
    redstone: { role: 'actuator', triggersOnPlace: true },
    tags: [...path.split('_'), 'push', 'redstone'],
  });

/** Dispenser / dropper: front faces the player (3D). Fires when powered on placement/update. */
const dispenserLike = (path: string): BlockDefinition =>
  cube(path, 'redstone', {
    properties: { facing: facing6(), triggered: bool() },
    placement: rules(['facing', 'playerLook3dOpposite'], ['triggered', 'fixed']),
    textures: {
      faces: {
        north: `${path}_front`,
        up: 'furnace_top',
        down: 'furnace_top',
        side: 'furnace_side',
      },
    },
    redstone: { role: 'actuator', triggersOnPlace: true },
    tags: [path, 'redstone', 'item'],
  });

const railShapesStraight = [
  'north_south',
  'east_west',
  'ascending_east',
  'ascending_west',
  'ascending_north',
  'ascending_south',
];

/**
 * Rails. `shape` is derived from neighbouring rails (initially straight along
 * the player's look axis if nothing connects).
 */
const poweredRail = (path: string, role: 'actuator' | 'source'): BlockDefinition =>
  block(path, {
    category: 'transport',
    shape: 'model',
    modelId: 'rail',
    layer: 'cutout',
    properties: {
      powered: bool(),
      shape: prop(railShapesStraight, 'north_south'),
      waterlogged: waterlogged(),
    },
    support: { kind: 'below', needs: 'rigid' },
    // Powered/activator rails take power from neighbours; a detector rail is
    // only powered by a minecart on top.
    placement: rules(
      ['shape', 'neighbors'],
      ['powered', role === 'source' ? 'fixed' : 'neighbors'],
    ),
    redstone: { role },
    tags: [...path.split('_'), 'minecart', 'track'],
  });

export const REDSTONE_BLOCKS: readonly BlockDefinition[] = [
  block('redstone_wire', {
    category: 'redstone',
    shape: 'model',
    modelId: 'wire',
    layer: 'cutout',
    textures: { all: 'redstone_dust' },
    properties: {
      east: wireSide(),
      north: wireSide(),
      power: power(),
      south: wireSide(),
      west: wireSide(),
    },
    support: { kind: 'below', needs: 'rigid' },
    placement: rules(
      ['east', 'neighbors'],
      ['north', 'neighbors'],
      ['south', 'neighbors'],
      ['west', 'neighbors'],
      ['power', 'neighbors'],
    ),
    redstone: { role: 'wire' },
    item: { item: 'minecraft:redstone' },
    tags: ['redstone', 'dust', 'wire'],
  }),
  block('redstone_torch', {
    category: 'redstone',
    shape: 'model',
    modelId: 'torch',
    layer: 'cutout',
    lightEmission: 7,
    properties: { lit: bool(true) },
    support: { kind: 'below', needs: 'center' },
    // Turns off when the block it stands on is powered.
    placement: rules(['lit', 'neighbors']),
    lightByProperty: { property: 'lit', levels: { true: 7, false: 0 } },
    redstone: { role: 'source' },
    tags: ['redstone', 'torch'],
  }),
  block('redstone_wall_torch', {
    category: 'redstone',
    shape: 'model',
    modelId: 'wall_torch',
    layer: 'cutout',
    lightEmission: 7,
    textures: { all: 'redstone_torch' },
    properties: { facing: horizontalFacing(), lit: bool(true) },
    lightByProperty: { property: 'lit', levels: { true: 7, false: 0 } },
    // Hangs on the block opposite of `facing`; `facing` = clicked face.
    support: { kind: 'facing', property: 'facing' },
    placement: rules(['facing', 'clickedFace'], ['lit', 'neighbors']),
    redstone: { role: 'source' },
    item: { item: 'minecraft:redstone_torch' },
    tags: ['redstone', 'torch', 'wall'],
  }),
  cube('redstone_block', 'redstone', {
    redstone: { role: 'source' },
    tags: ['redstone', 'block', 'power'],
  }),
  faceAttached('lever', 'redstone', 'lever', 'lever', 'interaction'),
  button('stone_button', 'redstone', 'stone'),
  pressurePlate('stone_pressure_plate', 'redstone', 'stone'),
  block('repeater', {
    category: 'redstone',
    shape: 'model',
    modelId: 'repeater',
    layer: 'cutout',
    properties: {
      delay: range(1, 4, 1),
      facing: horizontalFacing(),
      locked: bool(),
      powered: bool(),
    },
    support: { kind: 'below', needs: 'rigid' },
    // `facing` points from output to input = towards the player (see header).
    placement: rules(
      ['facing', 'playerFacingOpposite'],
      ['delay', 'interaction'],
      ['locked', 'neighbors'],
      ['powered', 'neighbors'],
    ),
    redstone: { role: 'repeater' },
    tags: ['redstone', 'repeater', 'diode', 'delay'],
  }),
  block('comparator', {
    category: 'redstone',
    shape: 'model',
    modelId: 'comparator',
    layer: 'cutout',
    properties: {
      facing: horizontalFacing(),
      mode: prop(['compare', 'subtract'], 'compare'),
      powered: bool(),
    },
    support: { kind: 'below', needs: 'rigid' },
    // Same orientation semantics as the repeater.
    placement: rules(
      ['facing', 'playerFacingOpposite'],
      ['mode', 'interaction'],
      ['powered', 'neighbors'],
    ),
    redstone: { role: 'comparator' },
    tags: ['redstone', 'comparator', 'diode'],
  }),
  piston('piston', 'piston_top'),
  piston('sticky_piston', 'piston_top_sticky'),
  // Head of an extended piston: placed implicitly by the piston, costs nothing.
  // Rendered (it is visible), hence not category `technical`. It is attached to
  // the piston base on the side opposite of `facing`.
  block('piston_head', {
    category: 'redstone',
    shape: 'model',
    modelId: 'piston_head',
    textures: { faces: { north: 'piston_top', south: 'piston_top', side: 'piston_side' } },
    solid: false,
    properties: {
      facing: facing6(),
      short: bool(),
      type: prop(['normal', 'sticky'], 'normal'),
    },
    support: { kind: 'facing', property: 'facing' },
    item: NO_ITEM,
    tags: ['piston', 'head', 'technical'],
  }),
  cube('observer', 'redstone', {
    properties: { facing: facing6('south'), powered: bool() },
    // Face looks where the player looks (away from the player) — see header.
    placement: rules(['facing', 'playerLook3d'], ['powered', 'fixed']),
    textures: {
      faces: {
        north: 'observer_front',
        south: 'observer_back',
        up: 'observer_top',
        down: 'observer_top',
        side: 'observer_side',
      },
    },
    redstone: { role: 'observer', triggersOnPlace: true },
    tags: ['observer', 'redstone', 'detector', 'bud'],
  }),
  dispenserLike('dispenser'),
  dispenserLike('dropper'),
  block('hopper', {
    category: 'redstone',
    shape: 'model',
    modelId: 'hopper',
    supportFaces: { default: { up: 'rigid', down: 'center', side: 'none' } },
    textures: { top: 'hopper_top', bottom: 'hopper_outside', side: 'hopper_outside' },
    solid: false,
    properties: {
      enabled: bool(true),
      facing: prop(['down', 'north', 'south', 'west', 'east'], 'down'),
    },
    // Hopper `facing` points into the clicked block; clicking a top/bottom face
    // yields `down` (`up` is not allowed → property default).
    placement: rules(['facing', 'clickedFaceOpposite'], ['enabled', 'neighbors']),
    redstone: { role: 'container' },
    tags: ['hopper', 'redstone', 'item', 'funnel'],
  }),
  cube('redstone_lamp', 'redstone', {
    properties: { lit: bool() },
    placement: rules(['lit', 'neighbors']),
    lightByProperty: { property: 'lit', levels: { true: 15, false: 0 } },
    redstone: { role: 'actuator' },
    tags: ['redstone', 'lamp', 'light'],
  }),
  cube('note_block', 'redstone', {
    properties: {
      instrument: prop(
        [
          'harp',
          'basedrum',
          'snare',
          'hat',
          'bass',
          'flute',
          'bell',
          'guitar',
          'chime',
          'xylophone',
          'iron_xylophone',
          'cow_bell',
          'didgeridoo',
          'bit',
          'banjo',
          'pling',
          // 26.1: copper below → trumpet, one value per oxidation stage.
          'trumpet',
          'trumpet_exposed',
          'trumpet_weathered',
          'trumpet_oxidized',
          'zombie',
          'skeleton',
          'creeper',
          'dragon',
          'wither_skeleton',
          'piglin',
          'custom_head',
        ],
        'harp',
      ),
      note: range(0, 24, 0),
      powered: bool(),
    },
    // Instrument comes from the block below (or a head above).
    placement: rules(
      ['instrument', 'neighbors'],
      ['note', 'interaction'],
      ['powered', 'neighbors'],
    ),
    redstone: { role: 'actuator' },
    tags: ['note', 'block', 'music', 'redstone'],
  }),
  cube('target', 'redstone', {
    properties: { power: power() },
    placement: rules(['power', 'fixed']),
    textures: { top: 'target_top', bottom: 'target_top', side: 'target_side' },
    redstone: { role: 'source' },
    tags: ['target', 'redstone', 'arrow'],
  }),
  block('daylight_detector', {
    category: 'redstone',
    shape: 'model',
    modelId: 'daylight_detector',
    textures: {
      top: 'daylight_detector_top',
      bottom: 'daylight_detector_side',
      side: 'daylight_detector_side',
    },
    properties: { inverted: bool(), power: power() },
    // `power` follows sky light and is not player-controlled.
    placement: rules(['inverted', 'interaction'], ['power', 'neighbors']),
    redstone: { role: 'source' },
    tags: ['daylight', 'detector', 'sensor', 'redstone'],
  }),
  cube('tnt', 'redstone', {
    properties: { unstable: bool() },
    placement: rules(['unstable', 'fixed']),
    textures: { top: 'tnt_top', bottom: 'tnt_bottom', side: 'tnt_side' },
    // Ignites immediately if placed next to power.
    redstone: { role: 'actuator', triggersOnPlace: true },
    tags: ['tnt', 'explosive', 'redstone'],
  }),
  cube('slime_block', 'redstone', {
    layer: 'translucent',
    tags: ['slime', 'sticky', 'bounce', 'piston'],
  }),
  // Honey: translucent, slightly inset collision shape → not a sturdy face
  // (Java support shape = collision shape), so nothing attaches to it.
  cube('honey_block', 'redstone', {
    layer: 'translucent',
    solid: false,
    textures: { top: 'honey_block_top', bottom: 'honey_block_bottom', side: 'honey_block_side' },
    tags: ['honey', 'sticky', 'piston'],
  }),
  block('rail', {
    category: 'transport',
    shape: 'model',
    modelId: 'rail',
    layer: 'cutout',
    properties: {
      shape: prop(
        [...railShapesStraight, 'south_east', 'south_west', 'north_west', 'north_east'],
        'north_south',
      ),
      waterlogged: waterlogged(),
    },
    support: { kind: 'below', needs: 'rigid' },
    placement: rules(['shape', 'neighbors']),
    tags: ['rail', 'minecart', 'track'],
  }),
  poweredRail('powered_rail', 'actuator'),
  poweredRail('detector_rail', 'source'),
  poweredRail('activator_rail', 'actuator'),
  door('iron_door', 'redstone', 'iron_door'),
  trapdoor('iron_trapdoor', 'redstone', 'iron_trapdoor'),
];
