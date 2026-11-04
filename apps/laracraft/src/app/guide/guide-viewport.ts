import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  InjectionToken,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { createJavaBlockRegistry, type BuildDocument } from '@laracraft/core-model';
import type { BuildRenderer, CreateBuildRendererFn } from '@laracraft/renderer';
import type { StepVisuals } from './step-visuals';

/** Lazy-loads the renderer factory (three.js stays out of the initial bundle). */
export async function loadRendererFactory(): Promise<CreateBuildRendererFn | undefined> {
  const mod = (await import('@laracraft/renderer')) as {
    createBuildRenderer?: CreateBuildRendererFn;
  };
  return typeof mod.createBuildRenderer === 'function' ? mod.createBuildRenderer : undefined;
}

export const RENDERER_FACTORY_LOADER = new InjectionToken<
  () => Promise<CreateBuildRendererFn | undefined>
>('RENDERER_FACTORY_LOADER', { providedIn: 'root', factory: () => loadRendererFactory });

function createMesherWorker(): Worker {
  return new Worker(
    new URL('../../../../../libs/renderer/src/lib/mesh/mesher.worker', import.meta.url),
    { type: 'module' },
  );
}

type ViewportStatus = 'loading' | 'ready' | 'unavailable';

/** 3D view of the step document with the guide's highlights, ghosts and layer limit. */
@Component({
  selector: 'lc-guide-viewport',
  imports: [TranslocoPipe],
  template: `
    <canvas #canvas [attr.aria-label]="'guide.view.canvasLabel' | transloco"></canvas>
    @if (status() !== 'ready') {
      <p class="status" role="status">
        {{ (status() === 'loading' ? 'guide.view.loading' : 'guide.view.unavailable') | transloco }}
      </p>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      min-height: 12rem;
      background: var(--lc-surface);
      border: 1px solid var(--lc-border);
      border-radius: var(--lc-radius);
      overflow: hidden;
      touch-action: none;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    .status {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      margin: 0;
      padding: var(--lc-space);
      color: var(--lc-muted);
      text-align: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideViewport {
  private readonly loadFactory = inject(RENDERER_FACTORY_LOADER);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  /** The step document; mutated in place, `version` signals each change. */
  readonly doc = input<BuildDocument>();
  readonly version = input(0);
  readonly visuals = input<StepVisuals>();

  protected readonly status = signal<ViewportStatus>('loading');
  private readonly renderer = signal<BuildRenderer | undefined>(undefined);
  private shownDoc: BuildDocument | undefined;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.renderer()?.dispose();
    });
    afterNextRender(() => void this.init());

    effect(() => {
      const r = this.renderer();
      const doc = this.doc();
      this.version();
      if (!r || !doc) return;
      if (doc !== this.shownDoc) {
        r.setDocument(doc);
        this.shownDoc = doc;
        r.frame();
      }
      r.update();
    });
    effect(() => {
      const r = this.renderer();
      const v = this.visuals();
      if (!r || !v) return;
      r.setHighlights(v.highlights);
      r.setGhosts(v.ghosts);
      r.setLayerLimit(v.layerLimit);
    });
  }

  private async init(): Promise<void> {
    try {
      const create = await this.loadFactory();
      if (!create || this.destroyed) {
        this.status.set('unavailable');
        return;
      }
      const renderer = await create({
        canvas: this.canvas().nativeElement,
        registry: createJavaBlockRegistry(),
        atlasUrl: 'assets/textures/atlas.json',
        createWorker: typeof Worker === 'undefined' ? undefined : createMesherWorker,
      });
      if (this.destroyed) {
        renderer.dispose();
        return;
      }
      this.renderer.set(renderer);
      this.status.set('ready');
    } catch (err) {
      console.error('3D view unavailable', err);
      if (!this.destroyed) this.status.set('unavailable');
    }
  }
}
