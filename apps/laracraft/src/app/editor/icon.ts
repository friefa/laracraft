import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * One shape of an icon. Shapes are filled and outlined in `currentColor` with round
 * joins (chunky comic look); `w` is the stroke width (0 = no outline), `line` draws
 * the path as a thick stroke only, `o` is an opacity for the lighter second tone and
 * `toggle` shapes are only filled when the icon's `filled` input is set (e.g. star).
 */
interface Shape {
  readonly d: string;
  readonly w?: number;
  readonly line?: boolean;
  readonly o?: number;
  readonly toggle?: boolean;
}

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;

const corners =
  'M4 9V6.5A2.5 2.5 0 016.5 4H9M15 4h2.5A2.5 2.5 0 0120 6.5V9M20 15v2.5a2.5 2.5 0 01-2.5 2.5H15M9 20H6.5A2.5 2.5 0 014 17.5V15';
const cross = 'M6.5 6.5l11 11M17.5 6.5l-11 11';

/**
 * Comic icon set (own work, 24×24 grid): filled, chunky shapes with rounded joins and a
 * lighter second tone. Decorative only: the buttons that use them carry a translated
 * `aria-label`.
 */
const ICONS = {
  back: [{ d: 'M10.5 4.5L3.5 12l7 7.5V15H18a2 2 0 002-2v-2a2 2 0 00-2-2h-7.5z' }],
  undo: [{ d: 'M8 9h6.5a5 5 0 010 10H11', line: true, w: 3.5 }, { d: 'M9.5 4L3.5 9l6 5z' }],
  redo: [{ d: 'M16 9H9.5a5 5 0 000 10H13', line: true, w: 3.5 }, { d: 'M14.5 4l6 5-6 5z' }],
  more: [
    { d: circle(12, 5, 2.4), w: 0 },
    { d: circle(12, 12, 2.4), w: 0 },
    { d: circle(12, 19, 2.4), w: 0 },
  ],
  place: [
    { d: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z', o: 0.45 },
    { d: 'M4 7.5L12 12v9l-8-4.5z' },
    { d: 'M20 7.5L12 12v9l8-4.5z', o: 0.7 },
  ],
  remove: [
    { d: 'M4 6.5h16', line: true, w: 3 },
    { d: 'M9.5 6V4.5h5V6', line: true, w: 2.5 },
    { d: 'M6.5 9.5h11l-1 10h-9z' },
  ],
  pick: [
    { d: 'M14.5 4.5a2.5 2.5 0 013.5 0l1.5 1.5a2.5 2.5 0 010 3.5L17.5 11.5l-5-5z' },
    { d: 'M14.5 9.5l-8 8', line: true, w: 4 },
    { d: 'M6 18l-2 2', line: true, w: 2.5, o: 0.6 },
  ],
  select: [
    { d: corners, line: true, w: 3.5 },
    { d: 'M9.5 9.5h5v5h-5z', o: 0.45 },
  ],
  fill: [
    { d: 'M5 11.5l6-6 7 7-6 6z' },
    { d: 'M8.5 8L6 5.5', line: true, w: 2.5 },
    { d: 'M20 14.5s2 2.4 2 3.7a2 2 0 01-4 0c0-1.3 2-3.7 2-3.7z', w: 1, o: 0.7 },
  ],
  replace: [
    { d: 'M4 8h9', line: true, w: 3.5 },
    { d: 'M13.5 4l6 4-6 4z' },
    { d: 'M20 16h-9', line: true, w: 3.5 },
    { d: 'M10.5 12l-6 4 6 4z' },
  ],
  rotateLeft: [{ d: 'M9 8h5a6 6 0 11-6 6', line: true, w: 3.5 }, { d: 'M10 3.5L4.5 8l5.5 4.5z' }],
  rotateRight: [
    { d: 'M15 8h-5a6 6 0 106 6', line: true, w: 3.5 },
    { d: 'M14 3.5L19.5 8 14 12.5z' },
  ],
  mirrorX: [
    { d: 'M12 2v3.5M12 10.25v3.5M12 18.5V22', line: true, w: 2.5 },
    { d: 'M9.5 5L3 18.5h6.5z' },
    { d: 'M14.5 5L21 18.5h-6.5z', o: 0.45 },
  ],
  mirrorZ: [
    { d: 'M2 12h3.5M10.25 12h3.5M18.5 12H22', line: true, w: 2.5 },
    { d: 'M5 9.5L18.5 3v6.5z' },
    { d: 'M5 14.5L18.5 21v-6.5z', o: 0.45 },
  ],
  copy: [
    { d: 'M5.5 3.5h7a2 2 0 012 2v7a2 2 0 01-2 2h-7a2 2 0 01-2-2v-7a2 2 0 012-2z', o: 0.45 },
    { d: 'M11.5 9.5h7a2 2 0 012 2v7a2 2 0 01-2 2h-7a2 2 0 01-2-2v-7a2 2 0 012-2z' },
  ],
  cut: [
    { d: 'M9.5 14L17 3.5M14.5 14L7 3.5', line: true, w: 3 },
    { d: circle(7, 17.5, 3), line: true, w: 3 },
    { d: circle(17, 17.5, 3), line: true, w: 3 },
  ],
  delete: [{ d: cross, line: true, w: 4 }],
  paste: [
    {
      d: 'M6.5 5h11a1.5 1.5 0 011.5 1.5v13a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 015 19.5v-13A1.5 1.5 0 016.5 5z',
      o: 0.45,
    },
    { d: 'M9 3h6v3.5H9z' },
    { d: 'M8.5 13.5l2.5 2.5 4.5-4.5', line: true, w: 3 },
  ],
  check: [{ d: 'M5 12.5l4.5 4.5L19 7.5', line: true, w: 4 }],
  frame: [
    { d: corners, line: true, w: 3 },
    { d: circle(12, 12, 3), w: 0 },
  ],
  star: [
    {
      d: 'M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z',
      w: 2.5,
      toggle: true,
    },
  ],
  search: [
    { d: circle(10.5, 10.5, 6), w: 0, o: 0.3 },
    { d: circle(10.5, 10.5, 6), line: true, w: 3.5 },
    { d: 'M15.5 15.5L20 20', line: true, w: 4.5 },
  ],
  close: [{ d: cross, line: true, w: 3.5 }],
  layers: [{ d: 'M3 14l9 5 9-5', line: true, w: 3.5, o: 0.55 }, { d: 'M12 3.5l9 5-9 5-9-5z' }],
  export: [
    { d: 'M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4', line: true, w: 3.5, o: 0.55 },
    { d: 'M12 15V7', line: true, w: 3.5 },
    { d: 'M7 8.5L12 3l5 5.5z' },
  ],
  guide: [
    { d: 'M4 5.5C6.5 4 9.5 4 12 6v14c-2.5-2-5.5-2-8-.5z' },
    { d: 'M20 5.5C17.5 4 14.5 4 12 6v14c2.5-2 5.5-2 8-.5z', o: 0.55 },
  ],
  info: [
    { d: circle(12, 12, 9), w: 0, o: 0.45 },
    { d: 'M12 11v5.5', line: true, w: 3.5 },
    { d: circle(12, 7.5, 1.8), w: 0 },
  ],
  // Lara chat and settings (L2).
  send: [
    { d: 'M3.5 11L20.5 3.5 14 20.5l-3-6.5z' },
    { d: 'M11 14l9.5-10.5', line: true, w: 2.5, o: 0.5 },
  ],
  stop: [{ d: 'M7 7h10v10H7z', w: 3 }],
  settings: [
    {
      d: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M5.6 18.4l2.2-2.2M16.2 7.8l2.2-2.2',
      line: true,
      w: 3.5,
    },
    {
      d: 'M5.5 12a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0zM9.5 12a2.5 2.5 0 1 1 5 0a2.5 2.5 0 1 1-5 0z',
    },
  ],
  expand: [{ d: 'M5 15l7-7 7 7', line: true, w: 4 }],
  collapse: [{ d: 'M5 9l7 7 7-7', line: true, w: 4 }],
  eye: [
    { d: 'M2.5 12C5 7 8.5 5 12 5s7 2 9.5 7c-2.5 5-6 7-9.5 7s-7-2-9.5-7z', o: 0.45 },
    { d: circle(12, 12, 3.2), w: 0 },
  ],
  eyeOff: [
    { d: 'M2.5 12C5 7 8.5 5 12 5s7 2 9.5 7c-2.5 5-6 7-9.5 7s-7-2-9.5-7z', o: 0.45 },
    { d: 'M4.5 4.5l15 15', line: true, w: 3.5 },
  ],
  coin: [
    { d: circle(12, 12, 8.5), o: 0.45 },
    { d: 'M12 7.5v9M9.5 9.5h4M10.5 14.5h4', line: true, w: 2.5 },
  ],
  key: [
    { d: circle(8, 12, 4.5), o: 0.45 },
    { d: 'M12.5 12H21M18 12v3.5M21 12v3', line: true, w: 3 },
  ],
  retry: [{ d: 'M19 12a7 7 0 11-2.05-4.95', line: true, w: 3.5 }, { d: 'M20.5 3.5v6.5H14z' }],
} as const satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof ICONS;

@Component({
  selector: 'lc-icon',
  template: `<svg
    viewBox="0 0 24 24"
    width="24"
    height="24"
    aria-hidden="true"
    focusable="false"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    @for (s of shapes(); track $index) {
      <path
        [attr.d]="s.d"
        [attr.fill]="s.fill ? 'currentColor' : 'none'"
        [attr.stroke]="s.w ? 'currentColor' : 'none'"
        [attr.stroke-width]="s.w"
        [attr.opacity]="s.o"
      />
    }
  </svg>`,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
    svg {
      width: var(--lc-icon, 1.5rem);
      height: var(--lc-icon, 1.5rem);
      overflow: visible;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Icon {
  readonly name = input.required<IconName>();
  /** Fills outline-only shapes (e.g. a favourite star). */
  readonly filled = input(false);

  protected readonly shapes = computed(() => {
    const filled = this.filled();
    return (ICONS[this.name()] as readonly Shape[]).map((s) => ({
      d: s.d,
      fill: s.line ? false : s.toggle ? filled : true,
      w: s.w ?? 2,
      o: s.o ?? null,
    }));
  });
}
