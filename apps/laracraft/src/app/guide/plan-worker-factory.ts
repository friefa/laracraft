/**
 * Creates the build-order worker, or undefined where workers are unavailable
 * (unit tests, very old WebViews). Kept in its own file so tests can replace
 * the factory without touching the worker URL.
 */
export function createPlanWorker(): Worker | undefined {
  if (typeof Worker === 'undefined') return undefined;
  try {
    return new Worker(new URL('./plan.worker', import.meta.url), { type: 'module' });
  } catch {
    return undefined;
  }
}
