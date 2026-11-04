import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { BlockCategory, BlockDefinition, BlockRegistry } from '@laracraft/core-model';
import { Icon } from '../icon';
import { BlockIcon } from './block-icon';
import {
  FAVORITES_KEY,
  RECENT_KEY,
  paletteData,
  pushRecent,
  readIdList,
  searchBlocks,
  toggleId,
  writeIdList,
} from './palette-model';

export type PaletteTab = 'favorites' | 'recent' | 'all' | BlockCategory;

function safeLocalStorage(doc: Document): Storage | undefined {
  try {
    return doc.defaultView?.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Block palette as a bottom sheet: categories from the registry, search (name in
 * the active language, English name and tags), favourites and recently used
 * blocks (both persisted in localStorage).
 */
@Component({
  selector: 'lc-block-palette',
  imports: [TranslocoPipe, Icon, BlockIcon],
  templateUrl: './block-palette.html',
  styleUrl: './block-palette.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlockPalette {
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);
  private readonly storage = safeLocalStorage(this.document);
  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('sheet');
  private readonly searchRef = viewChild.required<ElementRef<HTMLInputElement>>('search');
  private returnFocus: HTMLElement | null = null;
  private readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly registry = input.required<BlockRegistry>();
  /** Id of the active block (highlighted). */
  readonly activeId = input<string | null>(null);
  readonly selected = output<BlockDefinition>();

  readonly isOpen = signal(false);
  protected readonly query = signal('');
  protected readonly favorites = signal<string[]>(readIdList(this.storage, FAVORITES_KEY));
  protected readonly recent = signal<string[]>(readIdList(this.storage, RECENT_KEY));
  protected readonly tab = signal<PaletteTab>(this.recent().length ? 'recent' : 'all');

  protected readonly data = computed(() => paletteData(this.registry()));
  protected readonly tabs = computed<PaletteTab[]>(() => [
    'favorites',
    'recent',
    'all',
    ...this.data().categories,
  ]);

  private readonly names = computed(() => {
    this.lang();
    const map = new Map<string, string>();
    for (const def of this.data().blocks) map.set(def.id, this.transloco.translate(def.nameKey));
    return map;
  });

  protected readonly visible = computed(() => {
    const { blocks } = this.data();
    const query = this.query();
    if (query.trim()) return searchBlocks(blocks, query, (d) => this.name(d));
    const byId = (ids: readonly string[]) =>
      ids.flatMap((id) => blocks.find((b) => b.id === id) ?? []);
    const tab = this.tab();
    switch (tab) {
      case 'favorites':
        return byId(this.favorites());
      case 'recent':
        return byId(this.recent());
      case 'all':
        return blocks;
      default:
        return blocks.filter((b) => b.category === tab);
    }
  });

  name(def: BlockDefinition): string {
    return this.names().get(def.id) ?? def.id;
  }

  protected tabLabel(tab: PaletteTab): string {
    return tab === 'favorites' || tab === 'recent' || tab === 'all'
      ? `editor.palette.${tab}`
      : `editor.category.${tab}`;
  }

  protected isFavorite(def: BlockDefinition): boolean {
    return this.favorites().includes(def.id);
  }

  show(): void {
    const active = this.document.activeElement;
    this.returnFocus = active instanceof HTMLElement ? active : null;
    const el = this.dialogRef().nativeElement;
    if (!el.open) {
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
    }
    this.isOpen.set(true);
    this.searchRef().nativeElement.focus();
  }

  close(): void {
    const el = this.dialogRef().nativeElement;
    if (typeof el.close === 'function' && el.open) el.close();
    else el.removeAttribute('open');
    this.onClosed();
  }

  /** Also fires for Escape (native `close` event). */
  protected onClosed(): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    const target = this.returnFocus;
    this.returnFocus = null;
    if (target?.isConnected) target.focus();
  }

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected selectTab(tab: PaletteTab): void {
    this.tab.set(tab);
    this.query.set('');
  }

  protected choose(def: BlockDefinition): void {
    this.recent.update((r) => pushRecent(r, def.id));
    writeIdList(this.storage, RECENT_KEY, this.recent());
    this.selected.emit(def);
    this.close();
  }

  protected toggleFavorite(def: BlockDefinition): void {
    this.favorites.update((f) => toggleId(f, def.id));
    writeIdList(this.storage, FAVORITES_KEY, this.favorites());
  }
}
