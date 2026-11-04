import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { Hint, LookDirection, PlaceAction, StepAction } from '@laracraft/build-order';
import {
  AIR,
  parseBlockState,
  type BlockStateString,
  type Direction,
  type Vec3,
} from '@laracraft/core-model';
import { LanguageService } from '../i18n/language.service';

/** Compass bearing of a horizontal direction (north = up = 0°), for the arrow icon. */
export const BEARING: Readonly<Record<LookDirection['horizontal'], number>> = {
  north: 0,
  east: 90,
  south: 180,
  west: 270,
};

/** Block or item id without namespace and blockstate properties: `oak_stairs`. */
export function idPath(idOrState: string): string {
  const bracket = idOrState.indexOf('[');
  const id = bracket === -1 ? idOrState : idOrState.slice(0, bracket);
  return id.slice(id.indexOf(':') + 1);
}

/** Readable fallback name: `minecraft:oak_stairs[…]` → `Oak Stairs`. */
export function prettifyId(idOrState: string): string {
  return idPath(idOrState)
    .split(/[_/]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * True when the placed state faces up/down, i.e. the player must look steeply
 * (pistons, observers, dispensers …); a plain `down` look is only a slight tilt.
 */
export function isSteepLook(state: BlockStateString): boolean {
  try {
    const facing = parseBlockState(state).properties['facing'];
    return facing === 'up' || facing === 'down';
  } catch {
    return false;
  }
}

/** One line of the selected-action detail view. */
export interface ActionLine {
  readonly kind:
    'hold' | 'stand' | 'look' | 'click' | 'half' | 'jump' | 'sneak' | 'interact' | 'temp';
  readonly text: string;
}

/**
 * Translation helpers for the guide. Every method reads the active language
 * signal, so `computed`s built on them re-run on a language switch.
 */
@Injectable({ providedIn: 'root' })
export class GuideText {
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);

  t(key: string, params?: Record<string, unknown>): string {
    this.language.lang();
    return this.transloco.translate(key, params);
  }

  /** Whether the active language (or the fallback) has a translation for `key`. */
  has(key: string): boolean {
    this.language.lang();
    const langs = [this.transloco.getActiveLang(), this.transloco.config.fallbackLang];
    return langs.some((l) => typeof l === 'string' && key in this.transloco.getTranslation(l));
  }

  /** `blocks.<path>` (or `items.<path>`) when translated, else a prettified id. */
  blockName(idOrState: string): string {
    const path = idPath(idOrState);
    for (const ns of ['blocks', 'items']) {
      const key = `${ns}.${path}`;
      if (this.has(key)) return this.t(key);
    }
    return prettifyId(idOrState);
  }

  pos(v: Vec3): string {
    return this.t('guide.pos', { x: v.x, y: v.y, z: v.z });
  }

  /** e.g. „Schau nach Norden, leicht nach unten“. */
  look(look: LookDirection, steep = false): string {
    const vertical =
      look.vertical === 'level' ? 'level' : steep ? `${look.vertical}Steep` : look.vertical;
    return this.t('guide.look.text', {
      direction: this.t(`guide.look.horizontal.${look.horizontal}`),
      vertical: this.t(`guide.look.vertical.${vertical}`),
    });
  }

  face(face: Direction): string {
    return this.t(`guide.face.${face}`);
  }

  /** „Klicke auf die Oberseite von Stein“ (the ground when the clicked block is not part of the build). */
  click(action: PlaceAction, clickedState: BlockStateString): string {
    const face = this.face(action.clickOn.face);
    return clickedState === AIR
      ? this.t('guide.action.clickGround', { face })
      : this.t('guide.action.click', { face, block: this.blockName(clickedState) });
  }

  hint(hint: Hint): string {
    return this.t(`guide.hint.${hint.code}`, { ...hint.params });
  }

  /** Detail lines for a selected action. */
  actionLines(action: StepAction, blockAt: (pos: Vec3) => BlockStateString): ActionLine[] {
    if (action.kind === 'remove') {
      return [
        {
          kind: 'stand',
          text: this.t('guide.action.remove', {
            block: this.blockName(action.state),
            pos: this.pos(action.pos),
          }),
        },
        ...(action.standAt
          ? [
              {
                kind: 'stand' as const,
                text: this.t('guide.action.stand', { pos: this.pos(action.standAt) }),
              },
            ]
          : []),
        { kind: 'temp', text: this.t(`guide.action.reason.${action.reason}`) },
      ];
    }
    const lines: ActionLine[] = [
      { kind: 'hold', text: this.t('guide.action.hold', { item: this.blockName(action.item) }) },
      { kind: 'stand', text: this.t('guide.action.stand', { pos: this.pos(action.standAt) }) },
      { kind: 'look', text: this.look(action.look, isSteepLook(action.state)) },
      { kind: 'click', text: this.click(action, blockAt(action.clickOn.pos)) },
    ];
    if (action.clickHalf) {
      lines.push({ kind: 'half', text: this.t(`guide.action.half.${action.clickHalf}`) });
    }
    if (action.jump) lines.push({ kind: 'jump', text: this.t('guide.action.jump') });
    if (action.sneak) lines.push({ kind: 'sneak', text: this.t('guide.action.sneak') });
    if (action.interactions) {
      lines.push({
        kind: 'interact',
        text: this.t('guide.action.interactions', { count: action.interactions }),
      });
    }
    if (action.temporary) lines.push({ kind: 'temp', text: this.t('guide.action.temporary') });
    return lines;
  }
}
