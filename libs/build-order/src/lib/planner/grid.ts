/*
 * Spatial hash for the planner: 16³ chunks keyed by a number, each holding
 * typed arrays. Reads outside the hashed range return 0; a one-entry cache
 * keeps neighbourhood scans cheap.
 */

const SHIFT = 4;
const MASK = 15;
const VOLUME = 4096;
const SPAN = 1 << 17;
/** Chunks of margin around the build (scaffolds, stand positions, support columns). */
const MARGIN = 8;

interface GridChunk {
  /** Design palette index + 1 (0 = air in the final build). */
  readonly design: Int32Array;
  /** Planner node index + 1 (0 = no node). */
  readonly node: Int32Array;
  /** Current world: 0 air, 1 final block, 2 temporary block, 3 implicit part. */
  readonly world: Uint8Array;
}

export const W_AIR = 0;
export const W_FINAL = 1;
export const W_TEMP = 2;
export const W_IMPLICIT = 3;

export class PlannerGrid {
  private readonly chunks = new Map<number, GridChunk>();
  private readonly bx: number;
  private readonly by: number;
  private readonly bz: number;
  private cacheKey = -2;
  private cacheChunk: GridChunk | undefined;

  constructor(minX: number, minY: number, minZ: number) {
    this.bx = (minX >> SHIFT) - MARGIN;
    this.by = (minY >> SHIFT) - MARGIN;
    this.bz = (minZ >> SHIFT) - MARGIN;
  }

  private key(x: number, y: number, z: number): number {
    const a = (x >> SHIFT) - this.bx;
    const b = (y >> SHIFT) - this.by;
    const c = (z >> SHIFT) - this.bz;
    if (a < 0 || b < 0 || c < 0 || a >= SPAN || b >= SPAN || c >= SPAN) return -1;
    return a + SPAN * (c + SPAN * b);
  }

  private chunk(x: number, y: number, z: number, create: boolean): GridChunk | undefined {
    const k = this.key(x, y, z);
    if (k === this.cacheKey && (this.cacheChunk || !create)) return this.cacheChunk;
    if (k < 0) {
      if (create) throw new RangeError(`Position (${x}, ${y}, ${z}) outside the planner range`);
      return undefined;
    }
    let c = this.chunks.get(k);
    if (!c && create) {
      c = {
        design: new Int32Array(VOLUME),
        node: new Int32Array(VOLUME),
        world: new Uint8Array(VOLUME),
      };
      this.chunks.set(k, c);
    }
    this.cacheKey = k;
    this.cacheChunk = c;
    return c;
  }

  design(x: number, y: number, z: number): number {
    const c = this.chunk(x, y, z, false);
    return c ? (c.design[(x & MASK) | ((z & MASK) << 4) | ((y & MASK) << 8)] as number) : 0;
  }

  node(x: number, y: number, z: number): number {
    const c = this.chunk(x, y, z, false);
    return c ? (c.node[(x & MASK) | ((z & MASK) << 4) | ((y & MASK) << 8)] as number) : 0;
  }

  world(x: number, y: number, z: number): number {
    const c = this.chunk(x, y, z, false);
    return c ? (c.world[(x & MASK) | ((z & MASK) << 4) | ((y & MASK) << 8)] as number) : 0;
  }

  setDesign(x: number, y: number, z: number, design: number, node: number): void {
    const c = this.chunk(x, y, z, true) as GridChunk;
    const i = (x & MASK) | ((z & MASK) << 4) | ((y & MASK) << 8);
    c.design[i] = design;
    c.node[i] = node;
  }

  setWorld(x: number, y: number, z: number, value: number): void {
    const c = this.chunk(x, y, z, true) as GridChunk;
    c.world[(x & MASK) | ((z & MASK) << 4) | ((y & MASK) << 8)] = value;
  }
}

/** Binary min-heap of integers ordered by `key[id]`. */
export class IdHeap {
  private readonly items: number[] = [];

  constructor(private readonly keys: Int32Array) {}

  get size(): number {
    return this.items.length;
  }

  peek(): number | undefined {
    return this.items[0];
  }

  push(id: number): void {
    const items = this.items;
    const keys = this.keys;
    let i = items.length;
    items.push(id);
    const k = keys[id] as number;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const pid = items[p] as number;
      if ((keys[pid] as number) <= k) break;
      items[i] = pid;
      i = p;
    }
    items[i] = id;
  }

  pop(): number | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length === 0 || last === undefined) return top;
    const keys = this.keys;
    const k = keys[last] as number;
    const n = items.length;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= n) break;
      const r = l + 1;
      let c = l;
      if (r < n && (keys[items[r] as number] as number) < (keys[items[l] as number] as number)) {
        c = r;
      }
      const cid = items[c] as number;
      if ((keys[cid] as number) >= k) break;
      items[i] = cid;
      i = c;
    }
    items[i] = last;
    return top;
  }
}
