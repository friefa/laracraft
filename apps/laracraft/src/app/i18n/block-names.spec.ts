import { createJavaBlockRegistry } from '@laracraft/core-model';
import de from '../../../public/i18n/blocks/de.json';
import en from '../../../public/i18n/blocks/en.json';
import uiDe from '../../../public/i18n/de.json';

describe('block name translations', () => {
  const registry = createJavaBlockRegistry();
  const files: Record<string, { blocks: Record<string, string> }> = { de, en };

  it('name every registry block in every language (run scripts/generate-block-names.ts)', () => {
    for (const def of registry.all()) {
      const key = def.id.replace(/^minecraft:/, '');
      for (const [lang, file] of Object.entries(files)) {
        expect(file.blocks[key]?.trim(), `${lang}:${def.id}`).toBeTruthy();
      }
    }
  });

  it('have identical key sets and no stale entries', () => {
    const ids = registry
      .all()
      .map((d) => d.id.replace(/^minecraft:/, ''))
      .sort();
    expect(Object.keys(de.blocks).sort()).toEqual(ids);
    expect(Object.keys(en.blocks).sort()).toEqual(ids);
  });

  it('use official German names', () => {
    expect(de.blocks.cobblestone).toBe('Bruchstein');
    expect(de.blocks.oak_planks).toBe('Eichenholzbretter');
    expect(de.blocks.repeater).toBe('Redstone-Verstärker');
    expect(de.blocks.light_gray_wool).toBe('Hellgraue Wolle');
  });

  it('do not collide with UI translation keys', () => {
    expect(Object.keys(uiDe)).not.toContain('blocks');
  });
});
