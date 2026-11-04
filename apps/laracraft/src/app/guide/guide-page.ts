import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AIR, type BlockStateString, type Vec3 } from '@laracraft/core-model';
import type { ViewInsets } from '@laracraft/renderer';
import { BuildStore } from '../storage/build-store';
import { buildStoreErrorCode } from '../storage/build-store.types';
import { GuideIcon } from './guide-icon';
import { GuideViewport } from './guide-viewport';
import { PHASE_TONE, lessonProgress } from './lesson-style';
import { GuideFinish, GuideSuccess, SUCCESS_BANNER_MS } from './lesson-moments';
import { GuideOverview } from './overview-panel';
import { PlanError, PlanService, type PlanProgress } from './plan.service';
import { StepDocument } from './step-document';
import { type SheetSnap, nextSnap, sheetHeights, snapAfterDrag } from './sheet';
import { GuideStepPanel } from './step-panel';
import { stepVisuals } from './step-visuals';

/** Minimum horizontal travel (px) of a touch swipe that changes the step. */
const SWIPE_MIN = 50;
/** Vertical travel (px) after which a press on the sheet handle becomes a drag. */
const DRAG_SLOP = 6;
/** Must match the phone breakpoint in `guide-page.scss`. */
const SHEET_MEDIA = '(max-width: 899.98px)';

interface SheetDrag {
  readonly pointerId: number;
  readonly startY: number;
  readonly startHeight: number;
  lastY: number;
  lastT: number;
  velocity: number;
  moved: boolean;
}

const STORAGE_ERROR_KEYS: Record<string, string> = {
  'not-found': 'storage.errors.notFound',
  unavailable: 'storage.errors.unavailable',
};

/**
 * Instruction mode (`build/:id/guide`): the build as a survival-safe step-by-step guide,
 * presented as a lesson (progress bar, big "continue" button, success moments, finish screen).
 */
