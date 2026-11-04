import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Lara's moods (see docs/DESIGN.md). */
export type LaraMood = 'happy' | 'wave' | 'cheer' | 'think' | 'sleep';

/**
 * Lara, laracraft's comic mascot (a friendly block character, purple accent).
 * Contract (lead-owned): selector `lc-lara`, inputs `mood` and `size` (CSS length),
 * decorative by default (`aria-hidden`); pass `label` to make it an image with alt text.
 *
 * STUB: placeholder drawing; the real illustration is implemented in package P3.1.
 */
@Component({
  selector: 'lc-lara',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--lara-size]': 'size()',
    '[attr.role]': "label() ? 'img' : null",
    '[attr.aria-label]': 'label()',
    '[attr.aria-hidden]': 'label() ? null : "true"',
    '[attr.data-mood]': 'mood()',
  },
  styles: `
    :host {
      display: inline-block;
      width: var(--lara-size, 6rem);
      height: var(--lara-size, 6rem);
    }
    svg {
      width: 100%;
      height: 100%;
    }
  `,
  template: `
    <svg viewBox="0 0 100 100">
      <rect
        x="15"
        y="15"
        width="70"
        height="70"
        rx="14"
        fill="var(--lc-purple)"
        stroke="var(--lc-ink)"
        stroke-width="4"
      />
      <circle cx="38" cy="45" r="6" fill="var(--lc-ink)" />
      <circle cx="62" cy="45" r="6" fill="var(--lc-ink)" />
      <path
        d="M36 64 Q50 74 64 64"
        fill="none"
        stroke="var(--lc-ink)"
        stroke-width="4"
        stroke-linecap="round"
      />
    </svg>
  `,
})
export class Lara {
  readonly mood = input<LaraMood>('happy');
  readonly size = input<string>('6rem');
  readonly label = input<string | null>(null);
}
