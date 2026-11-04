import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  model,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { BuildPlan, BuildStep } from '@laracraft/build-order';
import type { BlockStateString, Vec3 } from '@laracraft/core-model';
import { Lara } from '../shared/lara/lara';
import { groupActions } from './action-groups';
import { GuideBlockTile } from './block-tile';
import { GuideIcon } from './guide-icon';
import { BEARING, GuideText } from './guide-text';
import { HINT_STYLE, LINE_STYLE } from './lesson-style';
import { temporaryBlockAt } from './stand-position';
import { formatItemStacks } from './materials';

/**
 * One lesson step: materials as item rows, the actions as numbered chips, the selected
 * action's details as a speech bubble from Lara, and the hints as coloured callouts.
 */
@Component({
  selector: 'lc-guide-step-panel',
  imports: [TranslocoPipe, Lara, GuideIcon, GuideBlockTile],
  templateUrl: './step-panel.html',
  styleUrl: './step-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideStepPanel {
  protected readonly text = inject(GuideText);
  private readonly injector = inject(Injector);
  private readonly detailRef = viewChild<ElementRef<HTMLElement>>('detail');

  readonly step = input.required<BuildStep>();
  /** Block lookup in the step document (for "click the top of …"). */
  readonly blockAt = input.required<(pos: Vec3) => BlockStateString>();
  /** The whole plan, to tell whether the player stands on a temporary block (scaffold). */
  readonly plan = input<BuildPlan | null>(null);
  /** Index into `step.actions` of the selected action. */
  readonly selected = model<number | null>(null);
  /** Index into `step.hints` whose positions are highlighted. */
  readonly selectedHint = model<number | null>(null);

  protected readonly materials = computed(() =>
    this.step().materials.map((m) => ({
      item: m.item,
      name: this.text.blockName(m.item),
      count: m.count,
      stacks: formatItemStacks(m),
    })),
  );

  protected readonly groups = computed(() =>
    groupActions(this.step().actions).map((g) => ({
      ...g,
      label: this.text.t(g.kind === 'place' ? 'guide.step.place' : 'guide.step.remove', {
        count: g.indices.length,
        block: this.text.blockName(g.state),
      }),
      chips: g.indices.map((i) => ({
        index: i,
        label: this.text.t('guide.step.actionLabel', {
          n: i + 1,
          pos: this.text.pos((this.step().actions[i] as { pos: Vec3 }).pos),
        }),
      })),
    })),
  );

  protected readonly detail = computed(() => {
    const index = this.selected();
    const action = index === null ? undefined : this.step().actions[index];
    if (index === null || !action) return null;
    return {
      title: this.text.t('guide.step.detailTitle', {
        n: index + 1,
        block: this.text.blockName(action.state),
      }),
      state: action.state,
      bearing: action.kind === 'place' ? BEARING[action.look.horizontal] : null,
      compass:
        action.kind === 'place' ? this.text.t(`guide.look.compass.${action.look.horizontal}`) : '',
      vertical: action.kind === 'place' ? action.look.vertical : 'level',
      lines: this.text
        .actionLines(action, this.blockAt(), this.standsOnTemporary(index))
        .map((line) => ({ ...line, ...LINE_STYLE[line.kind] })),
    };
  });

  /** Whether the block under the selected action's stand position is temporary right then. */
  private standsOnTemporary(index: number): boolean {
    const plan = this.plan();
    const standAt = this.step().actions[index]?.standAt;
    if (!plan || !standAt) return false;
    const below = { x: standAt.x, y: standAt.y - 1, z: standAt.z };
    return temporaryBlockAt(plan, this.step().index, index, below);
  }

  protected readonly hints = computed(() =>
    this.step().hints.map((h) => ({
      text: this.text.hint(h),
      ...(HINT_STYLE[h.code] ?? ({ tone: 'grey', icon: 'info' } as const)),
      hasPositions: (h.positions?.length ?? 0) > 0,
    })),
  );

  protected select(index: number): void {
    this.selected.set(this.selected() === index ? null : index);
    // The details sit above the chips: on phones they are often scrolled out of the sheet.
    // Align their top (title first) with the top of the sheet.
    afterNextRender(() => this.detailRef()?.nativeElement.scrollIntoView?.({ block: 'start' }), {
      injector: this.injector,
    });
  }

  protected toggleHint(index: number): void {
    this.selectedHint.set(this.selectedHint() === index ? null : index);
  }
}
