import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from './icon';

/**
 * Vertical layer slider: a chunky track with a big round thumb and the current Y in a
 * pill. The native range input sits invisibly on top of the drawing, so keyboard,
 * touch and screen readers keep the platform behaviour.
 */
@Component({
  selector: 'lc-layer-slider',
  imports: [TranslocoPipe, Icon],
  template: `
    <span class="lc-pill lc-pill--blue value" aria-hidden="true">
      {{ limit() === null ? '∞' : 'Y ' + limit() }}
    </span>
    <div class="track" [style.--value]="fraction()">
      <span class="thumb"></span>
      <input
        type="range"
        data-control="layer"
        [min]="min()"
        [max]="max()"
        step="1"
        [value]="value()"
        [attr.aria-label]="'editor.layer.label' | transloco"
        [attr.aria-valuetext]="
          limit() === null
            ? ('editor.layer.all' | transloco)
            : ('editor.layer.value' | transloco: { y: value() })
        "
        (input)="onInput($event)"
      />
    </div>
    <lc-icon name="layers" />
  `,
  styles: `
    :host {
      --thumb: 2.25rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 0.4rem;
      color: var(--lc-muted);
      background: var(--lc-surface);
      border: var(--lc-border-w) solid var(--lc-border);
      border-radius: var(--lc-radius-pill);
      box-shadow: 0 var(--lc-depth) 0 var(--lc-border);
    }
    .value {
      min-width: 2.75rem;
      justify-content: center;
      padding-inline: 0.4rem;
      color: var(--lc-blue);
      font-size: var(--lc-fs-sm);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .track {
      --value: 1;
      position: relative;
      width: var(--thumb);
      height: min(36dvh, 15rem);
    }
    /* Groove and fill, like .lc-progress but upright. */
    .track::before,
    .track::after {
      content: '';
      position: absolute;
      left: 50%;
      bottom: 0;
      width: 1rem;
      border-radius: var(--lc-radius-pill);
      transform: translateX(-50%);
    }
    .track::before {
      top: 0;
      background: var(--lc-border);
    }
    .track::after {
      height: calc(var(--thumb) / 2 + var(--value) * (100% - var(--thumb)));
      background: var(--lc-blue);
    }
    .thumb {
      position: absolute;
      z-index: 1;
      left: 0;
      bottom: calc(var(--value) * (100% - var(--thumb)));
      width: var(--thumb);
      height: var(--thumb);
      background: var(--lc-text-strong);
      border: 3px solid var(--lc-blue);
      border-radius: 50%;
      box-shadow: 0 3px 0 var(--lc-blue-shade);
      transition: bottom 120ms var(--lc-ease-bounce);
    }
    input {
      position: absolute;
      inset: 0;
      z-index: 2;
      width: 100%;
      height: 100%;
      margin: 0;
      opacity: 0;
      cursor: grab;
      writing-mode: vertical-lr;
      direction: rtl;
      appearance: none;
    }
    input::-webkit-slider-thumb {
      appearance: none;
      width: var(--thumb);
      height: var(--thumb);
    }
    input::-moz-range-thumb {
      width: var(--thumb);
      height: var(--thumb);
    }
    .track:has(input:focus-visible) .thumb {
      outline: 3px solid var(--lc-blue);
      outline-offset: 2px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayerSlider {
  readonly min = input.required<number>();
  readonly max = input.required<number>();
  /** Highest visible layer; null shows all layers. */
  readonly limit = input<number | null>(null);
  readonly limitChange = output<number | null>();

  protected readonly value = computed(() => this.limit() ?? this.max());
  protected readonly fraction = computed(() => {
    const span = this.max() - this.min();
    return span > 0 ? (this.value() - this.min()) / span : 1;
  });

  protected onInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.limitChange.emit(value >= this.max() ? null : value);
  }
}
