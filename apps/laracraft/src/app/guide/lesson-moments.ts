import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Lara } from '../shared/lara/lara';

/** How long the "step complete" banner stays (ms) before it dismisses itself. */
export const SUCCESS_BANNER_MS = 1800;

/**
 * Short success moment after moving past a step. Never blocks navigation: it floats over
 * the 3D view, dismisses itself and can be tapped away.
 */
@Component({
  selector: 'lc-guide-success',
  imports: [TranslocoPipe, Lara],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      pointer-events: none;
    }
    .banner {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: min(100%, 22rem);
      margin: 0 auto;
      padding: 0.5rem 1.25rem 0.5rem 0.625rem;
      border: var(--lc-border-w) solid var(--lc-green-shade);
      border-radius: calc(var(--lc-radius) * 1.25);
      background: var(--lc-green);
      box-shadow: 0 var(--lc-depth) 0 var(--lc-green-shade);
      color: var(--lc-on-color);
      text-align: left;
      cursor: pointer;
      pointer-events: auto;
    }
    strong {
      display: block;
      font-size: var(--lc-fs-lg);
      font-weight: var(--lc-fw-black);
      line-height: 1.15;
    }
    small {
      font-size: var(--lc-fs-sm);
      font-weight: var(--lc-fw-bold);
    }
  `,
  template: `
    <div role="status">
      <button type="button" class="banner lc-pop" (click)="dismiss.emit()">
        <lc-lara mood="cheer" size="3.25rem" />
        <span>
          <strong>{{ 'guide.success.title' | transloco }}</strong>
          <small>{{
            'guide.success.progress' | transloco: { done: done(), total: total() }
          }}</small>
        </span>
      </button>
    </div>
  `,
})
export class GuideSuccess {
  /** Number of completed steps. */
  readonly done = input.required<number>();
  readonly total = input.required<number>();
  readonly dismiss = output<void>();
}

/** Finish screen after the last step: total stats and the way back to the editor. */
@Component({
  selector: 'lc-guide-finish',
  imports: [RouterLink, TranslocoPipe, Lara],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: grid;
      place-items: center;
      overflow: auto;
      padding: 1.5rem 1rem calc(env(safe-area-inset-bottom) + 1.5rem);
      background: var(--lc-bg);
    }
    .finish {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: min(100%, 26rem);
      text-align: center;
    }
    h2 {
      margin: 1rem 0 0.25rem;
      color: var(--lc-green);
      font-size: var(--lc-fs-xl);
    }
    p {
      margin: 0;
      color: var(--lc-muted);
      font-weight: var(--lc-fw-bold);
    }
    dl {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
      width: 100%;
      margin: 1.5rem 0;
    }
    .stat {
      margin: 0;
      padding: 0.75rem;
      border: var(--lc-border-w) solid var(--lc-yellow-shade);
      border-radius: var(--lc-radius);
      box-shadow: 0 var(--lc-depth) 0 var(--lc-yellow-shade);
    }
    dt {
      color: var(--lc-yellow);
      font-size: var(--lc-fs-xs);
      font-weight: var(--lc-fw-black);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    dd {
      margin: 0;
      color: var(--lc-text-strong);
      font-size: var(--lc-fs-xl);
      font-weight: var(--lc-fw-black);
    }
  `,
  template: `
    <section class="finish" aria-labelledby="guide-finish-title">
      <lc-lara class="lc-pop" mood="cheer" size="7rem" />
      <h2 id="guide-finish-title" tabindex="-1">{{ 'guide.finish.title' | transloco }}</h2>
      <p>{{ 'guide.finish.text' | transloco: { name: name() } }}</p>
      <dl>
        <div class="stat">
          <dt>{{ 'guide.finish.blocks' | transloco }}</dt>
          <dd>{{ blocks() }}</dd>
        </div>
        <div class="stat">
          <dt>{{ 'guide.finish.steps' | transloco }}</dt>
          <dd>{{ steps() }}</dd>
        </div>
      </dl>
      <a
        class="lc-btn lc-btn--primary lc-btn--lg lc-btn--block"
        [routerLink]="['/build', buildId()]"
      >
        {{ 'guide.finish.toEditor' | transloco }}
      </a>
      <button type="button" class="lc-btn lc-btn--ghost lc-btn--block" (click)="review.emit()">
        {{ 'guide.finish.review' | transloco }}
      </button>
    </section>
  `,
})
export class GuideFinish {
  readonly buildId = input.required<string>();
  readonly name = input.required<string>();
  readonly blocks = input.required<number>();
  readonly steps = input.required<number>();
  /** "Look at the steps again": closes the finish screen. */
  readonly review = output<void>();
}
