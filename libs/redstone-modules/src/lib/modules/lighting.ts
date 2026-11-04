import { LocalBuilder, defineModule, moduleKey, wire } from '../define';

const COVERS = ['smooth_stone', 'stone_bricks', 'stone', 'oak_planks', 'none'] as const;

/**
 * Hidden lamp row (ceiling lights) switched by a lever (Java Edition).
 *
 * Design: four redstone lamps in a row with a dust line lying directly on top of them;
 * dust powers the block it sits on, so every lamp lights. A wall lever on the control
 * block at the start strongly powers that block, which powers the dust on top of it (and
 * the first lamp). An optional cover layer above the dust hides the wiring, so the
 * module is meant to be built into a ceiling: lamps face down into the room, the lever
 * hangs on the control block at ceiling height.
 *
 * References:
 * - https://minecraft.wiki/w/Redstone_Lamp
 * - https://minecraft.wiki/w/Redstone_Dust (powers the block beneath it)
 * - https://minecraft.wiki/w/Lever (strongly powers the block it is attached to)
 *
 * Local layout, facing north = lever side at the −Z edge:
 *
 *   y=2   z=1:  c    c    c    c    c      c = cover blocks (param `cover`, may be `none`)
 *   y=1   z=1:  w    w    w    w    w      dust line
 *   y=0   z=0:  l    .    .    .    .      l = lever on the control block's north face
 *         z=1:  S    L    L    L    L      S = control block (stone), L = redstone lamps
 *         x=    0    1    2    3    4
 */
export const HIDDEN_LAMP_ARRAY = defineModule({
  id: 'hidden_lamp_array',
  nameKey: moduleKey('hidden_lamp_array', 'name'),
  descriptionKey: moduleKey('hidden_lamp_array', 'description'),
  category: 'lighting',
  editions: { java: 'tested', bedrock: 'untested' },
  editionNotes: {
    bedrock:
      'Only uses a lever, dust on top of lamps and a strongly powered block; expected to work ' +
      'the same, but not verified in Bedrock.',
  },
  size: { x: 5, y: 3, z: 2 },
  anchor: { x: 0, y: 0, z: 0 },
  design:
    'Four lamps with dust on top and an optional cover layer; one wall lever switches them all.',
  references: [
    'https://minecraft.wiki/w/Redstone_Lamp',
    'https://minecraft.wiki/w/Redstone_Dust',
    'https://minecraft.wiki/w/Lever',
  ],
  ports: [
    { name: 'lever', kind: 'input', pos: { x: 0, y: 0, z: 0 }, side: 'north', signal: 'level' },
  ],
  params: {
    cover: {
      type: 'string',
      enum: COVERS,
      default: 'smooth_stone',
      descriptionKey: moduleKey('hidden_lamp_array', 'param.cover'),
    },
  },
  behaviour: {
    status: 'specified',
    initial: {
      properties: [1, 2, 3, 4].map((x) => ({
        pos: { x, y: 0, z: 1 },
        property: 'lit',
        value: 'false',
      })),
    },
    steps: [
      {
        description: 'Lever on: all four lamps light immediately.',
        set: { lever: true },
        waitTicks: 2,
        expect: {
          properties: [1, 2, 3, 4].map((x) => ({
            pos: { x, y: 0, z: 1 },
            property: 'lit',
            value: 'true',
          })),
        },
      },
      {
        description: 'Lever off: the lamps go out after 2 rt.',
        set: { lever: false },
        waitTicks: 6,
        expect: {
          properties: [1, 2, 3, 4].map((x) => ({
            pos: { x, y: 0, z: 1 },
            property: 'lit',
            value: 'false',
          })),
        },
      },
    ],
  },
  blocks(p) {
    const b = new LocalBuilder();
    b.set(0, 0, 0, 'minecraft:lever[face=wall,facing=north,powered=false]');
    b.set(0, 0, 1, 'minecraft:stone');
    b.fill(1, 0, 1, 4, 0, 1, 'minecraft:redstone_lamp[lit=false]');
    b.fill(0, 1, 1, 4, 1, 1, wire({ e: 'side', w: 'side' }));
    const cover = String(p['cover']);
    if (cover !== 'none') b.fill(0, 2, 1, 4, 2, 1, `minecraft:${cover}`);
    return b.blocks();
  },
});
