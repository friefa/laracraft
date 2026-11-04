import type {
  BuildOrderOptions,
  BuildOrderRequest,
  BuildOrderResponse,
  BuildPlan,
  PlanBuildFn,
} from '@laracraft/build-order';
import {
  createJavaBlockRegistry,
  deserializeBuild,
  type BlockRegistry,
  type BuildDocument,
} from '@laracraft/core-model';

/** Error message posted when `@laracraft/build-order` does not export a planner yet. */
export const PLANNER_UNAVAILABLE = 'planner-unavailable';

type PlanWithProgressFn = (
  doc: BuildDocument,
  registry: BlockRegistry,
  options: Partial<BuildOrderOptions> | undefined,
  onProgress: (done: number, total: number) => void,
) => BuildPlan;

/** The planner exports this host looks for; both are optional until the planner lands. */
export interface PlannerModule {
  readonly planBuild?: PlanBuildFn;
  readonly planBuildWithProgress?: PlanWithProgressFn;
}

/** Lazily loads the build-order lib (separate chunk; also used inside the worker). */
export const loadPlannerModule = (): Promise<PlannerModule> =>
  import('@laracraft/build-order') as Promise<PlannerModule>;

let registry: BlockRegistry | undefined;

/**
 * Runs one plan request and reports through `post`, exactly like the worker
 * protocol. Used by the app's plan worker and as main-thread fallback.
 */
export async function handlePlanRequest(
  request: BuildOrderRequest,
  post: (response: BuildOrderResponse) => void,
  load: () => Promise<PlannerModule> = loadPlannerModule,
): Promise<void> {
  const id = request.id;
  try {
    const mod = await load();
    const withProgress = mod.planBuildWithProgress;
    const plain = mod.planBuild;
    if (typeof withProgress !== 'function' && typeof plain !== 'function') {
      throw new Error(PLANNER_UNAVAILABLE);
    }
    registry ??= createJavaBlockRegistry();
    const doc = deserializeBuild(request.file as unknown as Record<string, unknown>);
    post({ type: 'progress', id, done: 0, total: 1 });
    const plan =
      typeof withProgress === 'function'
        ? withProgress(doc, registry, request.options, (done, total) =>
            post({ type: 'progress', id, done, total }),
          )
        : (plain as PlanBuildFn)(doc, registry, request.options);
    post({ type: 'result', id, plan });
  } catch (e) {
    post({ type: 'error', id, message: e instanceof Error ? e.message : String(e) });
  }
}
