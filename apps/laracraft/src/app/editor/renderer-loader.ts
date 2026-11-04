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

/** Fallback 3D backdrop when the `--lc-sky` token is missing (dark night blue). */
export const DEFAULT_SKY = 0x20364a;

/** Parses a `#rgb`/`#rrggbb` CSS colour to 0xRRGGBB; null for anything else. */
export function parseHexColor(value: string | null | undefined): number | null {
  const hex = value?.trim().replace(/^#/, '') ?? '';
  if (/^[0-9a-f]{3}$/i.test(hex)) return parseInt([...hex].map((c) => c + c).join(''), 16);
  if (/^[0-9a-f]{6}$/i.test(hex)) return parseInt(hex, 16);
  return null;
}

/** The 3D view's backdrop from the `--lc-sky` design token (follows the theme). */
export function skyColor(doc: Document, el: Element): number {
  try {
    const value = doc.defaultView?.getComputedStyle(el).getPropertyValue('--lc-sky');
    return parseHexColor(value) ?? DEFAULT_SKY;
  } catch {
    return DEFAULT_SKY;
  }
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
      background: skyColor(doc, canvas),
      // Hover/paste previews must read clearly against the build.
      ghostOpacity: 0.75,
      ...(typeof Worker === 'undefined' ? {} : { createWorker: createMesherWorker }),
    });
  } catch (err) {
    throw new RendererLoadError('failed', { cause: err });
  }
}
