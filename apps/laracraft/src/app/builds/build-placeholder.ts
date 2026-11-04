import { ChangeDetectionStrategy, Component, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { BuildStore } from '../storage/build-store';
import { buildStoreErrorCode } from '../storage/build-store.types';

/**
 * Temporary `build/:id` page so the list flow is testable end to end.
 * Replaced by the editor page (M1).
 */
@Component({
  selector: 'lc-build-placeholder',
  imports: [RouterLink, TranslocoPipe],
  template: `
    @if (build.error()) {
      <p role="alert">
        {{
          (errorCode() === 'not-found' ? 'storage.errors.notFound' : 'storage.errors.unknown')
            | transloco
        }}
      </p>
    } @else if (build.hasValue()) {
      <h1>{{ build.value().metadata.name }}</h1>
      <p>{{ 'build.blocks' | transloco: { count: build.value().volume.blockCount } }}</p>
      <p class="hint">{{ 'build.placeholder' | transloco }}</p>
    } @else {
      <p role="status">{{ 'build.loading' | transloco }}</p>
    }
    <p>
      <a routerLink="/">{{ 'build.back' | transloco }}</a>
    </p>
  `,
  styles: `
    .hint {
      color: var(--lc-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BuildPlaceholderPage {
  private readonly store = inject(BuildStore);

  /** Route parameter (component input binding). */
  readonly id = input.required<string>();

  protected readonly build = resource({
    params: () => this.id(),
    loader: ({ params }) => this.store.load(params),
  });

  protected errorCode() {
    return buildStoreErrorCode(this.build.error());
  }
}
