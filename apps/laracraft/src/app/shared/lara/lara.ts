import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Lara's moods (see docs/DESIGN.md). */
export type LaraMood = 'happy' | 'wave' | 'cheer' | 'think' | 'sleep';

/** All moods, e.g. for previews and tests. */
export const LARA_MOODS: readonly LaraMood[] = ['happy', 'wave', 'cheer', 'think', 'sleep'];

/** An arm from shoulder (x1, y1) to hand (x2, y2) in the 100×100 view box. */
interface Arm {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  /** Drawn in front of the torso (hand at the chin) instead of behind it. */
  readonly front?: boolean;
  /** Animated waving arm. */
  readonly waving?: boolean;
}

/** Arm poses per mood (left arm first), taken from the approved design document. */
const ARMS: Record<LaraMood, readonly [Arm, Arm]> = {
  happy: [
    { x1: 38, y1: 72, x2: 31, y2: 83 },
    { x1: 62, y1: 72, x2: 69, y2: 83 },
  ],
  wave: [
    { x1: 38, y1: 72, x2: 31, y2: 83 },
    { x1: 62, y1: 70, x2: 78, y2: 54, waving: true },
  ],
  cheer: [
    { x1: 38, y1: 70, x2: 24, y2: 56 },
    { x1: 62, y1: 70, x2: 76, y2: 56 },
  ],
  think: [
    { x1: 38, y1: 72, x2: 31, y2: 83 },
    { x1: 62, y1: 72, x2: 56, y2: 64, front: true },
  ],
  sleep: [
    { x1: 38, y1: 72, x2: 33, y2: 84 },
    { x1: 62, y1: 72, x2: 67, y2: 84 },
  ],
};

/** Paint order of the arm layers and the torso between them. */
type Layer =
  | { readonly kind: 'torso' }
  | ({ readonly kind: 'arm'; readonly id: string; readonly mx: number; readonly my: number } & Arm);

