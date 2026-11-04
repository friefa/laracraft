import { createJavaBlockRegistry } from '@laracraft/core-model';
import de from '../../../public/i18n/blocks/de.json';
import en from '../../../public/i18n/blocks/en.json';
import uiDe from '../../../public/i18n/de.json';

describe('block name translations', () => {
  const registry = createJavaBlockRegistry();
  const files: Record<string, { block: Record<string, string> }> = { de, en };

  it('name every registry block in every language (run scripts/generate-block-names.ts)', () => {
    for (const def of registry.all()) {
      const key = def.nameKey.replace(/^block\./, '');
      for (const [lang, file] of Object.entries(files)) {
        expect(file.block[key]?.trim(), `${lang}:${def.nameKey}`).toBeTruthy();
      }
    }
  });

  it('have identical key sets and no stale entries', () => {
    const ids = registry
      .all()
      .map((d) => d.nameKey.replace(/^block\./, ''))
      .sort();
    expect(Object.keys(de.block).sort()).toEqual(ids);
    expect(Object.keys(en.block).sort()).toEqual(ids);
  });

  it('use official German names', () => {
    expect(de.block.cobblestone).toBe('Bruchstein');
    expect(de.block.oak_planks).toBe('Eichenholzbretter');
    expect(de.block.repeater).toBe('Redstone-Verstärker');
    expect(de.block.light_gray_wool).toBe('Hellgraue Wolle');
  });

  it('do not collide with UI translation keys', () => {
    expect(Object.keys(uiDe)).not.toContain('block');
  });
});
