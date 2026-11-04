import { Injectable, InjectionToken, inject } from '@angular/core';
import type { BuildOrderRequest, BuildOrderResponse, BuildPlan } from '@laracraft/build-order';
import { serializeBuild, type BuildDocument } from '@laracraft/core-model';
import { PLANNER_UNAVAILABLE, handlePlanRequest, loadPlannerModule } from './plan-host';
import { createPlanWorker } from './plan-worker-factory';

/** Creates the build-order worker; undefined → plan on the main thread. */
export const PLAN_WORKER_FACTORY = new InjectionToken<() => Worker | undefined>(
  'PLAN_WORKER_FACTORY',
  { providedIn: 'root', factory: () => createPlanWorker },
);

/** Loader of the planner module for the main-thread fallback. */
export const PLANNER_LOADER = new InjectionToken<typeof loadPlannerModule>('PLANNER_LOADER', {
  providedIn: 'root',
  factory: () => loadPlannerModule,
});

export interface PlanProgress {
  readonly done: number;
  readonly total: number;
}

export type PlanErrorCode = 'planner-unavailable' | 'failed';

export class PlanError extends Error {
  constructor(
    readonly code: PlanErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PlanError';
  }
}

interface Pending {
  readonly request: BuildOrderRequest;
  readonly resolve: (plan: BuildPlan) => void;
  readonly reject: (err: PlanError) => void;
  readonly onProgress?: (p: PlanProgress) => void;
}

/**
 * Computes build plans in the build-order worker (main-thread fallback when
 * workers are unavailable or the worker script fails to load) and caches one
 * plan per build in memory, keyed by the build's `updatedAt`.
 */
@Injectable({ providedIn: 'root' })
export class PlanService {
  private readonly createWorker = inject(PLAN_WORKER_FACTORY);
  private readonly loadPlanner = inject(PLANNER_LOADER);
  private readonly cache = new Map<string, { updatedAt: string; plan: Promise<BuildPlan> }>();
  private readonly pending = new Map<number, Pending>();
  /** null = not created yet; undefined = no worker (fallback). */
  private worker: Worker | undefined | null = null;
  private nextId = 1;

  /** The plan of `doc`, from cache when the build has not changed since. */
  plan(
    buildId: string,
    doc: BuildDocument,
    onProgress?: (p: PlanProgress) => void,
  ): Promise<BuildPlan> {
    const updatedAt = doc.metadata.updatedAt;
    const hit = this.cache.get(buildId);
    if (hit && hit.updatedAt === updatedAt) return hit.plan;
    const plan = this.run(doc, onProgress);
    this.cache.set(buildId, { updatedAt, plan });
    plan.catch(() => {
      if (this.cache.get(buildId)?.plan === plan) this.cache.delete(buildId);
    });
    return plan;
  }

  private run(doc: BuildDocument, onProgress?: (p: PlanProgress) => void): Promise<BuildPlan> {
    return new Promise<BuildPlan>((resolve, reject) => {
      let request: BuildOrderRequest;
      try {
        request = { type: 'plan', id: this.nextId++, file: serializeBuild(doc) };
      } catch (e) {
        reject(new PlanError('failed', e instanceof Error ? e.message : String(e)));
        return;
      }
      this.pending.set(request.id, { request, resolve, reject, onProgress });
      const worker = this.getWorker();
      if (worker) worker.postMessage(request);
      else this.runOnMainThread(request);
    });
  }

  private getWorker(): Worker | undefined {
    if (this.worker === null) {
      const worker = this.createWorker();
      if (worker) {
        worker.onmessage = (e: MessageEvent<BuildOrderResponse>) => this.dispatch(e.data);
        // The worker script failed to load or crashed: finish everything on the main thread.
        worker.onerror = (e: Event) => {
          e.preventDefault?.();
          worker.terminate();
          this.worker = undefined;
          for (const p of this.pending.values()) this.runOnMainThread(p.request);
        };
      }
      this.worker = worker;
    }
    return this.worker;
  }

  private runOnMainThread(request: BuildOrderRequest): void {
    void handlePlanRequest(request, (r) => this.dispatch(r), this.loadPlanner);
  }

  private dispatch(response: BuildOrderResponse): void {
    const p = this.pending.get(response.id);
    if (!p) return;
    switch (response.type) {
      case 'progress':
        p.onProgress?.({ done: response.done, total: response.total });
        break;
      case 'result':
        this.pending.delete(response.id);
        p.resolve(response.plan);
        break;
      case 'error':
        this.pending.delete(response.id);
        p.reject(
          new PlanError(
            response.message === PLANNER_UNAVAILABLE ? 'planner-unavailable' : 'failed',
            response.message,
          ),
        );
        break;
    }
  }
}
