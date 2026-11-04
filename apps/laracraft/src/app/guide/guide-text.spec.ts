import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import type { HintCode, PlaceAction, RemoveAction } from '@laracraft/build-order';
import { AIR, type BlockStateString, type Vec3 } from '@laracraft/core-model';
import en from '../../../public/i18n/en.json';
import { provideI18nTesting } from '../i18n/i18n.testing';
import { LanguageService } from '../i18n/language.service';
import { FIXTURE_PLAN, PISTON, STONE } from './fixture-plan.testing';
import { GuideText, isSteepLook, prettifyId, signed } from './guide-text';
import { describeStandPosition } from './stand-position';

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
      'Stand 2 blocks south of it, 1 block lower',
      'Look north, straight ahead',
      'Click the north side of Stone',
      'Aim at the lower half of that face',
    ]);
    expect(lines(repeater, AIR)).toContain('Click the top of the ground');
    expect(lines(repeater)).toContain('Hold sneak while placing');
    expect(lines(repeater)).toContain('Place it while jumping (at the top of the jump)');
    expect(lines(stairs).join()).not.toContain('jumping');
    expect(lines(repeater)).toContain('Then right-click it 2×');
    await language.use('de');
    expect(lines(stairs)).toContain('Klicke auf die Nordseite von Stein');
    expect(lines(repeater)).toContain('Danach 2× rechtsklicken');
    expect(lines(repeater)).toContain('Im Sprung setzen (am höchsten Punkt)');
    const temp = FIXTURE_PLAN.steps[0]?.actions[2] as PlaceAction;
    expect(lines(temp)).toContain('Temporärer Block – wird später wieder entfernt');
  });

  it('describes removals', async () => {
    const remove = FIXTURE_PLAN.steps[2]?.actions[0];
    if (!remove) throw new Error('fixture');
    expect(text.actionLines(remove, () => AIR)).toEqual([
      { kind: 'stand', text: 'Break Dirt' },
      {
        kind: 'stand',
        text: 'Stand 2 blocks south of it, on the same level',
        detail: 'Coordinates relative to the build: 2\u00a0/\u00a00\u00a0/\u00a02',
      },
      { kind: 'temp', text: 'It was only a temporary support.' },
    ]);
    const bare: RemoveAction = {
      kind: 'remove',
      pos: { x: -3, y: 1, z: 0 },
      state: STONE,
      reason: 'scaffold',
    };
    expect(text.actionLines(bare, () => AIR)).toEqual([
      {
        kind: 'stand',
        text: 'Break Stone',
        detail: 'Coordinates relative to the build: \u22123\u00a0/\u00a01\u00a0/\u00a00',
      },
      { kind: 'temp', text: 'It was only scaffolding.' },
    ]);
    await language.use('de');
    expect(text.actionLines(remove, () => AIR).map((l) => l.text)).toEqual([
      'Baue Erde ab',
      'Stell dich 2 Blöcke südlich davon, auf gleicher Höhe',
      'Er war nur eine temporäre Stütze.',
    ]);
  });

  describe('stand positions relative to the block', () => {
    const POS: Vec3 = { x: 10, y: 5, z: -4 };
    const actionAt = (d: Vec3, extra: Partial<PlaceAction> = {}): PlaceAction => ({
      ...stairs,
      pos: POS,
      standAt: { x: POS.x + d.x, y: POS.y + d.y, z: POS.z + d.z },
      ...extra,
    });
    const stand = (d: Vec3, onTemporary = false, extra: Partial<PlaceAction> = {}) => {
      const desc = describeStandPosition(actionAt(d, extra), { onTemporary });
      if (!desc) throw new Error('no description');
      return text.stand(desc);
    };
    const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

    it('describes offsets in English', () => {
      expect(stand(v(1, 0, 0))).toBe('Stand right next to it (east), on the same level');
      expect(stand(v(-1, 0, 0))).toBe('Stand right next to it (west), on the same level');
      expect(stand(v(0, 0, -1))).toBe('Stand right next to it (north), on the same level');
      expect(stand(v(0, 1, 1))).toBe('Stand right next to it (south), 1 block higher');
      expect(stand(v(1, 0, -1))).toBe('Stand diagonally next to it (northeast), on the same level');
      expect(stand(v(-1, -2, 1))).toBe('Stand diagonally next to it (southwest), 2 blocks lower');
      expect(stand(v(-1, 0, 2))).toBe(
        'Stand 2 blocks south and 1 block west of it, on the same level',
      );
      expect(stand(v(3, -1, 0))).toBe('Stand 3 blocks east of it, 1 block lower');
      expect(stand(v(0, 3, -2))).toBe('Stand 2 blocks north of it, 3 blocks higher');
      expect(stand(v(0, 2, 0))).toBe('Stand directly above it, 2 blocks higher');
      expect(stand(v(0, -3, 0))).toBe('Stand directly below it, 3 blocks lower');
      expect(stand(v(0, 1, 0))).toBe('Stand on top of it');
      expect(stand(v(0, 0, 0), false, { jump: true })).toBe('Stand on the block below it');
      expect(stand(v(0, 0, 0), true, { jump: true })).toBe(
        'Stand on the block below it (your scaffold)',
      );
      expect(stand(v(1, 1, 0), true)).toBe(
        'Stand right next to it (east), 1 block higher (on the scaffold)',
      );
    });

    it('describes offsets in German with singular and plural', async () => {
      await language.use('de');
      expect(stand(v(-1, 0, 2))).toBe(
        'Stell dich 2 Blöcke südlich und 1 Block westlich davon, auf gleicher Höhe',
      );
      expect(stand(v(1, 0, 0))).toBe('Stell dich direkt daneben (östlich), auf gleicher Höhe');
      expect(stand(v(0, 0, -1))).toBe('Stell dich direkt daneben (nördlich), auf gleicher Höhe');
      expect(stand(v(-1, 0, 0))).toBe('Stell dich direkt daneben (westlich), auf gleicher Höhe');
      expect(stand(v(0, -1, 1))).toBe('Stell dich direkt daneben (südlich), 1 Block tiefer');
      expect(stand(v(1, 0, 1))).toBe('Stell dich schräg daneben (südöstlich), auf gleicher Höhe');
      expect(stand(v(-1, 2, -1))).toBe('Stell dich schräg daneben (nordwestlich), 2 Blöcke höher');
      expect(stand(v(0, -3, 4))).toBe('Stell dich 4 Blöcke südlich davon, 3 Blöcke tiefer');
      expect(stand(v(-2, 0, -1))).toBe(
        'Stell dich 1 Block nördlich und 2 Blöcke westlich davon, auf gleicher Höhe',
      );
      expect(stand(v(0, 2, 0))).toBe('Stell dich genau darüber, 2 Blöcke höher');
      expect(stand(v(0, -1, 0))).toBe('Stell dich genau darunter, 1 Block tiefer');
      expect(stand(v(0, 1, 0))).toBe('Stell dich oben drauf');
      expect(stand(v(0, 0, 0), false, { jump: true })).toBe('Stell dich auf den Block darunter');
      expect(stand(v(0, 0, 0), true, { jump: true })).toBe(
        'Stell dich auf den Block darunter (dein Gerüst)',
      );
      expect(stand(v(0, 1, 2), true)).toBe(
        'Stell dich 2 Blöcke südlich davon, 1 Block höher (auf dem Gerüst)',
      );
    });

    it('keeps the raw coordinates as a secondary detail', async () => {
      const line = text
        .actionLines(actionAt(v(-8, -5, 3)), () => STONE)
        .find((l) => l.kind === 'stand');
      expect(line).toEqual({
        kind: 'stand',
        text: 'Stand 3 blocks south and 8 blocks west of it, 5 blocks lower',
        detail: 'Coordinates relative to the build: 2\u00a0/\u00a00\u00a0/\u00a0\u22121',
      });
      await language.use('de');
      expect(text.actionLines(actionAt(v(-8, -5, 3)), () => STONE, true)[1]).toEqual({
        kind: 'stand',
        text: 'Stell dich 3 Blöcke südlich und 8 Blöcke westlich davon, 5 Blöcke tiefer (auf dem Gerüst)',
        detail: 'Koordinaten relativ zum Bau: 2\u00a0/\u00a00\u00a0/\u00a0\u22121',
      });
    });

    it('formats negative coordinates with a typographic minus', () => {
      expect(signed(-12)).toBe('\u221212');
      expect(signed(0)).toBe('0');
      expect(signed(7)).toBe('7');
      expect(text.pos(v(-1, 0, 3))).toBe('\u22121 / 0 / 3');
    });
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
