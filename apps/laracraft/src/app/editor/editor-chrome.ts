import type { ViewInsets } from '@laracraft/renderer';

/** localStorage key: the editor's first-run hint was dismissed. */
export const FIRST_RUN_HINT_KEY = 'laracraft.editor.firstRunHintDismissed';

/** Reads a boolean flag from storage; false when storage is unavailable or throws. */
export function readFlag(storage: Storage | undefined, key: string): boolean {
  try {
    return storage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

/** Stores a boolean flag; silently ignores unavailable or full storage. */
export function writeFlag(storage: Storage | undefined, key: string): void {
  try {
    storage?.setItem(key, '1');
  } catch {
    /* private mode, quota … – the hint just comes back next time */
  }
}

export function safeLocalStorage(doc: Document): Storage | undefined {
  try {
    return doc.defaultView?.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

type Rect = Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left'>;

/**
 * Canvas edges covered by the editor's overlay UI (top bar, bottom toolbar, layer slider),
 * in CSS px. The renderer centres and frames the build in the rest of the canvas.
 */
export function chromeInsets(
  canvas: Rect,
  chrome: { readonly top?: Rect; readonly bottom?: Rect; readonly right?: Rect },
): ViewInsets {
  const clamp = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
  return {
    top: chrome.top ? clamp(chrome.top.bottom - canvas.top) : 0,
    bottom: chrome.bottom ? clamp(canvas.bottom - chrome.bottom.top) : 0,
    right: chrome.right ? clamp(canvas.right - chrome.right.left) : 0,
    left: 0,
  };
}
