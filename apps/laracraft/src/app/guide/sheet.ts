/** Snap points of the guide's bottom sheet on phones. */
export type SheetSnap = 'peek' | 'half' | 'full';

export const SHEET_SNAPS: readonly SheetSnap[] = ['peek', 'half', 'full'];

/** Strip of 3D view (px) that stays visible above the fully opened sheet. */
export const FULL_SHEET_GAP = 72;

/** Release speed (px/ms) above which a drag counts as a flick towards the next snap point. */
export const FLICK_SPEED = 0.5;

export type SheetHeights = Readonly<Record<SheetSnap, number>>;

/**
 * Sheet heights (px) for a container of `container` px: `peek` shows only the sheet head
 * (handle, step header, prev/next), `half` half the container, `full` all but a strip of
 * the 3D view. Monotonic even for tiny containers.
 */
export function sheetHeights(container: number, peek: number): SheetHeights {
  const c = Math.max(0, container);
  const p = Math.max(0, Math.min(peek, c));
  const half = Math.max(p, Math.round(c / 2));
  const full = Math.max(half, c - FULL_SHEET_GAP);
  return { peek: p, half, full };
}

/**
 * Snap point after a drag released at `height` with vertical `velocity` (px/ms, positive =
 * growing): a flick moves one snap point in its direction, otherwise the nearest one wins.
 */
export function snapAfterDrag(height: number, velocity: number, heights: SheetHeights): SheetSnap {
  if (Math.abs(velocity) >= FLICK_SPEED) {
    const order = [...SHEET_SNAPS];
    if (velocity > 0) return order.find((s) => heights[s] > height + 1) ?? 'full';
    return order.reverse().find((s) => heights[s] < height - 1) ?? 'peek';
  }
  let best: SheetSnap = 'half';
  for (const s of SHEET_SNAPS) {
    if (Math.abs(heights[s] - height) < Math.abs(heights[best] - height)) best = s;
  }
  return best;
}

/** Snap point after a tap on the handle: peek → half → full → peek. */
export function nextSnap(snap: SheetSnap): SheetSnap {
  return snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek';
}
