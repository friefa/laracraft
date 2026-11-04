import { DOCUMENT, InjectionToken, inject } from '@angular/core';
import type { BlockRegistry } from '@laracraft/core-model';
// Types only: the renderer module (three.js) is loaded with a dynamic import below.
import type { SceneBuildRenderer } from '@laracraft/renderer';

export type { LookDirection } from '@laracraft/renderer';

/** Texture atlas served by the app (copied from `dist/assets/textures` at build time). */
export const ATLAS_URL = 'assets/textures/atlas.json';

/**
 * Absolute URL of an app asset. Relative URLs would resolve against the current
 * route (`/build/:id`) in some loaders and return `index.html`.
 */
export function assetUrl(doc: Document, path: string): string {
  return new URL(path, doc.baseURI).href;
}

/** The renderer as the editor uses it (contract + camera look direction). */
export type EditorRenderer = SceneBuildRenderer;

export type RendererFailure = 'webgl' | 'failed';

/** Why the 3D view could not start; mapped to `editor.errors.renderer.<code>`. */
export class RendererLoadError extends Error {
  constructor(
    readonly code: RendererFailure,
    options?: { cause?: unknown },
  ) {
    super(`Renderer could not be created (${code})`, options);
    this.name = 'RendererLoadError';
  }
}

export type RendererFactory = (
  canvas: HTMLCanvasElement,
  registry: BlockRegistry,
) => Promise<EditorRenderer>;

/** Creates the 3D view. Replaced by a fake in component tests. */
export const RENDERER_FACTORY = new InjectionToken<RendererFactory>('RENDERER_FACTORY', {
  providedIn: 'root',
  factory: () => {
    const doc = inject(DOCUMENT);
    return (canvas, registry) => loadBuildRenderer(doc, canvas, registry);
  },
});

function supportsWebGl2(doc: Document): boolean {
  try {
    // A throwaway canvas: the real one must stay free for three.js.
    return !!doc.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

/**
 * Lazy-loads `@laracraft/renderer` (three.js stays out of the initial bundle)
 * and creates the renderer with the mesher in a Web Worker (main-thread
 * meshing where workers are unavailable).
 */
export async function loadBuildRenderer(
  doc: Document,
  canvas: HTMLCanvasElement,
  registry: BlockRegistry,
): Promise<EditorRenderer> {
  if (!supportsWebGl2(doc)) throw new RendererLoadError('webgl');
  try {
    const { createBuildRenderer, createMesherWorker } = await import('@laracraft/renderer');
    return await createBuildRenderer({
      canvas,
      registry,
      atlasUrl: assetUrl(doc, ATLAS_URL),
      ...(typeof Worker === 'undefined' ? {} : { createWorker: createMesherWorker }),
    });
  } catch (err) {
    throw new RendererLoadError('failed', { cause: err });
  }
}
