import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Lara's moods (see docs/DESIGN.md). */
export type LaraMood = 'happy' | 'wave' | 'cheer' | 'think' | 'sleep';

/** All moods, e.g. for previews and tests. */
export const LARA_MOODS: readonly LaraMood[] = ['happy', 'wave', 'cheer', 'think', 'sleep'];

type ArmPose = 'down' | 'up' | 'wave' | 'chin';

interface Pose {
  readonly left: ArmPose;
  readonly right: ArmPose;
  readonly eyes: 'open' | 'joy' | 'closed';
}

const POSES: Record<LaraMood, Pose> = {
  happy: { left: 'down', right: 'down', eyes: 'open' },
  wave: { left: 'down', right: 'wave', eyes: 'open' },
  cheer: { left: 'up', right: 'up', eyes: 'joy' },
  think: { left: 'down', right: 'chin', eyes: 'open' },
  sleep: { left: 'down', right: 'down', eyes: 'closed' },
};

/** Arm geometry (shoulder → hand) in the 100×100 view box; the left side is mirrored. */
const ARMS: Record<
  ArmPose,
  { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }
> = {
  down: { x1: 74, y1: 66, x2: 84, y2: 77 },
  up: { x1: 74, y1: 60, x2: 87, y2: 40 },
  wave: { x1: 74, y1: 60, x2: 88, y2: 40 },
  chin: { x1: 77, y1: 76, x2: 62, y2: 81 },
};

let nextId = 0;

