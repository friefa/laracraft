import type { BuildPhase, HintCode } from '@laracraft/build-order';
import type { GuideIconName } from './guide-icon';
import type { ActionLine } from './guide-text';

/** Colour family: `.lc-tone--<tone>` (callouts) and `.lc-pill--soft-<tone>` (phase pills). */
export type LessonTone = 'green' | 'blue' | 'orange' | 'yellow' | 'purple' | 'grey';

/** Phase pill colours (docs/DESIGN.md): structure green, redstone orange, power yellow … */
export const PHASE_TONE: Readonly<Record<BuildPhase, LessonTone>> = {
  structure: 'green',
  redstone: 'orange',
  power: 'yellow',
  fluids: 'blue',
  cleanup: 'grey',
};

/** Callout colour and icon of each hint. */
export const HINT_STYLE: Readonly<Record<HintCode, { tone: LessonTone; icon: GuideIconName }>> = {
  'temporary-support': { tone: 'grey', icon: 'temp' },
  scaffold: { tone: 'grey', icon: 'temp' },
  'remove-temporary': { tone: 'grey', icon: 'temp' },
  'keep-circuit-open': { tone: 'orange', icon: 'alert' },
  'power-source-last': { tone: 'yellow', icon: 'bolt' },
  'observer-order': { tone: 'orange', icon: 'alert' },
  'fluids-last': { tone: 'blue', icon: 'drop' },
  'look-direction': { tone: 'purple', icon: 'look' },
  interaction: { tone: 'purple', icon: 'interact' },
};

/** Icon and colour of a line in the selected-action card. */
export const LINE_STYLE: Readonly<
  Record<ActionLine['kind'], { tone: LessonTone; icon: GuideIconName }>
> = {
  hold: { tone: 'green', icon: 'hold' },
  stand: { tone: 'blue', icon: 'stand' },
  look: { tone: 'purple', icon: 'look' },
  click: { tone: 'orange', icon: 'click' },
  half: { tone: 'orange', icon: 'half' },
  jump: { tone: 'yellow', icon: 'jump' },
  sneak: { tone: 'blue', icon: 'sneak' },
  interact: { tone: 'yellow', icon: 'interact' },
  temp: { tone: 'grey', icon: 'temp' },
};

/** Overall lesson progress (0..1) shown in the top bar: current step / total. */
export function lessonProgress(index: number, total: number, finished = false): number {
  if (total <= 0) return 0;
  if (finished) return 1;
  return Math.max(0, Math.min(1, (index + 1) / total));
}