/**
 * Lara, laracraft's comic mascot (v2, approved by the PO in docs/design/index.html): a chibi
 * girl with an orange-red ponytail and purple hair tie, fringe and lashes, wearing purple
 * dungarees over a cream shirt. Flat fills, thick ink outline, one highlight stripe.
 *
 * Contract (lead-owned): selector `lc-lara`, inputs `mood` and `size` (CSS length),
 * decorative by default (`aria-hidden`); pass `label` to make it an image with alt text.
 *
 * Illustration colours (skin, hair, shirt, eye white, highlight) are local custom properties
 * so Lara looks the same in both themes; everything else uses the global tokens.
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
      --lara-hair: #f07a3c;
      --lara-skin: #ffd5b8;
      --lara-shirt: #fff7e6;
      --lara-hair-shade: #c25520;
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
      transform-origin: 62px 70px;
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
      <ellipse cx="50" cy="97.5" rx="20" ry="2.4" fill="var(--lc-ink)" opacity="0.3" />
      <g class="fig" stroke="var(--lc-ink)" stroke-linecap="round" stroke-linejoin="round">
        <!-- ponytail, behind everything -->
        <path
          class="ponytail"
          d="M66 26 C84 18 95 32 90 50 C88 58 81 61 78 56 C85 49 84 36 70 34 Z"
          fill="var(--lara-hair)"
          stroke-width="3"
        />
        <path
          d="M82 31 C88 37 89 45 86 51"
          fill="none"
          stroke="var(--lara-hair-shade)"
          stroke-width="2.5"
        />

        <!-- arms behind the torso, the torso, then arms in front of it -->
        @for (layer of layers(); track layer.kind === 'arm' ? layer.id : 'torso') {
          @if (layer.kind === 'arm') {
            <g class="arm" [class.wave]="layer.waving">
              <line
                [attr.x1]="layer.x1"
                [attr.y1]="layer.y1"
                [attr.x2]="layer.x2"
                [attr.y2]="layer.y2"
                stroke-width="11"
              />
              <line
                [attr.x1]="layer.x1"
                [attr.y1]="layer.y1"
                [attr.x2]="layer.x2"
                [attr.y2]="layer.y2"
                stroke="var(--lara-skin)"
                stroke-width="5.5"
              />
              <!-- short shirt sleeve -->
              <line
                [attr.x1]="layer.x1"
                [attr.y1]="layer.y1"
                [attr.x2]="layer.mx"
                [attr.y2]="layer.my"
                stroke="var(--lara-shirt)"
                stroke-width="5.5"
              />
              <circle
                [attr.cx]="layer.x2"
                [attr.cy]="layer.y2"
                r="4.6"
                fill="var(--lara-skin)"
                stroke-width="2.5"
              />
            </g>
          } @else {
            <!-- legs and shoes -->
            <rect
              x="40"
              y="86"
              width="8"
              height="9"
              rx="2"
              fill="var(--lc-purple-shade)"
              stroke-width="2.5"
            />
            <rect
              x="52"
              y="86"
              width="8"
              height="9"
              rx="2"
              fill="var(--lc-purple-shade)"
              stroke-width="2.5"
            />
            <path
              d="M38 96 Q38 92.5 44 92.5 Q49 92.5 49 96 Z M51 96 Q51 92.5 56 92.5 Q62 92.5 62 96 Z"
              fill="var(--lc-ink)"
              stroke-width="2"
            />
            <!-- shirt and dungarees (straps, bib, yellow buttons, pocket) -->
            <path
              d="M35 75 Q35 65 50 65 Q65 65 65 75 L65 88 Q65 90 63 90 L37 90 Q35 90 35 88 Z"
              fill="var(--lara-shirt)"
              stroke-width="3"
            />
            <path
              d="M41.5 66.5 L44 73 M58.5 66.5 L56 73"
              stroke="var(--lc-purple)"
              stroke-width="3.2"
            />
            <path
              class="dungarees"
              d="M42 72 L58 72 L59 78 L63.5 78 L63.5 88 Q63.5 89.5 62 89.5 L38 89.5 Q36.5 89.5 36.5 88 L36.5 78 L41 78 Z"
              fill="var(--lc-purple)"
              stroke-width="2.5"
            />
            <g fill="var(--lc-yellow)" stroke="none">
              <circle cx="44.2" cy="74.6" r="1.2" />
              <circle cx="55.8" cy="74.6" r="1.2" />
            </g>
            <path d="M45.5 81 h9 v4.5 h-9 z" fill="var(--lc-purple-shade)" stroke="none" />
          }
        }

        <!-- head (tilted while sleeping) -->
        <g class="head" [attr.transform]="mood() === 'sleep' ? 'rotate(-8 50 42)' : null">
          <path
            d="M25 44 C22 20 40 14 50 14 C62 14 79 20 75 46 C74 54 70 56 68 54 L32 54 C29 56 26 52 25 44 Z"
            fill="var(--lara-hair)"
            stroke-width="3"
          />
          <rect x="45" y="58" width="10" height="8" fill="var(--lara-skin)" stroke-width="2.5" />
          <ellipse cx="50" cy="42" rx="21" ry="20" fill="var(--lara-skin)" stroke-width="3" />
          <ellipse cx="29.5" cy="45" rx="3" ry="4" fill="var(--lara-skin)" stroke-width="2.5" />
          <ellipse cx="70.5" cy="45" rx="3" ry="4" fill="var(--lara-skin)" stroke-width="2.5" />
          <!-- swept fringe with a highlight stripe, purple hair tie -->
          <path
            d="M29 40 C27 26 38 19 51 19 C63 19 73 26 71 40 C67 33 60 29 52 31 C47 36 40 37 35 34 C33 37 31 39 29 40 Z"
            fill="var(--lara-hair)"
            stroke-width="3"
          />
          <path
            d="M40 24 C45 22 50 22 55 23"
            fill="none"
            stroke="var(--lara-shine)"
            stroke-width="2.2"
          />
          <circle
            class="hair-tie"
            cx="68"
            cy="27.5"
            r="3.6"
            fill="var(--lc-purple)"
            stroke-width="2.5"
          />
          <!-- cheeks -->
          <g fill="var(--lc-red)" opacity="0.55" stroke="none">
            <ellipse cx="36.5" cy="50.5" rx="3.6" ry="2.2" />
            <ellipse cx="63.5" cy="50.5" rx="3.6" ry="2.2" />
          </g>

          <!-- eyes -->
          @switch (mood()) {
            @case ('cheer') {
              <g fill="none" stroke-width="2.6">
                <path d="M37.5 45 Q42 39.5 46.5 45 M53.5 45 Q58 39.5 62.5 45" />
                <path d="M37.5 43 L35 41 M62.5 43 L65 41" />
              </g>
            }
            @case ('sleep') {
              <g fill="none" stroke-width="2.6">
                <path d="M37.5 44 Q42 48 46.5 44 M53.5 44 Q58 48 62.5 44" />
                <path d="M38 45.5 L35.5 47 M62 45.5 L64.5 47" />
              </g>
            }
            @default {
              <g class="eyes">
                <ellipse
                  cx="42"
                  cy="44"
                  rx="5"
                  ry="6.2"
                  fill="var(--lara-eye)"
                  stroke-width="2.2"
                />
                <ellipse
                  cx="58"
                  cy="44"
                  rx="5"
                  ry="6.2"
                  fill="var(--lara-eye)"
                  stroke-width="2.2"
                />
                <g
                  stroke="none"
                  [attr.transform]="
                    mood() === 'think' ? 'translate(1.6 -2.2)' : 'translate(0.6 0.4)'
                  "
                >
                  <circle cx="42" cy="44.5" r="3.1" fill="var(--lc-ink)" />
                  <circle cx="58" cy="44.5" r="3.1" fill="var(--lc-ink)" />
                  <circle cx="43.2" cy="43.2" r="1.1" fill="var(--lara-eye)" />
                  <circle cx="59.2" cy="43.2" r="1.1" fill="var(--lara-eye)" />
                </g>
              </g>
              <!-- lashes -->
              <path
                d="M37.3 40.5 L34.5 38.6 M38.6 38.6 L37 36.2 M62.7 40.5 L65.5 38.6 M61.4 38.6 L63 36.2"
                fill="none"
                stroke-width="2"
              />
            }
          }

          <!-- nose -->
          <path d="M49 49 Q50 50.5 51 49" fill="none" stroke-width="1.8" />

          <!-- brow and mouth -->
          @switch (mood()) {
            @case ('cheer') {
              <path d="M43 52 Q50 62 57 52 Z" fill="var(--lc-ink)" stroke-width="2.2" />
              <path
                d="M46.2 56.8 Q50 54.8 53.8 56.8 Q50 59.3 46.2 56.8 Z"
                fill="var(--lc-red)"
                stroke="none"
              />
            }
            @case ('think') {
              <path d="M53 36.5 Q57.5 33.5 62 35.5" fill="none" stroke-width="2.2" />
              <path d="M46 55 Q49 53.8 54 55.2" fill="none" stroke-width="2.4" />
            }
            @case ('sleep') {
              <ellipse cx="50" cy="55" rx="1.8" ry="2.2" fill="var(--lc-ink)" stroke="none" />
            }
            @default {
              <path d="M44.5 53 Q50 59.5 55.5 53 Z" fill="var(--lc-ink)" stroke-width="2.2" />
              <path
                d="M47 56.3 Q50 54.8 53 56.3 Q50 58 47 56.3 Z"
                fill="var(--lc-red)"
                stroke="none"
              />
            }
          }
        </g>

        <!-- extras -->
        @switch (mood()) {
          @case ('cheer') {
            <path
              class="sparkles"
              d="M16 34 l2 -5 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 z M83 25 l1.5 -3.5 l1.5 3.5 l3.5 1.5 l-3.5 1.5 l-1.5 3.5 l-1.5 -3.5 l-3.5 -1.5 z"
              fill="var(--lc-yellow)"
              stroke-width="1.5"
            />
          }
          @case ('think') {
            <g class="bubbles" fill="var(--lara-eye)" stroke-width="2">
              <circle cx="79" cy="14" r="2.3" />
              <circle cx="85" cy="8" r="3.4" />
            </g>
          }
          @case ('sleep') {
            <path
              class="zz"
              d="M76 16 h7 l-7 8 h7 M86 5 h5 l-5 6 h5"
              fill="none"
              stroke="var(--lc-blue)"
              stroke-width="2.6"
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

  /** Arms (with the sleeve end half-way down) and the torso, in paint order. */
  protected readonly layers = computed<readonly Layer[]>(() => {
    const arms = (ARMS[this.mood()] ?? ARMS.happy).map((arm, i) => ({
      ...arm,
      kind: 'arm' as const,
      id: i === 0 ? 'left' : 'right',
      mx: (arm.x1 + arm.x2) / 2,
      my: (arm.y1 + arm.y2) / 2,
    }));
    return [
      ...arms.filter((a) => !a.front),
      { kind: 'torso' as const },
      ...arms.filter((a) => a.front),
    ];
  });
}
