import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { parseMarkdownLite } from './markdown-lite';

/** Renders Lara's Markdown-lite text with interpolation only (no innerHTML). */
@Component({
  selector: 'lc-lara-markdown',
  imports: [NgTemplateOutlet],
  template: `
    <ng-template #inline let-line>
      @for (piece of line; track $index) {
        @if (piece.bold) {
          <strong>{{ piece.text }}</strong>
        } @else {
          {{ piece.text }}
        }
      }
    </ng-template>
    @for (block of blocks(); track $index) {
      @switch (block.kind) {
        @case ('p') {
          <p>
            @for (line of block.lines; track $index) {
              @if (!$first) {
                <br />
              }
              <ng-container *ngTemplateOutlet="inline; context: { $implicit: line }" />
            }
          </p>
        }
        @case ('ul') {
          <ul>
            @for (item of block.items; track $index) {
              <li><ng-container *ngTemplateOutlet="inline; context: { $implicit: item }" /></li>
            }
          </ul>
        }
        @case ('ol') {
          <ol>
            @for (item of block.items; track $index) {
              <li><ng-container *ngTemplateOutlet="inline; context: { $implicit: item }" /></li>
            }
          </ol>
        }
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    p,
    ul,
    ol {
      margin: 0 0 0.5rem;
    }
    :is(p, ul, ol):last-child {
      margin-bottom: 0;
    }
    ul,
    ol {
      padding-left: 1.25rem;
    }
    strong {
      font-weight: var(--lc-fw-black);
      color: var(--lc-text-strong);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LaraMarkdown {
  readonly text = input.required<string>();
  protected readonly blocks = computed(() => parseMarkdownLite(this.text()));
}
