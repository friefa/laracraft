/** Maximum pointer travel (CSS px) for a tap. */
export const TAP_MAX_DISTANCE = 6;
/** Maximum press duration (ms) for a tap. */
export const TAP_MAX_DURATION = 300;

/** Tap vs. drag: a tap moved less than 6 px and lasted less than 300 ms. */
export function classifyGesture(distancePx: number, durationMs: number): 'tap' | 'drag' {
  return distancePx < TAP_MAX_DISTANCE && durationMs < TAP_MAX_DURATION ? 'tap' : 'drag';
}

/** DOM-free pointer sample; `event` carries the original event through to `tap`. */
export interface PointerSample<E = unknown> {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** Timestamp in ms. */
  readonly t: number;
  /** 0 = primary (left / touch / pen), 1 = middle, 2 = right. */
  readonly button: number;
  readonly pointerType: string;
  readonly event: E;
}

/** Camera operations driven by gestures (pixel deltas, zoom factor < 1 = closer). */
export interface GestureTarget<E = unknown> {
  orbit(dx: number, dy: number): void;
  pan(dx: number, dy: number): void;
  zoom(factor: number): void;
  tap(sample: PointerSample<E>): void;
}

interface TrackedPointer<E> {
  readonly down: PointerSample<E>;
  x: number;
  y: number;
}

/**
 * Pointer gesture state machine, independent of the DOM:
 * - one touch / left mouse / pen: orbit; right or middle mouse: pan;
 * - two touches: pinch zoom + pan with the midpoint;
 * - wheel: zoom;
 * - a press that moved < 6 px and lasted < 300 ms, with no second pointer involved, is a
 *   tap (any button; the editor can inspect `event.button`). Camera moves start only after
 *   the 6 px dead zone, so taps never nudge the camera.
 */
export class GestureController<E = unknown> {
  private readonly pointers = new Map<number, TrackedPointer<E>>();
  /** Set once a gesture can no longer be a tap (until all pointers are released). */
  private dragging = false;
  private multi = false;
  private pinchSpread = 0;
  private pinchMid = { x: 0, y: 0 };

  constructor(private readonly target: GestureTarget<E>) {}

  get activePointers(): number {
    return this.pointers.size;
  }

  down(s: PointerSample<E>): void {
    if (this.pointers.size === 0) {
      this.dragging = false;
      this.multi = false;
    }
    this.pointers.set(s.id, { down: s, x: s.x, y: s.y });
    if (this.pointers.size >= 2) {
      this.multi = true;
      this.dragging = true;
      this.startPinch();
    }
  }

  move(s: PointerSample<E>): void {
    const p = this.pointers.get(s.id);
    if (!p) return;
    if (this.pointers.size >= 2) {
      p.x = s.x;
      p.y = s.y;
      this.updatePinch();
      return;
    }
    let dx = s.x - p.x;
    let dy = s.y - p.y;
    if (!this.dragging) {
      const travelled = Math.hypot(s.x - p.down.x, s.y - p.down.y);
      if (travelled < TAP_MAX_DISTANCE) return;
      this.dragging = true;
      dx = s.x - p.down.x;
      dy = s.y - p.down.y;
    }
    p.x = s.x;
    p.y = s.y;
    if (dx === 0 && dy === 0) return;
    if (p.down.button === 1 || p.down.button === 2) this.target.pan(dx, dy);
    else this.target.orbit(dx, dy);
  }

  up(s: PointerSample<E>): void {
    const p = this.pointers.get(s.id);
    if (!p) return;
    this.pointers.delete(s.id);
    if (this.pointers.size === 0) {
      const travelled = Math.hypot(s.x - p.down.x, s.y - p.down.y);
      const isTap =
        !this.multi && !this.dragging && classifyGesture(travelled, s.t - p.down.t) === 'tap';
      this.dragging = false;
      this.multi = false;
      if (isTap) this.target.tap(s);
      return;
    }
    if (this.pointers.size === 1) {
      // Pinch → single finger: continue as orbit from the current position, no tap.
      this.dragging = true;
    } else this.startPinch();
  }

  /** Pointer cancelled by the browser (e.g. a system gesture): never a tap. */
  cancel(s: PointerSample<E>): void {
    this.pointers.delete(s.id);
    this.dragging = this.pointers.size > 0;
    if (this.pointers.size === 0) this.multi = false;
  }

  /** Wheel delta in pixels (positive = scroll down = zoom out). */
  wheel(deltaY: number): void {
    if (deltaY === 0 || !Number.isFinite(deltaY)) return;
    this.target.zoom(Math.exp(Math.max(-500, Math.min(500, deltaY)) * 0.0015));
  }

  private twoPointers(): [TrackedPointer<E>, TrackedPointer<E>] | null {
    const it = this.pointers.values();
    const a = it.next().value;
    const b = it.next().value;
    return a && b ? [a, b] : null;
  }

  private startPinch(): void {
    const pair = this.twoPointers();
    if (!pair) return;
    const [a, b] = pair;
    this.pinchSpread = Math.hypot(a.x - b.x, a.y - b.y);
    this.pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private updatePinch(): void {
    const pair = this.twoPointers();
    if (!pair) return;
    const [a, b] = pair;
    const spread = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (this.pinchSpread > 0 && spread > 0 && spread !== this.pinchSpread) {
      this.target.zoom(this.pinchSpread / spread);
    }
    const dx = mid.x - this.pinchMid.x;
    const dy = mid.y - this.pinchMid.y;
    if (dx !== 0 || dy !== 0) this.target.pan(dx, dy);
    this.pinchSpread = spread;
    this.pinchMid = mid;
  }
}
