import { canonicalBlockState, parseBlockState, stringifyBlockState } from './blockstate';

describe('blockstate', () => {
  it('parses and canonicalizes (sorted keys, default namespace)', () => {
    expect(canonicalBlockState('oak_stairs[half=bottom, facing=east]')).toBe(
      'minecraft:oak_stairs[facing=east,half=bottom]',
    );
    expect(canonicalBlockState('minecraft:stone')).toBe('minecraft:stone');
    expect(canonicalBlockState('minecraft:stone[]')).toBe('minecraft:stone');
  });

  it('round-trips', () => {
    const s = 'minecraft:repeater[delay=2,facing=north,locked=false,powered=false]';
    expect(stringifyBlockState(parseBlockState(s))).toBe(s);
  });

  it.each([
    '',
    'Stone',
    'minecraft:stone[facing]',
    'minecraft:stone[a=1,a=2]',
    'minecraft:stone[a=1',
  ])('rejects %j', (input) => {
    expect(() => parseBlockState(input)).toThrow();
  });
});
