import { createBlockRegistry, defaultState, resolveBlockState } from './registry';
import type { BlockDefinition } from './types';

const stairs: BlockDefinition = {
  id: 'minecraft:oak_stairs',
  nameKey: 'block.oak_stairs',
  category: 'wood',
  properties: {
    facing: { values: ['north', 'south', 'west', 'east'], default: 'north' },
    half: { values: ['top', 'bottom'], default: 'bottom' },
  },
  render: { shape: 'model', layer: 'opaque', modelId: 'stairs' },
  solid: false,
  physics: { support: { kind: 'none' } },
  placement: [
    { property: 'facing', source: 'playerFacing' },
    { property: 'half', source: 'clickedHalf' },
  ],
};

describe('registry', () => {
  const reg = createBlockRegistry('test', [stairs]);

  it('fills defaults and canonicalizes', () => {
    expect(resolveBlockState(reg, 'oak_stairs[facing=east]')).toEqual({
      ok: true,
      state: 'minecraft:oak_stairs[facing=east,half=bottom]',
    });
    expect(defaultState(stairs)).toBe('minecraft:oak_stairs[facing=north,half=bottom]');
  });

  it('rejects unknown blocks, properties and values', () => {
    expect(resolveBlockState(reg, 'minecraft:nope').ok).toBe(false);
    expect(resolveBlockState(reg, 'oak_stairs[color=red]').ok).toBe(false);
    expect(resolveBlockState(reg, 'oak_stairs[facing=up]').ok).toBe(false);
  });

  it('rejects inconsistent definitions', () => {
    expect(() => createBlockRegistry('t', [stairs, stairs])).toThrow(/Duplicate/);
    expect(() =>
      createBlockRegistry('t', [
        {
          ...stairs,
          properties: { facing: { values: ['north'], default: 'east' } },
          placement: [],
        },
      ]),
    ).toThrow(/default/);
  });
});
