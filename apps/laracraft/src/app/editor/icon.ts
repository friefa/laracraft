import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Simple stroke icons (own work, 24×24 grid). Decorative only: the buttons that
 * use them carry a translated `aria-label`.
 */
const ICONS = {
  back: 'M15 5l-7 7 7 7',
  undo: 'M9 7L4 12l5 5M4 12h11a5 5 0 010 10h-3',
  redo: 'M15 7l5 5-5 5M20 12H9a5 5 0 000 10h3',
  more: 'M12 5.5v.01M12 12v.01M12 18.5v.01',
  place: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12v9M4 7.5l8 4.5 8-4.5',
  remove: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  pick: 'M14 4l6 6-2 2-6-6zM12 8l-8 8v4h4l8-8',
  select: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4',
  fill: 'M5 11l7-7 7 7-7 7zM19 15c0 2 1 3 1 4a1 1 0 01-2 0c0-1 1-2 1-4z',
  replace: 'M4 8h12l-3-3M20 16H8l3 3',
  rotateLeft: 'M8 4L4 8l4 4M4 8h9a7 7 0 010 14H9',
  rotateRight: 'M16 4l4 4-4 4M20 8h-9a7 7 0 000 14h4',
  mirrorX: 'M12 3v18M9 6L3 12l6 6zM15 6l6 6-6 6z',
  mirrorZ: 'M3 12h18M6 9l6-6 6 6zM6 15l6 6 6-6z',
  copy: 'M8 8h12v12H8zM16 8V4H4v12h4',
  cut: 'M6 6a2 2 0 104 0 2 2 0 00-4 0M6 18a2 2 0 104 0 2 2 0 00-4 0M9.5 7.5L20 18M9.5 16.5L20 6',
  delete: 'M6 6l12 12M18 6L6 18',
  paste: 'M8 4h8v3H8zM6 5H4v16h16V5h-2M9 14l2 2 4-4',
  check: 'M5 12l5 5 9-10',
  frame: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M9 9h6v6H9z',
  star: 'M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1-4.5-4.2 6.1-.8z',
  search: 'M10.5 4a6.5 6.5 0 110 13 6.5 6.5 0 010-13M15.5 15.5L20 20',
  close: 'M6 6l12 12M18 6L6 18',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
} as const;

export type IconName = keyof typeof ICONS;

@Component({
  selector: 'lc-icon',
  template: `<svg
    viewBox="0 0 24 24"
    width="24"
    height="24"
    aria-hidden="true"
    focusable="false"
    [attr.fill]="filled() ? 'currentColor' : 'none'"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path [attr.d]="path()" />
  </svg>`,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
    svg {
      width: var(--lc-icon, 1.5rem);
      height: var(--lc-icon, 1.5rem);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly filled = input(false);

  protected readonly path = computed(() => ICONS[this.name()]);
}
