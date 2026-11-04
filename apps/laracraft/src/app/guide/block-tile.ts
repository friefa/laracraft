import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { createJavaBlockRegistry, type BlockId } from '@laracraft/core-model';
import { BlockIcon } from '../editor/palette/block-icon';
import { idPath } from './guide-text';

let sharedRegistry: ReturnType<typeof createJavaBlockRegistry> | undefined;
const javaRegistry = () => (sharedRegistry ??= createJavaBlockRegistry());

/** Block id of an item or blockstate string: `minecraft:oak_stairs[…]` → `minecraft:oak_stairs`. */
export function blockIdOf(idOrState: string): BlockId {
  const bracket = idOrState.indexOf('[');
  const id = bracket === -1 ? idOrState : idOrState.slice(0, bracket);
  return (id.includes(':') ? id : `minecraft:${id}`) as BlockId;
}

/**
 * Decorative block tile for material and action rows: the block's texture when the
 * item is a known block, otherwise a flat tile with the item's initial.
 */
@Component({
  selector: 'lc-guide-block-tile',
  imports: [BlockIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  styles: `
    :host {
      --lc-icon-size: 100%;
      display: inline-grid;
      flex: none;
      place-items: center;
      width: 2.5rem;
      height: 2.5rem;
      padding: 0.25rem;
      border: var(--lc-border-w) solid var(--lc-border-strong);
      border-radius: var(--lc-radius-sm);
      background: var(--lc-bg-soft);
      box-shadow: 0 3px 0 var(--lc-border-strong);
    }
    span {
      color: var(--lc-muted);
      font-weight: var(--lc-fw-black);
      text-transform: uppercase;
    }
  `,
  template: `
    @if (def(); as d) {
      <lc-block-icon [block]="d" />
    } @else {
      <span>{{ initial() }}</span>
    }
  `,
})
export class GuideBlockTile {
  /** Item id or blockstate string. */
  readonly item = input.required<string>();

  protected readonly def = computed(() => javaRegistry().get(blockIdOf(this.item())));
  protected readonly initial = computed(() => idPath(this.item()).charAt(0));
}
