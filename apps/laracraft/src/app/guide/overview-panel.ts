import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { BuildPlan } from '@laracraft/build-order';
import { LanguageService } from '../i18n/language.service';
import { GuideBlockTile } from './block-tile';
import { loadChecklist, safeStorage, saveChecklist } from './checklist';
import { GuideIcon } from './guide-icon';
import { GuideText } from './guide-text';
import { formatItemStacks, sortMaterials, type MaterialSort } from './materials';

/**
 * Whole-build overview: total materials as a gathering checklist (big round checkboxes and
 * a progress bar), temporary materials, warnings.
 */
@Component({
  selector: 'lc-guide-overview',
  imports: [TranslocoPipe, GuideIcon, GuideBlockTile],
  templateUrl: './overview-panel.html',
  styleUrl: './overview-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideOverview {
  private readonly text = inject(GuideText);
  private readonly language = inject(LanguageService);
  private readonly storage = safeStorage();

  readonly plan = input.required<BuildPlan>();
  readonly buildId = input.required<string>();

  protected readonly sort = signal<MaterialSort>({ by: 'name', dir: 'asc' });
  protected readonly checked = linkedSignal(() => loadChecklist(this.storage, this.buildId()));

  protected readonly totals = computed(() => {
    const checked = this.checked();
    return sortMaterials(
      this.plan().totalMaterials,
      this.sort(),
      (item) => this.text.blockName(item),
      this.language.lang(),
    ).map((m) => ({
      item: m.item,
      name: this.text.blockName(m.item),
      count: m.count,
      stacks: formatItemStacks(m),
      checked: checked.has(m.item),
    }));
  });

  protected readonly doneCount = computed(() => this.totals().filter((m) => m.checked).length);

  protected readonly temporary = computed(() =>
    this.plan().temporaryMaterials.map((m) => ({
      item: m.item,
      name: this.text.blockName(m.item),
      stacks: formatItemStacks(m),
    })),
  );

  protected readonly warnings = computed(() =>
    this.plan().warnings.map((w) => ({
      text: this.text.t(`guide.warning.${w.code}`),
      at: w.pos ? this.text.t('guide.overview.warningAt', { pos: this.text.pos(w.pos) }) : '',
      message: w.message,
    })),
  );

  protected sortBy(column: MaterialSort['by']): void {
    const s = this.sort();
    this.sort.set(
      s.by === column
        ? { by: column, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { by: column, dir: column === 'count' ? 'desc' : 'asc' },
    );
  }

  protected onCheck(item: string, event: Event): void {
    this.toggle(item, (event.target as HTMLInputElement).checked);
  }

  protected toggle(item: string, on: boolean): void {
    const next = new Set(this.checked());
    if (on) next.add(item);
    else next.delete(item);
    this.checked.set(next);
    saveChecklist(this.storage, this.buildId(), next);
  }

  protected reset(): void {
    this.checked.set(new Set());
    saveChecklist(this.storage, this.buildId(), new Set());
  }
}
