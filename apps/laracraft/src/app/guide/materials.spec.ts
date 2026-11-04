import { formatItemStacks, formatStacks, sortMaterials, stackSizeOf } from './materials';

describe('material formatting', () => {
  it('formats counts as stacks of 64 plus rest', () => {
    expect(formatStacks(0)).toBe('0');
    expect(formatStacks(12)).toBe('12');
    expect(formatStacks(63)).toBe('63');
    expect(formatStacks(64)).toBe('1×64');
    expect(formatStacks(140)).toBe('2×64 + 12');
    expect(formatStacks(128)).toBe('2×64');
  });

  it('respects smaller stack sizes and unstackable items', () => {
    expect(formatStacks(20, 16)).toBe('1×16 + 4');
    expect(formatStacks(3, 1)).toBe('3');
    expect(stackSizeOf('minecraft:water_bucket')).toBe(1);
    expect(stackSizeOf('minecraft:oak_sign')).toBe(16);
    expect(stackSizeOf('minecraft:stone')).toBe(64);
    expect(stackSizeOf('stone')).toBe(64);
    expect(formatItemStacks({ item: 'minecraft:lava_bucket', count: 2 })).toBe('2');
    expect(formatItemStacks({ item: 'minecraft:oak_sign', count: 33 })).toBe('2×16 + 1');
  });

  it('sorts by name or count in both directions', () => {
    const list = [
      { item: 'minecraft:stone', count: 5 },
      { item: 'minecraft:dirt', count: 9 },
      { item: 'minecraft:sand', count: 5 },
    ];
    const name = (id: string) => id.slice(10);
    const ids = (l: { item: string }[]) => l.map((m) => name(m.item));
    expect(ids(sortMaterials(list, { by: 'name', dir: 'asc' }, name))).toEqual([
      'dirt',
      'sand',
      'stone',
    ]);
    expect(ids(sortMaterials(list, { by: 'name', dir: 'desc' }, name))).toEqual([
      'stone',
      'sand',
      'dirt',
    ]);
    // Ties keep a stable id order.
    expect(ids(sortMaterials(list, { by: 'count', dir: 'desc' }, name))).toEqual([
      'dirt',
      'sand',
      'stone',
    ]);
    expect(ids(sortMaterials(list, { by: 'count', dir: 'asc' }, name))).toEqual([
      'sand',
      'stone',
      'dirt',
    ]);
    expect(list[0]?.item).toBe('minecraft:stone');
  });
});
