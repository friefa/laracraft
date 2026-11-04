/**
 * Creates the mesher Web Worker (`mesh/mesher.worker.ts`). Pass it as
 * `RendererOptions.createWorker`. The `new Worker(new URL(…, import.meta.url))` pattern is
 * resolved by the app bundler (Angular's esbuild application builder, Vite), which emits the
 * worker as its own chunk; calling this outside a bundler-aware browser build throws.
 */
export function createMesherWorker(): Worker {
  return new Worker(new URL('../mesh/mesher.worker', import.meta.url), { type: 'module' });
}
