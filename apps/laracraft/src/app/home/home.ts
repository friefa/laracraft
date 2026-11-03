import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** Placeholder start page; the viewer/editor plug in here in M1. */
@Component({
  selector: 'lc-home',
  imports: [TranslocoPipe],
  template: `
    <h1>{{ 'home.title' | transloco }}</h1>
    <p class="tagline">{{ 'home.tagline' | transloco }}</p>
  `,
  styles: `
    .tagline {
      font-size: 1.125rem;
      color: var(--lc-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {}
