import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { BuildStep } from '@laracraft/build-order';
import type { BlockStateString, Vec3 } from '@laracraft/core-model';
import { groupActions } from './action-groups';
import { BEARING, GuideText } from './guide-text';
import { formatItemStacks } from './materials';

/** Materials, compact action list, selected-action details and hints of one step. */
@Component({
  selector: 'lc-guide-step-panel',
  imports: [TranslocoPipe],
  templateUrl: './step-panel.html',
  styleUrl: './step-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideStepPanel {
  protected readonly text = inject(GuideText);

  readonly step = input.required<BuildStep>();
  /** Block lookup in the step document (for "click the top of …"). */
  readonly blockAt = input.required<(pos: Vec3) => BlockStateString>();
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
      bearing: action.kind === 'place' ? BEARING[action.look.horizontal] : null,
      compass:
        action.kind === 'place' ? this.text.t(`guide.look.compass.${action.look.horizontal}`) : '',
      vertical: action.kind === 'place' ? action.look.vertical : 'level',
      lines: this.text.actionLines(action, this.blockAt()),
    };
  });

  protected readonly hints = computed(() =>
    this.step().hints.map((h) => ({
      text: this.text.hint(h),
      hasPositions: (h.positions?.length ?? 0) > 0,
    })),
  );

  protected select(index: number): void {
    this.selected.set(this.selected() === index ? null : index);
  }

  protected toggleHint(index: number): void {
    this.selectedHint.set(this.selectedHint() === index ? null : index);
  }
}
