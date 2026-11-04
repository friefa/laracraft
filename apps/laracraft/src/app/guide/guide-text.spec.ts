import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import type { HintCode, PlaceAction } from '@laracraft/build-order';
import { AIR, type BlockStateString } from '@laracraft/core-model';
import en from '../../../public/i18n/en.json';
import { provideI18nTesting } from '../i18n/i18n.testing';
import { LanguageService } from '../i18n/language.service';
import { FIXTURE_PLAN, PISTON, STONE } from './fixture-plan.testing';
import { GuideText, isSteepLook, prettifyId } from './guide-text';

describe('GuideText', () => {
  let text: GuideText;
  let language: LanguageService;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideI18nTesting()] });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    text = TestBed.inject(GuideText);
    language = TestBed.inject(LanguageService);
    await language.use('en');
  });

  const step1 = FIXTURE_PLAN.steps[1]?.actions ?? [];
  const stairs = step1[1] as PlaceAction;
  const repeater = step1[3] as PlaceAction;

  it('describes look directions in English and German', async () => {
    expect(text.look({ horizontal: 'north', vertical: 'down' })).toBe('Look north, slightly down');
    expect(text.look({ horizontal: 'west', vertical: 'level' })).toBe('Look west, straight ahead');
    expect(text.look({ horizontal: 'east', vertical: 'up' }, true)).toBe('Look east, steeply up');
    await language.use('de');
    expect(text.look({ horizontal: 'north', vertical: 'down' })).toBe(
      'Schau nach Norden, leicht nach unten',
    );
    expect(text.look({ horizontal: 'south', vertical: 'level' })).toBe(
      'Schau nach Süden, geradeaus',
    );
    expect(text.look({ horizontal: 'east', vertical: 'down' }, true)).toBe(
      'Schau nach Osten, steil nach unten',
    );
  });

  it('treats up/down facing blocks as steep looks', () => {
    expect(isSteepLook(PISTON)).toBe(true);
    expect(isSteepLook(STONE)).toBe(false);
    expect(isSteepLook('not a [state' as BlockStateString)).toBe(false);
  });

  it('uses block translations when present, else a prettified id', async () => {
    expect(prettifyId('minecraft:oak_stairs[facing=north]')).toBe('Oak Stairs');
    expect(text.blockName('minecraft:oak_stairs[facing=north]')).toBe('Oak Stairs');
    const transloco = TestBed.inject(TranslocoService);
    transloco.setTranslationKey('blocks.stone', 'Stein', { lang: 'de' });
    transloco.setTranslationKey('blocks.stone', 'Stone (translated)', { lang: 'en' });
    expect(text.blockName(STONE)).toBe('Stone (translated)');
    await language.use('de');
    expect(text.blockName('minecraft:stone')).toBe('Stein');
  });

  it('describes the clicked face, half, sneak and interactions', async () => {
    const lines = (a: PlaceAction, at: BlockStateString = STONE) =>
      text.actionLines(a, () => at).map((l) => l.text);
    expect(lines(stairs)).toEqual([
      'Hold Oak Stairs',
      'Stand at 0 / 0 / 2 (feet)',
      'Look north, straight ahead',
      'Click the north side of Stone',
      'Aim at the lower half of that face',
    ]);
    expect(lines(repeater, AIR)).toContain('Click the top of the ground');
    expect(lines(repeater)).toContain('Hold sneak while placing');
    expect(lines(repeater)).toContain('Then right-click it 2×');
    await language.use('de');
    expect(lines(stairs)).toContain('Klicke auf die Nordseite von Stone');
    expect(lines(repeater)).toContain('Danach 2× rechtsklicken');
    const temp = FIXTURE_PLAN.steps[0]?.actions[2] as PlaceAction;
    expect(lines(temp)).toContain('Temporärer Block – wird später wieder entfernt');
  });

  it('describes removals', () => {
    const remove = FIXTURE_PLAN.steps[2]?.actions[0];
    if (!remove) throw new Error('fixture');
    expect(text.actionLines(remove, () => AIR).map((l) => l.text)).toEqual([
      'Break Dirt at 2 / 0 / 0',
      'It was only a temporary support.',
    ]);
  });

  it('renders every hint code via guide.hint.<code>', async () => {
    const codes = Object.keys(en.guide.hint) as HintCode[];
    expect(codes).toHaveLength(9);
    for (const code of codes) {
      const rendered = text.hint({ code });
      expect(rendered).not.toContain('guide.hint');
      expect(rendered).toBe((en.guide.hint as Record<string, string>)[code]);
    }
    await language.use('de');
    expect(text.hint({ code: 'fluids-last' })).toBe(
      'Wasser und Lava kommen zuletzt, damit sie nicht in den Bau fließen.',
    );
  });
});