@Component({
  selector: 'lc-guide-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    GuideIcon,
    GuideViewport,
    GuideStepPanel,
    GuideOverview,
    GuideSuccess,
    GuideFinish,
  ],
  templateUrl: './guide-page.html',
  styleUrl: './guide-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
})
export class GuidePage {
  private readonly store = inject(BuildStore);
  private readonly planner = inject(PlanService);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);

  /** Route parameter (component input binding). */
  readonly id = input.required<string>();

  protected readonly build = resource({
    params: () => this.id(),
    loader: ({ params }) => this.store.load(params),
  });
  private readonly doc = computed(() => (this.build.hasValue() ? this.build.value() : undefined));
  protected readonly isEmpty = computed(() => this.doc()?.volume.blockCount === 0);

  protected readonly progress = signal<PlanProgress | null>(null);
  protected readonly percent = computed(() => {
    const p = this.progress();
    return p && p.total > 0 ? Math.round((100 * p.done) / p.total) : 0;
  });
  protected readonly planRes = resource({
    params: () => {
      const doc = this.doc();
      return doc && doc.volume.blockCount > 0 ? { id: this.id(), doc } : undefined;
    },
    loader: ({ params }) => {
      this.progress.set(null);
      return this.planner.plan(params.id, params.doc, (p) => this.progress.set(p));
    },
  });
  protected readonly plan = computed(() =>
    this.planRes.hasValue() ? this.planRes.value() : undefined,
  );

  protected readonly stepper = computed(() => {
    const plan = this.plan();
    const doc = this.doc();
    return plan && doc ? new StepDocument(plan, doc.metadata) : undefined;
  });
  protected readonly total = computed(() => this.plan()?.steps.length ?? 0);
  protected readonly index = linkedSignal({ source: this.stepper, computation: () => 0 });
  protected readonly step = computed(() => this.plan()?.steps[this.index()]);
  protected readonly isLast = computed(() => this.index() >= this.total() - 1);
  protected readonly phaseTone = computed(() => PHASE_TONE[this.step()?.phase ?? 'structure']);

  /** Success banner after moving past a step (`done` = completed steps). */
  protected readonly celebration = signal<{ readonly done: number } | null>(null);
  /** Finish screen after the last step. */
  protected readonly finished = signal(false);
  protected readonly lessonValue = computed(() =>
    lessonProgress(this.index(), this.total(), this.finished()),
  );
  private celebrationTimer: ReturnType<typeof setTimeout> | undefined;
  protected readonly view = computed(() => {
    const plan = this.plan();
    const stepper = this.stepper();
    const step = this.step();
    return plan && stepper && step ? { plan, stepper, step } : undefined;
  });
  /** Bumped whenever the step document changes (the viewport remeshes). */
  protected readonly version = signal(0);

  protected readonly selected = linkedSignal<number, number | null>({
    source: this.index,
    computation: () => null,
  });
  protected readonly selectedHint = linkedSignal<number, number | null>({
    source: this.index,
    computation: () => null,
  });
  protected readonly showNext = signal(false);
  protected readonly layerOnly = signal(false);
  protected readonly tab = signal<'step' | 'overview'>('step');

  /**
   * Phones: the step panel is a bottom sheet with three snap points (desktop ignores them).
   * The 3D view only uses the space above the sheet, so its gestures are never captured.
   */
  protected readonly snap = signal<SheetSnap>('half');
  private readonly dragHeight = signal<number | null>(null);
  private readonly layoutHeight = signal(0);
  private readonly peekHeight = signal(0);
  private readonly heights = computed(() => sheetHeights(this.layoutHeight(), this.peekHeight()));
  protected readonly sheetHeight = computed(() => {
    const drag = this.dragHeight();
    return drag ?? (this.layoutHeight() > 0 ? this.heights()[this.snap()] : null);
  });
  protected readonly dragging = computed(() => this.dragHeight() !== null);
  /** Phone layout (bottom sheet over the 3D view), see `guide-page.scss`. */
  private readonly sheetLayout = signal(false);
  /** The sheet covers the bottom of the canvas; the view centres the build above it. */
  protected readonly viewInsets = computed<ViewInsets>(() => ({
    top: 0,
    right: 0,
    left: 0,
    bottom: this.sheetLayout() && this.layoutHeight() > 0 ? this.heights()[this.snap()] : 0,
  }));
  private readonly layoutRef = viewChild<ElementRef<HTMLElement>>('layout');
  private readonly sheetHeadRef = viewChild<ElementRef<HTMLElement>>('sheetHead');
  private readonly sheetFootRef = viewChild<ElementRef<HTMLElement>>('sheetFoot');
  private drag: SheetDrag | null = null;
  /** The click that ends a handle drag must not also cycle the snap point. */
  private suppressClickUntil = 0;

  protected readonly visuals = computed(() => {
    const plan = this.plan();
    if (!plan) return undefined;
    const step = this.step();
    const sel = this.selected();
    const hint = this.selectedHint();
    return stepVisuals(plan, this.index(), {
      showNext: this.showNext(),
      layerOnly: this.layerOnly(),
      selected: sel === null ? null : step?.actions[sel],
      hintPositions: hint === null ? undefined : step?.hints[hint]?.positions,
    });
  });

  protected readonly blockAt = (pos: Vec3): BlockStateString =>
    this.stepper()?.doc.getBlock(pos.x, pos.y, pos.z) ?? AIR;

  private swipeStart: { x: number; y: number } | null = null;

  constructor() {
    effect(() => {
      const stepper = this.stepper();
      const index = this.index();
      if (!stepper) return;
      stepper.goTo(index);
      untracked(() => this.version.update((v) => v + 1));
    });

    const media = this.document.defaultView?.matchMedia?.(SHEET_MEDIA);
    if (media) {
      this.sheetLayout.set(media.matches);
      const onChange = (e: MediaQueryListEvent) => this.sheetLayout.set(e.matches);
      media.addEventListener('change', onChange);
      inject(DestroyRef).onDestroy(() => media.removeEventListener('change', onChange));
    }

    // Measure the sheet container, the sheet head and the action bar (head + bar = peek height).
    effect((onCleanup) => {
      const layout = this.layoutRef()?.nativeElement;
      const head = this.sheetHeadRef()?.nativeElement;
      const foot = this.sheetFootRef()?.nativeElement;
      if (!layout || !head || !foot || typeof ResizeObserver === 'undefined') return;
      const measure = () => {
        this.layoutHeight.set(layout.clientHeight);
        const peek = head.getBoundingClientRect().height + foot.getBoundingClientRect().height;
        // + 2 px for the sheet's top border.
        this.peekHeight.set(Math.ceil(peek) + 2);
      };
      const observer = new ResizeObserver(measure);
      observer.observe(layout);
      observer.observe(head);
      observer.observe(foot);
      measure();
      onCleanup(() => observer.disconnect());
    });

    inject(DestroyRef).onDestroy(() => clearTimeout(this.celebrationTimer));
  }

  protected storageErrorKey(): string {
    return STORAGE_ERROR_KEYS[buildStoreErrorCode(this.build.error())] ?? 'storage.errors.unknown';
  }

  protected planErrorKey(): string {
    const err = this.planRes.error();
    return err instanceof PlanError && err.code === 'planner-unavailable'
      ? 'guide.errors.plannerUnavailable'
      : 'guide.errors.plan';
  }

  protected go(index: number): void {
    const total = this.total();
    if (total === 0) return;
    this.index.set(Math.max(0, Math.min(total - 1, index)));
  }

  /** One step back; also leaves the finish screen. */
  protected prev(): void {
    this.dismissCelebration();
    if (this.finished()) {
      this.finished.set(false);
      return;
    }
    this.go(this.index() - 1);
  }

  /**
   * "Continue": completes the current step. Shows the success banner, or the finish
   * screen after the last step.
   */
  protected next(): void {
    if (this.total() === 0 || this.finished()) return;
    if (this.isLast()) {
      this.finish();
      return;
    }
    this.go(this.index() + 1);
    this.celebrate(this.index());
  }

  protected dismissCelebration(): void {
    clearTimeout(this.celebrationTimer);
    this.celebration.set(null);
  }

  protected closeFinish(): void {
    this.finished.set(false);
  }

  private celebrate(done: number): void {
    clearTimeout(this.celebrationTimer);
    this.celebration.set({ done });
    this.celebrationTimer = setTimeout(() => this.celebration.set(null), SUCCESS_BANNER_MS);
  }

  private finish(): void {
    this.dismissCelebration();
    this.finished.set(true);
    afterNextRender(() => this.document.getElementById('guide-finish-title')?.focus(), {
      injector: this.injector,
    });
  }

  protected onSlider(event: Event): void {
    this.dismissCelebration();
    this.go(Number((event.target as HTMLInputElement).value) - 1);
  }

  protected onToggle(target: 'showNext' | 'layerOnly', event: Event): void {
    this[target].set((event.target as HTMLInputElement).checked);
  }

  protected onKey(event: KeyboardEvent): void {
    if (!this.plan() || event.altKey || event.ctrlKey || event.metaKey) return;
    const el = event.target as HTMLElement | null;
    if (el?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.prev();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.next();
    } else if (event.key === 'Escape') {
      this.finished.set(false);
      this.selected.set(null);
    }
  }

  protected onHandleClick(): void {
    if (performance.now() < this.suppressClickUntil) return;
    this.snap.update(nextSnap);
  }

  protected onHandleDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // A sheet drag is never a step swipe.
    event.stopPropagation();
    this.swipeStart = null;
    const height = this.sheetHeight();
    if (height === null) return;
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      /* pointer already gone */
    }
    this.drag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: height,
      lastY: event.clientY,
      lastT: event.timeStamp,
      velocity: 0,
      moved: false,
    };
  }

  protected onHandleMove(event: PointerEvent): void {
    const d = this.drag;
    if (!d || d.pointerId !== event.pointerId) return;
    const dy = d.startY - event.clientY;
    if (!d.moved && Math.abs(dy) < DRAG_SLOP) return;
    d.moved = true;
    const dt = event.timeStamp - d.lastT;
    if (dt > 0) d.velocity = (d.lastY - event.clientY) / dt;
    d.lastY = event.clientY;
    d.lastT = event.timeStamp;
    const h = this.heights();
    this.dragHeight.set(Math.max(h.peek, Math.min(h.full, d.startHeight + dy)));
  }

  protected onHandleUp(event: PointerEvent): void {
    const d = this.drag;
    if (!d || d.pointerId !== event.pointerId) return;
    event.stopPropagation();
    this.drag = null;
    const height = this.dragHeight();
    this.dragHeight.set(null);
    if (!d.moved || height === null) return;
    this.suppressClickUntil = performance.now() + 400;
    this.snap.set(snapAfterDrag(height, d.velocity, this.heights()));
  }

  protected onHandleCancel(): void {
    this.drag = null;
    this.dragHeight.set(null);
  }

  protected onPointerDown(event: PointerEvent): void {
    this.swipeStart = event.pointerType === 'mouse' ? null : { x: event.clientX, y: event.clientY };
  }

  protected onPointerUp(event: PointerEvent): void {
    const start = this.swipeStart;
    this.swipeStart = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < 2 * Math.abs(dy)) return;
    if (dx < 0) this.next();
    else this.prev();
  }
}
