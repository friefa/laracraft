import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Names of the guide's small comic icon set. */
export type GuideIconName =
  | 'hold'
  | 'stand'
  | 'look'
  | 'click'
  | 'half'
  | 'jump'
  | 'sneak'
  | 'interact'
  | 'temp'
  | 'close'
  | 'check'
  | 'alert'
  | 'drop'
  | 'bolt'
  | 'info'
  | 'chevron-left';

interface IconShape {
  readonly d: string;
  /** Outlined icons get the comic ink contour; tiny glyphs (check, close) stay flat. */
  readonly ink?: boolean;
  readonly transform?: string;
}

/** Filled, chunky 24×24 shapes (own drawings, no third-party icon set). */
const ICONS: Readonly<Record<GuideIconName, IconShape>> = {
  // Isometric block in the hand.
  hold: {
    d: 'M12 2.5 21 7.5v9L12 21.5 3 16.5v-9zM12 12.3 5 8.4M12 12.3l7-3.9M12 12.3V20',
    ink: true,
  },
  // Map pin with a hole: "stand here".
  stand: {
    d: 'M12 1.8a7.4 7.4 0 0 0-7.4 7.4c0 5.4 7.4 13 7.4 13s7.4-7.6 7.4-13A7.4 7.4 0 0 0 12 1.8zm0 4.4a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
    ink: true,
  },
  // Eye.
  look: {
    d: 'M12 5C6.5 5 2.5 9.4 1.5 12c1 2.6 5 7 10.5 7s9.5-4.4 10.5-7C21.5 9.4 17.5 5 12 5zm0 3.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6z',
    ink: true,
  },
  // Mouse pointer.
  click: { d: 'M5 2.5 19.5 12.2l-6.6 1.5 3.7 7.1-3.1 1.6-3.7-7.2L5 20z', ink: true },
  // Block face with the lower half filled ("aim at the lower/upper half").
  half: {
    d: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1.5 2.5v6h13v-6z',
    ink: true,
  },
  // Chunky up arrow.
  jump: { d: 'M12 2 21.5 12H15.8v9.5H8.2V12H2.5z', ink: true },
  // Two chunky down chevrons ("crouch").
  sneak: {
    d: 'M3 4.5 6 2l6 5.2L18 2l3 2.5-9 7.8zM3 12.7l3-2.5 6 5.2 6-5.2 3 2.5-9 7.8z',
    ink: true,
  },
  // Sparkle: "right-click it".
  interact: {
    d: 'M12 1.5l2.6 6.4 6.9.6-5.2 4.5 1.6 6.8L12 16.2l-5.9 3.6 1.6-6.8-5.2-4.5 6.9-.6z',
    ink: true,
  },
  // Hourglass: temporary.
  temp: {
    d: 'M5.5 2h13v3c0 3-2.6 5.2-4.6 7 2 1.8 4.6 4 4.6 7v3h-13v-3c0-3 2.6-5.2 4.6-7-2-1.8-4.6-4-4.6-7z',
    ink: true,
  },
  close: {
    d: 'M9.4 2.5h5.2v6.9h6.9v5.2h-6.9v6.9H9.4v-6.9H2.5V9.4h6.9z',
    transform: 'rotate(45 12 12)',
  },
  check: { d: 'M2.5 12.6 6.2 8.9l3.9 3.9 7.7-7.7 3.7 3.7L10.1 20.2z' },
  // Warning triangle with an exclamation mark.
  alert: {
    d: 'M12 2 23 21H1zm-1.6 6.5.4 6.5h2.4l.4-6.5zM12 16.3a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z',
    ink: true,
  },
  // Water drop.
  drop: { d: 'M12 1.8S4.5 10.2 4.5 15a7.5 7.5 0 0 0 15 0C19.5 10.2 12 1.8 12 1.8z', ink: true },
  // Lightning bolt: power.
  bolt: { d: 'M14 1.5 4 13.5h6.2L8.5 22.5 20 9.5h-6.4z', ink: true },
  // Speech "i".
  info: {
    d: 'M12 1.5a10.5 10.5 0 1 1 0 21 10.5 10.5 0 0 1 0-21zm-1.7 8.3v8.5h3.4V9.8zM12 4.6a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8z',
    ink: true,
  },
  'chevron-left': { d: 'M15.5 2.5 19 6l-6 6 6 6-3.5 3.5L6 12z' },
};

/** Decorative comic icon of the build guide (inherits `color`, sized by `font-size`). */
@Component({
  selector: 'lc-guide-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[attr.data-icon]': 'name()' },
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      width: 1.25em;
      height: 1.25em;
    }
    svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }
  `,
  template: `
    <svg viewBox="0 0 24 24" focusable="false">
      <path
        [attr.d]="shape().d"
        [attr.transform]="shape().transform ?? null"
        fill="currentColor"
        fill-rule="evenodd"
        [attr.stroke]="shape().ink ? 'var(--lc-ink)' : null"
        [attr.stroke-width]="shape().ink ? 1.6 : null"
        stroke-linejoin="round"
      />
    </svg>
  `,
})
export class GuideIcon {
  readonly name = input.required<GuideIconName>();
  protected readonly shape = computed(() => ICONS[this.name()]);
}