/**
 * Lara, laracraft's comic mascot: a friendly, rounded purple block with a little hard hat
 * (she is the app's builder assistant). Flat fills, thick ink outline, one highlight stripe.
 *
 * Contract (lead-owned): selector `lc-lara`, inputs `mood` and `size` (CSS length),
 * decorative by default (`aria-hidden`); pass `label` to make it an image with alt text.
 *
 * Fixed illustration colours (eye white, highlight) are local custom properties so Lara
 * looks the same in both themes; everything else uses the global tokens.
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
      --lara-eye: #fff;
      --lara-shine: rgb(255 255 255 / 0.45);
      display: inline-block;
      flex: none;
      width: var(--lara-size, 6rem);
      height: var(--lara-size, 6rem);
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .fig {
      animation: lara-bob 2.6s ease-in-out infinite alternate;
    }
    :host([data-mood='sleep']) .fig {
      animation-duration: 4s;
    }
    .eyes {
      transform-box: fill-box;
      transform-origin: center;
      animation: lara-blink 4.5s infinite;
    }
    .wave {
      transform-box: view-box;
      transform-origin: 74px 60px;
      animation: lara-wave 0.9s ease-in-out infinite alternate;
    }
    .zz {
      animation: lara-float 2s ease-in-out infinite alternate;
    }
    @keyframes lara-bob {
      to {
        transform: translateY(-2px);
      }
    }
    @keyframes lara-blink {
      0%,
      92%,
      100% {
        transform: scaleY(1);
      }
      95% {
        transform: scaleY(0.1);
      }
    }
    @keyframes lara-wave {
      from {
        transform: rotate(-10deg);
      }
      to {
        transform: rotate(14deg);
      }
    }
    @keyframes lara-float {
      to {
        transform: translateY(-3px);
        opacity: 0.6;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .fig,
      .eyes,
      .wave,
      .zz {
        animation: none;
      }
    }
  `,
  template: `
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <defs>
        <clipPath [id]="clipId"><rect x="22" y="32" width="56" height="58" rx="14" /></clipPath>
      </defs>
      <ellipse cx="50" cy="97.5" rx="24" ry="2.5" fill="var(--lc-ink)" opacity="0.3" />
      <g class="fig" stroke="var(--lc-ink)" stroke-linecap="round" stroke-linejoin="round">
        <!-- feet -->
        <rect
          x="31"
          y="85"
          width="14"
          height="11"
          rx="5"
          fill="var(--lc-purple-shade)"
          stroke-width="3"
        />
        <rect
          x="55"
          y="85"
          width="14"
          height="11"
          rx="5"
          fill="var(--lc-purple-shade)"
          stroke-width="3"
        />

        <!-- arms behind the body -->
        @for (a of backArms(); track a.side) {
          <g [attr.transform]="a.side === 'left' ? 'translate(100 0) scale(-1 1)' : null">
            <g [class.wave]="a.pose === 'wave'">
              <line
                [attr.x1]="a.x1"
                [attr.y1]="a.y1"
                [attr.x2]="a.x2"
                [attr.y2]="a.y2"
                stroke-width="12"
              />
              <line
                [attr.x1]="a.x1"
                [attr.y1]="a.y1"
                [attr.x2]="a.x2"
                [attr.y2]="a.y2"
                stroke="var(--lc-purple)"
                stroke-width="6"
              />
              <circle
                [attr.cx]="a.x2"
                [attr.cy]="a.y2"
                r="6"
                fill="var(--lc-purple)"
                stroke-width="3"
              />
            </g>
          </g>
        }

        <!-- body: rounded block with a darker base, one highlight stripe -->
        <rect x="22" y="32" width="56" height="58" rx="14" fill="var(--lc-purple)" stroke="none" />
        <rect
          [attr.clip-path]="'url(#' + clipId + ')'"
          x="20"
          y="79"
          width="60"
          height="14"
          fill="var(--lc-purple-shade)"
          stroke="none"
        />
        <rect x="22" y="32" width="56" height="58" rx="14" fill="none" stroke-width="3" />
        <path d="M29 47 V62" stroke="var(--lara-shine)" stroke-width="4" />
        <circle cx="29" cy="69" r="2" fill="var(--lara-shine)" stroke="none" />

        <!-- cheeks -->
        <ellipse
          cx="31.5"
          cy="67"
          rx="4"
          ry="2.4"
          fill="var(--lc-red)"
          opacity="0.55"
          stroke="none"
        />
        <ellipse
          cx="68.5"
          cy="67"
          rx="4"
          ry="2.4"
          fill="var(--lc-red)"
          opacity="0.55"
          stroke="none"
        />

        <!-- eyes -->
        @switch (pose().eyes) {
          @case ('open') {
            <g class="eyes">
              <ellipse cx="40" cy="56" rx="7" ry="8.5" fill="var(--lara-eye)" stroke-width="2.5" />
              <ellipse cx="60" cy="56" rx="7" ry="8.5" fill="var(--lara-eye)" stroke-width="2.5" />
              <g [attr.transform]="mood() === 'think' ? 'translate(2 -3)' : null" stroke="none">
                <circle cx="41" cy="57" r="4" fill="var(--lc-ink)" />
                <circle cx="61" cy="57" r="4" fill="var(--lc-ink)" />
                <circle cx="42.6" cy="55.3" r="1.4" fill="var(--lara-eye)" />
                <circle cx="62.6" cy="55.3" r="1.4" fill="var(--lara-eye)" />
              </g>
            </g>
          }
          @case ('joy') {
            <path d="M34 58 Q40 49 46 58 M54 58 Q60 49 66 58" fill="none" stroke-width="3.5" />
          }
          @case ('closed') {
            <path d="M34 56 Q40 61 46 56 M54 56 Q60 61 66 56" fill="none" stroke-width="3" />
          }
        }

        <!-- brows and mouth -->
        @switch (mood()) {
          @case ('think') {
            <path d="M54 43 Q60 40 66 43" fill="none" stroke-width="2.5" />
            <path d="M45 72 Q50 70 56 71" fill="none" stroke-width="3" />
          }
          @case ('sleep') {
            <ellipse cx="50" cy="72" rx="3" ry="2.5" fill="var(--lc-ink)" stroke="none" />
          }
          @case ('cheer') {
            <path d="M40 66 Q50 82 60 66 Z" fill="var(--lc-ink)" stroke-width="2.5" />
            <path
              d="M45 73.5 Q50 70.5 55 73.5 Q50 77 45 73.5 Z"
              fill="var(--lc-red)"
              stroke="none"
            />
          }
          @default {
            <path d="M42 67 Q50 77 58 67 Z" fill="var(--lc-ink)" stroke-width="2.5" />
            <path d="M46 72 Q50 70 54 72 Q50 74.5 46 72 Z" fill="var(--lc-red)" stroke="none" />
          }
        }

        <!-- hand at the chin goes in front of the body -->
        @if (pose().right === 'chin') {
          <line x1="77" y1="76" x2="62" y2="81" stroke-width="12" />
          <line x1="77" y1="76" x2="62" y2="81" stroke="var(--lc-purple)" stroke-width="6" />
          <circle cx="62" cy="81" r="6" fill="var(--lc-purple)" stroke-width="3" />
        }

        <!-- builder's hard hat -->
        <g [attr.transform]="mood() === 'sleep' ? 'rotate(-8 50 30)' : null">
          <path d="M31 34 Q31 17 50 17 Q69 17 69 34 Z" fill="var(--lc-yellow)" stroke-width="3" />
          <path
            d="M50 18 V33"
            stroke="var(--lc-yellow-shade)"
            stroke-width="4"
            stroke-linecap="butt"
          />
          <path
            d="M37 27 Q38 22 42 20.5"
            fill="none"
            stroke="var(--lara-shine)"
            stroke-width="2.5"
          />
          <rect
            x="25"
            y="31"
            width="50"
            height="6"
            rx="3"
            fill="var(--lc-yellow-shade)"
            stroke-width="3"
          />
        </g>

        <!-- extras -->
        @switch (mood()) {
          @case ('cheer') {
            <path
              d="M14 14 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z M86 10 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z"
              fill="var(--lc-yellow)"
              stroke-width="2"
            />
          }
          @case ('think') {
            <circle cx="80" cy="30" r="2.5" fill="var(--lara-eye)" stroke-width="2" />
            <circle cx="86" cy="21" r="4" fill="var(--lara-eye)" stroke-width="2" />
            <circle cx="91" cy="9" r="6" fill="var(--lara-eye)" stroke-width="2.5" />
          }
          @case ('sleep') {
            <path
              class="zz"
              stroke="var(--lc-blue)"
              d="M76 14 h9 l-9 10 h9 M88 2 h6 l-6 7 h6"
              fill="none"
              stroke-width="2.5"
            />
          }
        }
      </g>
    </svg>
  `,
})
export class Lara {
  readonly mood = input<LaraMood>('happy');
  readonly size = input<string>('6rem');
  readonly label = input<string | null>(null);

  protected readonly clipId = `lc-lara-clip-${nextId++}`;
  protected readonly pose = computed(() => POSES[this.mood()] ?? POSES.happy);
  /** Arms drawn behind the body (a hand at the chin is drawn in front). */
  protected readonly backArms = computed(() => {
    const { left, right } = this.pose();
    return (
      [
        { side: 'left', pose: left },
        { side: 'right', pose: right },
      ] as const
    )
      .filter((a) => a.pose !== 'chin')
      .map((a) => ({ ...a, ...ARMS[a.pose] }));
  });
}
