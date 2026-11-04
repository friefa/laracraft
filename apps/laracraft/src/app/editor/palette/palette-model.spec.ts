import { type BlockDefinition, createJavaBlockRegistry } from '@laracraft/core-model';
import de from '../../../../public/i18n/blocks/de.json';
import en from '../../../../public/i18n/blocks/en.json';
import {
  MAX_RECENT,
  normalizeSearch,
  paletteData,
  pushRecent,
  readIdList,
  searchBlocks,
  toggleId,
  writeIdList,
} from './palette-model';

const registry = createJavaBlockRegistry();
const { blocks, categories } = paletteData(registry);
const names = (file: { block: Record<string, string> }) => (def: BlockDefinition) =>
  file.block[def.nameKey.replace(/^block\./, '')] ?? def.id;
const ids = (defs: readonly BlockDefinition[]) => defs.map((d) => d.id);

describe('paletteData', () => {
  it('offers no technical blocks', () => {
    expect(ids(blocks)).not.toContain('minecraft:air');
    expect(ids(blocks)).not.toContain('minecraft:moving_piston');
    expect(ids(blocks)).not.toContain('minecraft:piston_head');
    expect(ids(blocks)).toContain('minecraft:stone');
    expect(categories).not.toContain('technical');
    expect(categories).toContain('redstone');
  });
});

describe('searchBlocks', () => {
  it('finds blocks by their German name', () => {
    const found = ids(searchBlocks(blocks, 'Bruchstein', names(de)));
    expect(found).toContain('minecraft:cobblestone');
    expect(found).toContain('minecraft:cobblestone_wall');
    expect(found).not.toContain('minecraft:stone');
  });

  it('finds blocks by English name and tags, also in German', () => {
    expect(ids(searchBlocks(blocks, 'cobble', names(de)))).toContain('minecraft:cobblestone');
    expect(ids(searchBlocks(blocks, 'workbench', names(en)))).toEqual(['minecraft:crafting_table']);
  });

  it('ignores case and diacritics and needs every word', () => {
    expect(ids(searchBlocks(blocks, 'verstarker', names(de)))).toEqual(['minecraft:repeater']);
    expect(ids(searchBlocks(blocks, 'WEISS wolle', names(de)))).toContain('minecraft:white_wool');
    expect(ids(searchBlocks(blocks, 'oak stairs', names(en)))).toEqual([
      'minecraft:oak_stairs',
      'minecraft:dark_oak_stairs',
    ]);
    expect(searchBlocks(blocks, '  ', names(en))).toHaveLength(blocks.length);
    expect(normalizeSearch(' Grün ')).toBe('grun');
  });
});

describe('favourites and recent blocks', () => {
  it('keeps the most recent first, without duplicates, bounded', () => {
    let recent: string[] = [];
    for (let i = 0; i < MAX_RECENT + 3; i++) recent = pushRecent(recent, `b${i}`);
    recent = pushRecent(recent, 'b5');
    expect(recent).toHaveLength(MAX_RECENT);
    expect(recent[0]).toBe('b5');
    expect(recent.filter((r) => r === 'b5')).toHaveLength(1);
  });

  it('toggles ids', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('survives broken or unavailable storage', () => {
    localStorage.setItem('k', '{not json');
    expect(readIdList(localStorage, 'k')).toEqual([]);
    localStorage.setItem('k', '[1, "a"]');
    expect(readIdList(localStorage, 'k')).toEqual(['a']);
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    expect(readIdList(throwing, 'k')).toEqual([]);
    expect(() => writeIdList(throwing, 'k', ['a'])).not.toThrow();
    expect(readIdList(undefined, 'k')).toEqual([]);
  });
});
