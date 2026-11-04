import {
  resolveBlockState,
  satisfiesSupport,
  type BlockRegistry,
  type BlockStateString,
  type BuildDocument,
  type FaceSupport,
  type Vec3,
} from '@laracraft/core-model';
import type { PlanBuildFn } from '../api';
import {
  DEFAULT_REACH,
  type BuildOrderOptions,
  type BuildPhase,
  type BuildPlan,
  type PlaceAction,
  type PlanWarning,
  type WarningCode,
} from '../types';
import { IdHeap, PlannerGrid, W_AIR, W_FINAL, W_IMPLICIT, W_TEMP } from './grid';
import {
  ALL_LOOKS,
  D_DOWN,
  D_UP,
  DIRS,
  DX,
  DY,
  DZ,
  HALF_BOTTOM,
  HALF_NONE,
  HALF_TOP,
  LOOK_H,
  LOOK_V,
  OPP,
  RANK_PHASE,
  V_DOWN,
  V_LEVEL,
  V_UP,
  analyzeState,
  type StateInfo,
} from './state-info';
import {
  F_INTERACT,
  F_LOOK,
  F_OBSERVER,
  F_SCAFFOLD,
  MaterialCounter,
  formSteps,
  type PlanEntry,
} from './steps';

/*
 * Build-order planner (P2.1).
 *
 * 1. Analyze every palette state once (support, gravity, phase rank, which
 *    click/look combinations produce the exact state, item cost).
 * 2. Build a dependency graph: support block → attachment, block below →
 *    gravity block, watched block → observer, neighbours → actuators that
 *    trigger on placement. Ranks (phases) are raised along the edges so a block
 *    never waits for a later phase.
 * 3. Kahn's topological sort with a priority (rank, Y layer, 8×8 cluster in
 *    serpentine order), interleaved with a world simulation: a node is placed
 *    only when it has a neighbour to click on; otherwise it waits until a
 *    neighbour appears, and is forced (with temporary blocks) when its rank is
 *    about to be left. Cycles are broken at the lowest pending node.
 * 4. For every placement: choose click target, half and look so the registry
 *    placement rules yield the target state, and a stand position (feet+head
 *    free, solid floor, eye within reach of the clicked face). If none exists,
 *    a two-column scaffold tower is built next to the target.
 * 5. Temporary blocks only go where the final build has air, nothing rests
 *    on them and no fluid touches them; all are removed in cleanup (top-down).
 *    Fluids: scaffolding for them is built first, then all sources are placed
 *    (flowing fluid is assumed to fill its cells) — no solid block after a fluid.
 * 6. Steps of `minStepSize`–`maxStepSize` actions, never across phases.
 */

export type PlanProgressFn = (done: number, total: number) => void;

interface ResolvedOptions {
  readonly minStepSize: number;
  readonly maxStepSize: number;
  readonly scaffoldBlock: BlockStateString;
  readonly reach: number;
  readonly groundY: number;
}

interface ClickOpt {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly dir: number;
  readonly half: number;
  readonly mask: number;
  readonly sneak: boolean;
}

interface Stand {
  readonly fx: number;
  readonly fy: number;
  readonly fz: number;
  readonly opt: ClickOpt;
  readonly look: number;
}

interface TempBlock {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const ST_BLOCKED = 0;
const ST_QUEUED = 1;
const ST_WAITING = 2;
const ST_PLACED = 3;

/** Preferred click order: top of the block below, the four sides, underside of the block above. */
const CLICK_ORDER: readonly number[] = [D_UP, 2, 5, 3, 4, D_DOWN];
const CLUSTER = 8;
const MAX_COLUMN = 512;
const MAX_TOWER = 128;
const EYE = 1.62;
const PROGRESS_EVERY = 2000;
/** In-plane offsets sampled on a clicked face (centre first). */
const AIM_T: readonly number[] = [0, 0.2, -0.2, 0.45, -0.45];

/** Aim points on a clicked face, relative to its centre, per `dir * 3 + half`. */
const AIMS: readonly (readonly number[])[] = (() => {
  const out: number[][] = [];
  for (let d = 0; d < 6; d++) {
    for (let half = 0; half < 3; half++) {
      const list: number[] = [];
      if (d < 2) {
        for (const a of AIM_T) for (const b of AIM_T) list.push(a, 0, b);
      } else {
        const ys =
          half === HALF_TOP ? [0.25, 0.1, 0.4] : half === HALF_BOTTOM ? [-0.25, -0.1, -0.4] : AIM_T;
        const spansX = d < 4; // north/south faces span X and Y
        for (const yy of ys) for (const t of AIM_T) list.push(spansX ? t : 0, yy, spansX ? 0 : t);
      }
      out.push(list);
    }
  }
  return out;
})();

/** Tower cell offsets around the target column: ring 1, then ring 2. */
const TOWER_CELLS: readonly (readonly [number, number])[] = (() => {
  const cells: [number, number, number][] = [];
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const ring = Math.max(Math.abs(dx), Math.abs(dz));
      if (ring > 0) cells.push([ring * 100 + Math.abs(dx) + Math.abs(dz), dx, dz]);
    }
  }
  cells.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  return cells.map(([, dx, dz]) => [dx, dz] as const);
})();

const H_NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Feet offsets relative to the target, sorted by preference (close, same level first). */
function standOffsets(reach: number): Int32Array {
  const r = Math.ceil(reach) + 1;
  const limit = (reach + 0.5) ** 2 + 1e-9;
  const list: [number, number, number, number][] = [];
  for (let dy = -r - 2; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const ey = dy + EYE - 0.5;
        if (dx * dx + ey * ey + dz * dz > limit) continue;
        list.push([Math.sqrt(dx * dx + dz * dz) + 1.5 * Math.abs(dy), dy, dx, dz]);
      }
    }
  }
  list.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
  const out = new Int32Array(list.length * 3);
  list.forEach(([, dy, dx, dz], i) => {
    out[i * 3] = dx;
    out[i * 3 + 1] = dy;
    out[i * 3 + 2] = dz;
  });
  return out;
}

function firstLook(mask: number): number {
  for (let i = 0; i < 12; i++) if (mask & (1 << i)) return i;
  return V_LEVEL;
}

function resolveOptions(
  options: Partial<BuildOrderOptions> | undefined,
  registry: BlockRegistry,
  minY: number,
): ResolvedOptions {
  const minStepSize = Math.max(1, Math.floor(options?.minStepSize ?? 10));
  const maxStepSize = Math.max(minStepSize, Math.floor(options?.maxStepSize ?? 30));
  const reach = options?.reach !== undefined && options.reach > 0 ? options.reach : DEFAULT_REACH;
  const rawScaffold = options?.scaffoldBlock ?? ('minecraft:dirt' as BlockStateString);
  const resolved = resolveBlockState(registry, rawScaffold);
  const scaffoldBlock = resolved.ok ? resolved.state : rawScaffold;
  const groundY = options?.groundY !== undefined ? Math.floor(options.groundY) : minY - 1;
  return { minStepSize, maxStepSize, scaffoldBlock, reach, groundY };
}

const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

class Planner {
  private readonly infos: (StateInfo | undefined)[] = [];
  private opts!: ResolvedOptions;
  private scaffold!: StateInfo;
  private grid!: PlannerGrid;
  private groundY = 0;
  private reach2 = 0;
  private offsets: Int32Array = new Int32Array(0);

  // Nodes (final blocks the player places), numbered in (y, z, x) order.
  private count = 0;
  private nx = new Int32Array(0);
  private ny = new Int32Array(0);
  private nz = new Int32Array(0);
  private npal = new Int32Array(0);
  private rank = new Uint8Array(0);
  private status = new Uint8Array(0);
  private ord = new Int32Array(0);
  private sorted = new Int32Array(0);
  private depStart = new Int32Array(0);
  private deps = new Int32Array(0);
  private indeg = new Int32Array(0);

  private readonly entries: PlanEntry[] = [];
  private readonly temps: TempBlock[] = [];
  private readonly warnings: PlanWarning[] = [];
  private readonly warningKeys = new Set<string>();
  private readonly total = new MaterialCounter();
  private readonly temporary = new MaterialCounter();
  private placements = 0;
  private readonly flowing: number[] = [];
  private readonly fluidNodes: number[] = [];
  private blocks = 0;

  constructor(
    private readonly doc: BuildDocument,
    private readonly registry: BlockRegistry,
    private readonly options: Partial<BuildOrderOptions> | undefined,
    private readonly onProgress: PlanProgressFn | undefined,
  ) {}

  run(): BuildPlan {
    const start = Date.now();
    const placed = this.collect();
    if (placed > 0) {
      this.buildGraph();
      this.order();
      this.mainLoop();
      this.placeFluids();
    }
    const removals = this.cleanup();
    const steps = formSteps(this.entries, this.opts.minStepSize, this.opts.maxStepSize);
    return {
      steps,
      totalMaterials: this.total.toList(),
      temporaryMaterials: this.temporary.toList(),
      warnings: this.warnings,
      stats: {
        blocks: this.blocks,
        placements: this.placements,
        removals,
        millis: Date.now() - start,
      },
    };
  }

  // ---------------------------------------------------------------- setup

  private info(paletteIndex: number): StateInfo {
    let info = this.infos[paletteIndex];
    if (!info) {
      info = analyzeState(this.doc.palette.stateAt(paletteIndex), this.registry);
      this.infos[paletteIndex] = info;
    }
    return info;
  }

  /** Reads the document into the grid and creates the nodes. Returns the node count. */
  private collect(): number {
    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];
    const ps: number[] = [];
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    this.doc.volume.forEachBlock((x, y, z, index) => {
      const info = this.info(index);
      if (info.air) return;
      this.blocks++;
      xs.push(x);
      ys.push(y);
      zs.push(z);
      ps.push(index);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
    });
    this.opts = resolveOptions(this.options, this.registry, Number.isFinite(minY) ? minY : 0);
    this.groundY = this.opts.groundY;
    this.reach2 = this.opts.reach * this.opts.reach + 1e-9;
    this.offsets = standOffsets(this.opts.reach);
    this.scaffold = analyzeState(this.opts.scaffoldBlock, this.registry);
    if (xs.length === 0) {
      this.grid = new PlannerGrid(0, 0, 0);
      return 0;
    }
    this.grid = new PlannerGrid(minX, Math.min(minY, this.groundY), minZ);

    // Deterministic node numbering: (y, z, x), independent of document history.
    const perm: number[] = [];
    for (let i = 0; i < xs.length; i++) {
      if (this.info(ps[i] as number).kind === 'place') perm.push(i);
    }
    perm.sort(
      (a, b) =>
        (ys[a] as number) - (ys[b] as number) ||
        (zs[a] as number) - (zs[b] as number) ||
        (xs[a] as number) - (xs[b] as number),
    );
    const n = perm.length;
    this.count = n;
    this.nx = new Int32Array(n);
    this.ny = new Int32Array(n);
    this.nz = new Int32Array(n);
    this.npal = new Int32Array(n);
    const nodeOf = new Map<number, number>();
    perm.forEach((src, node) => {
      this.nx[node] = xs[src] as number;
      this.ny[node] = ys[src] as number;
      this.nz[node] = zs[src] as number;
      this.npal[node] = ps[src] as number;
      nodeOf.set(src, node);
    });
    for (let i = 0; i < xs.length; i++) {
      const node = nodeOf.get(i);
      const pal = ps[i] as number;
      this.grid.setDesign(
        xs[i] as number,
        ys[i] as number,
        zs[i] as number,
        pal + 1,
        node === undefined ? 0 : node + 1,
      );
      const info = this.info(pal);
      if (info.kind === 'skip' && info.fluid) {
        // Flowing fluid appears on its own once the sources are placed.
        this.flowing.push(xs[i] as number, ys[i] as number, zs[i] as number);
      }
      if (info.kind !== 'place') {
        const pos = vec(xs[i] as number, ys[i] as number, zs[i] as number);
        for (const issue of info.issues) this.warn('unsupported-state', pos, issue);
        if (info.kind === 'implicit') this.checkImplicit(pos, info);
      }
    }
    return n;
  }

  private checkImplicit(pos: Vec3, info: StateInfo): void {
    if (info.ownerDir < 0) return;
    const ox = pos.x + (DX[info.ownerDir] as number);
    const oy = pos.y + (DY[info.ownerDir] as number);
    const oz = pos.z + (DZ[info.ownerDir] as number);
    const d = this.grid.design(ox, oy, oz);
    const owner = d > 0 ? this.info(d - 1) : undefined;
    const ok =
      owner !== undefined &&
      owner.kind === 'place' &&
      owner.def !== undefined &&
      (info.def?.id === 'minecraft:piston_head'
        ? owner.props['extended'] === 'true'
        : owner.def.id === info.def?.id);
    if (!ok) this.warn('unsupported-state', pos, `${info.state} has no matching main part`);
  }

  private posOf(i: number): Vec3 {
    return vec(this.nx[i] as number, this.ny[i] as number, this.nz[i] as number);
  }

  private nodeInfo(i: number): StateInfo {
    return this.info(this.npal[i] as number);
  }

  /** Node at a position, mapping implicit parts (upper door half) to their main part. */
  private nodeAt(x: number, y: number, z: number): number {
    const node = this.grid.node(x, y, z);
    if (node > 0) return node - 1;
    const d = this.grid.design(x, y, z);
    if (d === 0) return -1;
    const info = this.info(d - 1);
    if (info.kind !== 'implicit' || info.ownerDir < 0) return -1;
    const o = info.ownerDir;
    return this.grid.node(x + (DX[o] as number), y + (DY[o] as number), z + (DZ[o] as number)) - 1;
  }

  /** Positions node `i` depends on (support, block below a gravity block, watched block). */
  private dependencyPositions(i: number, out: number[]): void {
    const info = this.nodeInfo(i);
    const x = this.nx[i] as number;
    const y = this.ny[i] as number;
    const z = this.nz[i] as number;
    out.length = 0;
    for (const d of [info.supportDir, info.gravity ? D_DOWN : -1, info.observerDir]) {
      if (d >= 0) out.push(x + (DX[d] as number), y + (DY[d] as number), z + (DZ[d] as number));
    }
  }

  /** True if node `j` is an observer watching node `i`. */
  private watches(j: number, i: number): boolean {
    const o = this.nodeInfo(j).observerDir;
    return (
      o >= 0 &&
      (this.nx[j] as number) + (DX[o] as number) === this.nx[i] &&
      (this.ny[j] as number) + (DY[o] as number) === this.ny[i] &&
      (this.nz[j] as number) + (DZ[o] as number) === this.nz[i]
    );
  }

  private buildGraph(): void {
    const n = this.count;
    const from: number[] = [];
    const to: number[] = [];
    const tmp: number[] = [];
    for (let i = 0; i < n; i++) {
      this.dependencyPositions(i, tmp);
      for (let k = 0; k < tmp.length; k += 3) {
        const j = this.nodeAt(tmp[k] as number, tmp[k + 1] as number, tmp[k + 2] as number);
        // Fluids never support anything; ignore such edges (reported at placement).
        // Mutually watching observers (observer clocks) have no valid order; skip that edge.
        if (j >= 0 && j !== i && !this.nodeInfo(j).fluid && !this.watches(j, i)) {
          from.push(j);
          to.push(i);
        }
      }
    }

    // Observers come after the watched block and everything that shapes its final state.
    for (let i = 0; i < n; i++) {
      const o = this.nodeInfo(i).observerDir;
      if (o < 0) continue;
      const wx = (this.nx[i] as number) + (DX[o] as number);
      const wy = (this.ny[i] as number) + (DY[o] as number);
      const wz = (this.nz[i] as number) + (DZ[o] as number);
      for (let d = 0; d < 6; d++) {
        const j = this.nodeAt(
          wx + (DX[d] as number),
          wy + (DY[d] as number),
          wz + (DZ[d] as number),
        );
        if (j < 0 || j === i) continue;
        const ji = this.nodeInfo(j);
        if (ji.fluid || ji.observerDir >= 0) continue;
        from.push(j);
        to.push(i);
      }
    }

    // Raise ranks along the edges: a block never comes before the phase of what it needs.
    this.rank = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.rank[i] = this.nodeInfo(i).baseRank;
    this.buildCsr(from, to);
    const queue: number[] = [];
    for (let i = 0; i < n; i++) queue.push(i);
    while (queue.length > 0) {
      const i = queue.pop() as number;
      const r = this.rank[i] as number;
      for (let e = this.depStart[i] as number; e < (this.depStart[i + 1] as number); e++) {
        const k = this.deps[e] as number;
        if ((this.rank[k] as number) < r) {
          this.rank[k] = r;
          queue.push(k);
        }
      }
    }

    // Actuators that trigger on placement come after their same-phase neighbours.
    for (let i = 0; i < n; i++) {
      if (!this.nodeInfo(i).triggers) continue;
      const x = this.nx[i] as number;
      const y = this.ny[i] as number;
      const z = this.nz[i] as number;
      for (let d = 0; d < 6; d++) {
        const j = this.nodeAt(x + (DX[d] as number), y + (DY[d] as number), z + (DZ[d] as number));
        if (j < 0 || j === i || this.rank[j] !== this.rank[i]) continue;
        const ji = this.nodeInfo(j);
        if (ji.triggers || ji.observerDir >= 0) continue;
        this.dependencyPositions(j, tmp);
        let dependsOnI = false;
        for (let k = 0; k < tmp.length; k += 3) {
          if (tmp[k] === x && tmp[k + 1] === y && tmp[k + 2] === z) dependsOnI = true;
        }
        if (!dependsOnI) {
          from.push(j);
          to.push(i);
        }
      }
    }
    this.buildCsr(from, to);
  }

  private buildCsr(from: readonly number[], to: readonly number[]): void {
    const n = this.count;
    const start = new Int32Array(n + 1);
    for (const f of from) start[f + 1] = (start[f + 1] as number) + 1;
    for (let i = 0; i < n; i++) start[i + 1] = (start[i + 1] as number) + (start[i] as number);
    const fill = start.slice(0, n);
    const deps = new Int32Array(from.length);
    const indeg = new Int32Array(n);
    for (let e = 0; e < from.length; e++) {
      const f = from[e] as number;
      const t = to[e] as number;
      deps[fill[f] as number] = t;
      fill[f] = (fill[f] as number) + 1;
      indeg[t] = (indeg[t] as number) + 1;
    }
    this.depStart = start;
    this.deps = deps;
    this.indeg = indeg;
  }

  /** Priority: rank, Y layer, 8×8 cluster (serpentine), then serpentine inside the cluster. */
  private order(): void {
    const n = this.count;
    const ids = Array.from({ length: n }, (_, i) => i);
    const key = (i: number): [number, number, number, number, number, number] => {
      const x = this.nx[i] as number;
      const z = this.nz[i] as number;
      const cx = Math.floor(x / CLUSTER);
      const cz = Math.floor(z / CLUSTER);
      return [
        this.rank[i] as number,
        this.ny[i] as number,
        cz,
        cz & 1 ? -cx : cx,
        z,
        z & 1 ? -x : x,
      ];
    };
    const keys = ids.map(key);
    ids.sort((a, b) => {
      const ka = keys[a] as number[];
      const kb = keys[b] as number[];
      for (let k = 0; k < 6; k++) {
        const diff = (ka[k] as number) - (kb[k] as number);
        if (diff !== 0) return diff;
      }
      return a - b;
    });
    this.sorted = new Int32Array(ids);
    this.ord = new Int32Array(n);
    ids.forEach((id, pos) => (this.ord[id] = pos));
  }

  // ---------------------------------------------------------------- world queries

  private infoAtWorld(x: number, y: number, z: number, w: number): StateInfo {
    return w === W_TEMP ? this.scaffold : this.info(this.grid.design(x, y, z) - 1);
  }

  private isGround(x: number, y: number, z: number): boolean {
    return y <= this.groundY && this.grid.design(x, y, z) === 0;
  }

  private occupied(x: number, y: number, z: number): boolean {
    return this.grid.world(x, y, z) !== W_AIR || this.isGround(x, y, z);
  }

  private clickable(x: number, y: number, z: number): boolean {
    const w = this.grid.world(x, y, z);
    if (w === W_AIR) return this.isGround(x, y, z);
    return this.infoAtWorld(x, y, z, w).clickable;
  }

  private standable(x: number, y: number, z: number): boolean {
    const w = this.grid.world(x, y, z);
    if (w === W_AIR) return this.isGround(x, y, z);
    if (w === W_IMPLICIT) return false;
    return this.infoAtWorld(x, y, z, w).standable;
  }

  private offersAt(x: number, y: number, z: number, face: number): FaceSupport {
    const w = this.grid.world(x, y, z);
    if (w === W_AIR) return this.isGround(x, y, z) ? 'full' : 'none';
    return this.infoAtWorld(x, y, z, w).offers[face] as FaceSupport;
  }

  /** Java `FallingBlock.isFree`: air or fluid. */
  private freeForGravity(x: number, y: number, z: number): boolean {
    const w = this.grid.world(x, y, z);
    if (w === W_AIR) return !this.isGround(x, y, z);
    return this.infoAtWorld(x, y, z, w).fluid;
  }

  private interactive(x: number, y: number, z: number): boolean {
    const w = this.grid.world(x, y, z);
    if (w === W_FINAL || w === W_IMPLICIT) return this.infoAtWorld(x, y, z, w).interactive;
    return false;
  }

  private hasClickableNeighbour(x: number, y: number, z: number, info: StateInfo): boolean {
    for (let d = 0; d < 6; d++) {
      if (
        info.maskAny[d] &&
        this.clickable(x - (DX[d] as number), y - (DY[d] as number), z - (DZ[d] as number))
      ) {
        return true;
      }
    }
    return false;
  }

  private clickOptions(x: number, y: number, z: number, info: StateInfo, sneak: boolean) {
    const plain: ClickOpt[] = [];
    const sneaky: ClickOpt[] = [];
    for (const d of CLICK_ORDER) {
      if (!info.maskAny[d]) continue;
      const cx = x - (DX[d] as number);
      const cy = y - (DY[d] as number);
      const cz = z - (DZ[d] as number);
      if (!this.clickable(cx, cy, cz)) continue;
      const needSneak = sneak || this.interactive(cx, cy, cz);
      for (const half of [HALF_NONE, HALF_TOP, HALF_BOTTOM]) {
        const mask = info.masks[d * 3 + half] as number;
        if (!mask) continue;
        const opt = { nx: cx, ny: cy, nz: cz, dir: d, half, mask, sneak: needSneak };
        (needSneak ? sneaky : plain).push(opt);
      }
    }
    return plain.concat(sneaky);
  }

  // ---------------------------------------------------------------- stand search

  /** Look index matching both the geometry and the mask, or -1. */
  private lookFor(
    ex: number,
    ey: number,
    ez: number,
    fcx: number,
    fcy: number,
    fcz: number,
    opt: ClickOpt,
  ): number {
    const aims = AIMS[opt.dir * 3 + opt.half] as readonly number[];
    for (let k = 0; k < aims.length; k += 3) {
      const vx = fcx + (aims[k] as number) - ex;
      const vy = fcy + (aims[k + 1] as number) - ey;
      const vz = fcz + (aims[k + 2] as number) - ez;
      const hx = Math.abs(vx);
      const hz = Math.abs(vz);
      const hm = hx > hz ? hx : hz;
      const av = Math.abs(vy);
      // Points on a quadrant/axis boundary are ambiguous; only use them when the look does not matter.
      if (
        opt.mask !== ALL_LOOKS &&
        (hm < 0.05 || Math.abs(hx - hz) < 0.02 || Math.abs(av - hm) < 0.02)
      ) {
        continue;
      }
      const v = av > hm ? (vy > 0 ? V_UP : V_DOWN) : V_LEVEL;
      const h = hx >= hz ? (vx > 0 ? 1 : 3) : vz > 0 ? 2 : 0;
      if (opt.mask & (1 << (h * 3 + v))) return h * 3 + v;
    }
    return -1;
  }

  /**
   * Checks one stand position for one click option.
   * Returns the look index, or -1 when out of reach, facing away or no matching look.
   */
  private evaluate(
    fx: number,
    fy: number,
    fz: number,
    x: number,
    y: number,
    z: number,
    opt: ClickOpt,
  ): number {
    const ox = DX[opt.dir] as number;
    const oy = DY[opt.dir] as number;
    const oz = DZ[opt.dir] as number;
    const fcx = x + 0.5 - 0.5 * ox;
    const fcy = y + 0.5 - 0.5 * oy;
    const fcz = z + 0.5 - 0.5 * oz;
    const ex = fx + 0.5;
    const ey = fy + EYE;
    const ez = fz + 0.5;
    const dx = fcx - ex;
    const dy = fcy - ey;
    const dz = fcz - ez;
    if (dx * dx + dy * dy + dz * dz > this.reach2) return -1;
    // The clicked face must point towards the eye.
    if (-(dx * ox + dy * oy + dz * oz) <= 1e-9) return -1;
    return this.lookFor(ex, ey, ez, fcx, fcy, fcz, opt);
  }

  private feetOk(fx: number, fy: number, fz: number): boolean {
    return (
      !this.occupied(fx, fy, fz) && !this.occupied(fx, fy + 1, fz) && this.standable(fx, fy - 1, fz)
    );
  }

  /** First valid stand position in preference order, or undefined. */
  private findStand(
    x: number,
    y: number,
    z: number,
    opts: readonly ClickOpt[],
    partnerUp: boolean,
  ): Stand | undefined {
    const off = this.offsets;
    for (let k = 0; k < off.length; k += 3) {
      const fx = x + (off[k] as number);
      const fy = y + (off[k + 1] as number);
      const fz = z + (off[k + 2] as number);
      if (fx === x && fz === z && fy >= y - 1 && fy <= y + (partnerUp ? 1 : 0)) continue;
      if (!this.feetOk(fx, fy, fz)) continue;
      for (const opt of opts) {
        const look = this.evaluate(fx, fy, fz, x, y, z, opt);
        if (look >= 0) return { fx, fy, fz, opt, look };
      }
    }
    return undefined;
  }

  // ---------------------------------------------------------------- emission

  private warn(code: WarningCode, pos: Vec3 | undefined, message: string): void {
    const key = `${code}|${pos ? `${pos.x},${pos.y},${pos.z}` : ''}|${message}`;
    if (this.warningKeys.has(key)) return;
    this.warningKeys.add(key);
    this.warnings.push(pos ? { code, pos, message } : { code, message });
  }

  private pushPlace(
    x: number,
    y: number,
    z: number,
    info: StateInfo,
    stand: Stand,
    phase: BuildPhase,
    flags: number,
    temporary: boolean,
  ): void {
    const { opt } = stand;
    const action: PlaceAction = {
      kind: 'place',
      pos: vec(x, y, z),
      state: info.state,
      item: info.item,
      standAt: vec(stand.fx, stand.fy, stand.fz),
      look: {
        horizontal: LOOK_H[Math.floor(stand.look / 3)] as PlaceAction['look']['horizontal'],
        vertical: LOOK_V[stand.look % 3] as PlaceAction['look']['vertical'],
      },
      clickOn: {
        pos: vec(opt.nx, opt.ny, opt.nz),
        face: DIRS[opt.dir] as PlaceAction['clickOn']['face'],
      },
      ...(opt.half === HALF_TOP ? { clickHalf: 'top' as const } : {}),
      ...(opt.half === HALF_BOTTOM ? { clickHalf: 'bottom' as const } : {}),
      ...(opt.sneak ? { sneak: true } : {}),
      ...(info.interactions > 0 ? { interactions: info.interactions } : {}),
      ...(temporary ? { temporary: true } : {}),
    };
    const count = temporary ? 1 : info.count;
    this.entries.push({ phase, action, count, flags });
    (temporary ? this.temporary : this.total).add(info.item, count);
    this.placements++;
  }

  /** Resolves stand/click/look for a placement (building a tower if needed) and emits it. */
  private emitPlacement(
    x: number,
    y: number,
    z: number,
    info: StateInfo,
    sneak: boolean,
    partnerUp: boolean,
    phase: BuildPhase,
    flags: number,
    temporary: boolean,
    allowTower = true,
  ): void {
    let opts = this.clickOptions(x, y, z, info, sneak);
    let stand = opts.length > 0 ? this.findStand(x, y, z, opts, partnerUp) : undefined;
    if (!stand && allowTower && opts.length > 0 && this.buildTower(x, y, z, opts, phase)) {
      opts = this.clickOptions(x, y, z, info, sneak);
      stand = this.findStand(x, y, z, opts, partnerUp);
    }
    if (!stand) {
      const pos = vec(x, y, z);
      this.warn(
        'unreachable',
        pos,
        opts.length === 0
          ? `${info.state}: no block to click on`
          : `${info.state}: no stand position within reach`,
      );
      stand = this.fallbackStand(x, y, z, info, opts, sneak);
    }
    this.pushPlace(x, y, z, info, stand, phase, flags, temporary);
  }

  private fallbackStand(
    x: number,
    y: number,
    z: number,
    info: StateInfo,
    opts: readonly ClickOpt[],
    sneak: boolean,
  ): Stand {
    let dir = D_UP;
    for (const d of CLICK_ORDER) {
      if (info.maskAny[d]) {
        dir = d;
        break;
      }
    }
    const opt: ClickOpt = opts[0] ?? {
      nx: x - (DX[dir] as number),
      ny: y - (DY[dir] as number),
      nz: z - (DZ[dir] as number),
      dir,
      half: info.masks[dir * 3] ? HALF_NONE : HALF_BOTTOM,
      mask: info.maskAny[dir] || ALL_LOOKS,
      sneak,
    };
    const off = this.offsets;
    for (let k = 0; k < off.length; k += 3) {
      const fx = x + (off[k] as number);
      const fy = y + (off[k + 1] as number);
      const fz = z + (off[k + 2] as number);
      if (fx === x && fz === z) continue;
      if (this.feetOk(fx, fy, fz)) return { fx, fy, fz, opt, look: firstLook(opt.mask) };
    }
    return { fx: x, fy: y + 1, fz: z, opt, look: firstLook(opt.mask) };
  }

  private placeTemp(x: number, y: number, z: number, phase: BuildPhase): void {
    this.emitPlacement(x, y, z, this.scaffold, false, false, phase, F_SCAFFOLD, true);
    this.grid.setWorld(x, y, z, W_TEMP);
    this.temps.push({ x, y, z });
    this.wake(x, y, z);
  }

  /**
   * A temporary block may go only where the final build has air, where its
   * removal cannot drop or detach a final block (nothing gravity-affected or
   * attached rests on it) and where no fluid can flow in after removal.
   */
  private tempAllowed(x: number, y: number, z: number): boolean {
    if (this.grid.design(x, y, z) !== 0) return false;
    for (let d = 0; d < 6; d++) {
      const n = this.grid.design(
        x + (DX[d] as number),
        y + (DY[d] as number),
        z + (DZ[d] as number),
      );
      if (n === 0) continue;
      const info = this.info(n - 1);
      if (info.fluid) return false;
      if (info.supportDir === OPP[d] || (d === D_UP && info.gravity)) return false;
    }
    return true;
  }

  /**
   * Places a temporary block at (x,y,z), with a column below it down to the
   * next block it can be clicked against. Every block of it is removed in cleanup.
   */
  private provideColumn(x: number, y: number, z: number, phase: BuildPhase): boolean {
    const column: number[] = [];
    let cy = y;
    for (;;) {
      if (this.occupied(x, cy, z) || !this.tempAllowed(x, cy, z)) return false;
      if (column.length >= MAX_COLUMN) return false;
      column.push(cy);
      if (this.hasClickableNeighbour(x, cy, z, this.scaffold)) break;
      cy--;
    }
    for (let k = column.length - 1; k >= 0; k--) this.placeTemp(x, column[k] as number, z, phase);
    return true;
  }

  // ---------------------------------------------------------------- towers

  /** First free level of a tower column below `top`, or undefined if the column is unusable. */
  private towerBase(cx: number, cz: number, top: number): number | undefined {
    let q = top;
    while (q > top - MAX_TOWER) {
      if (this.occupied(cx, q, cz)) {
        return this.standable(cx, q, cz) && this.clickable(cx, q, cz) ? q + 1 : undefined;
      }
      if (!this.tempAllowed(cx, q, cz)) return undefined;
      q--;
    }
    return undefined;
  }

  private towerReaches(
    fx: number,
    fy: number,
    fz: number,
    x: number,
    y: number,
    z: number,
    opts: readonly ClickOpt[],
  ): boolean {
    for (const opt of opts) if (this.evaluate(fx, fy, fz, x, y, z, opt) >= 0) return true;
    return false;
  }

  /**
   * Builds a 2-wide scaffold tower (cells A and B) next to the target so the
   * player can stand on top of it. Each level: from cell S place T, step onto
   * T, place S — every placement has a valid stand position.
   */
  private buildTower(
    x: number,
    y: number,
    z: number,
    opts: readonly ClickOpt[],
    phase: BuildPhase,
  ): boolean {
    {
      for (const [adx, adz] of TOWER_CELLS) {
        const ax = x + adx;
        const az = z + adz;
        for (const [bdx, bdz] of H_NEIGHBOURS) {
          const bx = ax + bdx;
          const bz = az + bdz;
          if (bx === x && bz === z) continue;
          for (const df of [-1, -2, 0, -3, 1]) {
            const feet = y + df;
            const top = feet - 1;
            const base = this.towerBase(ax, az, top);
            if (base === undefined || base > top || this.towerBase(bx, bz, top) !== base) continue;
            if (
              this.occupied(ax, feet, az) ||
              this.occupied(ax, feet + 1, az) ||
              this.occupied(bx, feet, bz) ||
              this.occupied(bx, feet + 1, bz)
            ) {
              continue;
            }
            if (
              !this.towerReaches(ax, feet, az, x, y, z, opts) &&
              !this.towerReaches(bx, feet, bz, x, y, z, opts)
            ) {
              continue;
            }
            this.emitTower(ax, az, bx, bz, base, top, phase);
            return true;
          }
        }
      }
    }
    return false;
  }

  private emitTower(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    base: number,
    top: number,
    phase: BuildPhase,
  ): void {
    for (let level = base; level <= top; level++) {
      const even = ((level - base) & 1) === 0;
      const sx = even ? ax : bx;
      const sz = even ? az : bz;
      const tx = even ? bx : ax;
      const tz = even ? bz : az;
      this.emitTowerBlock(tx, level, tz, sx, level, sz, phase);
      this.emitTowerBlock(sx, level, sz, tx, level + 1, tz, phase);
    }
  }

  private emitTowerBlock(
    x: number,
    y: number,
    z: number,
    fx: number,
    fy: number,
    fz: number,
    phase: BuildPhase,
  ): void {
    const opt: ClickOpt = {
      nx: x,
      ny: y - 1,
      nz: z,
      dir: D_UP,
      half: HALF_NONE,
      mask: ALL_LOOKS,
      sneak: false,
    };
    const look = this.lookFor(fx + 0.5, fy + EYE, fz + 0.5, x + 0.5, y, z + 0.5, opt);
    this.pushPlace(
      x,
      y,
      z,
      this.scaffold,
      { fx, fy, fz, opt, look: look >= 0 ? look : V_DOWN },
      phase,
      F_SCAFFOLD,
      true,
    );
    this.grid.setWorld(x, y, z, W_TEMP);
    this.temps.push({ x, y, z });
    this.wake(x, y, z);
  }

  // ---------------------------------------------------------------- main loop

  private feasible(i: number): boolean {
    return this.hasClickableNeighbour(
      this.nx[i] as number,
      this.ny[i] as number,
      this.nz[i] as number,
      this.nodeInfo(i),
    );
  }

  private queue!: IdHeap;
  private waiting!: IdHeap;

  /** Neighbours of a newly filled position may now have something to click on. */
  private wake(x: number, y: number, z: number): void {
    for (let d = 0; d < 6; d++) {
      const node =
        this.grid.node(x + (DX[d] as number), y + (DY[d] as number), z + (DZ[d] as number)) - 1;
      if (node >= 0 && this.status[node] === ST_WAITING) {
        this.status[node] = ST_QUEUED;
        this.queue.push(node);
      }
    }
  }

  private mainLoop(): void {
    const n = this.count;
    this.status = new Uint8Array(n);
    this.queue = new IdHeap(this.ord);
    this.waiting = new IdHeap(this.ord);
    for (let i = 0; i < n; i++) {
      if (this.indeg[i] === 0) {
        this.status[i] = ST_QUEUED;
        this.queue.push(i);
      }
    }
    let pointer = 0;
    let done = 0;
    for (;;) {
      while (pointer < n && this.status[this.sorted[pointer] as number] === ST_PLACED) pointer++;
      if (pointer >= n) break;
      const low = this.rank[this.sorted[pointer] as number] as number;

      const top = this.peekValid(this.queue, ST_QUEUED);
      if (top !== undefined && this.rank[top] === low) {
        this.queue.pop();
        if (!this.feasible(top)) {
          this.status[top] = ST_WAITING;
          this.waiting.push(top);
          continue;
        }
        this.placeNode(top);
      } else {
        const wait = this.peekValid(this.waiting, ST_WAITING);
        if (wait !== undefined && this.rank[wait] === low) {
          this.waiting.pop();
          this.placeNode(wait);
        } else {
          const node = this.sorted[pointer] as number;
          this.warn(
            'cycle',
            this.posOf(node),
            `${this.nodeInfo(node).state}: dependency cycle, placed early`,
          );
          this.placeNode(node);
        }
      }
      done++;
      if (this.onProgress && done % PROGRESS_EVERY === 0) this.onProgress(done, n);
    }
    this.onProgress?.(n, n);
  }

  private peekValid(heap: IdHeap, wanted: number): number | undefined {
    for (;;) {
      const top = heap.peek();
      if (top === undefined || this.status[top] === wanted) return top;
      heap.pop();
    }
  }

  private placeNode(i: number): void {
    const info = this.nodeInfo(i);
    const x = this.nx[i] as number;
    const y = this.ny[i] as number;
    const z = this.nz[i] as number;
    const pos = vec(x, y, z);
    const rank = this.rank[i] as number;
    const phase = RANK_PHASE[rank] as BuildPhase;
    this.status[i] = ST_PLACED;
    if (info.unknown) this.warn('unknown-block', pos, `${info.state} is not in the registry`);
    for (const issue of info.issues) this.warn('unsupported-state', pos, issue);

    let flags = 0;
    if (info.lookDependent) flags |= F_LOOK;
    if (info.interactions > 0) flags |= F_INTERACT;
    if (info.observerDir >= 0) flags |= F_OBSERVER;

    // Gravity: something non-free must be below. A temporary support would be
    // removed later and drop the block, so an unsupported design is only reported.
    if (info.gravity && this.freeForGravity(x, y - 1, z)) {
      this.warn('unsupported-state', pos, `${info.state} has nothing below and will fall`);
    }

    // Attachment: the support block must exist and offer enough support.
    if (info.supportDir >= 0) {
      const d = info.supportDir;
      const sx = x + (DX[d] as number);
      const sy = y + (DY[d] as number);
      const sz = z + (DZ[d] as number);
      if (!this.occupied(sx, sy, sz)) {
        this.warn('unsupported-state', pos, `${info.state}: support block is missing`);
      } else if (
        !satisfiesSupport(this.offersAt(sx, sy, sz, OPP[d] as number), info.supportNeeds)
      ) {
        this.warn(
          'unsupported-state',
          pos,
          `${info.state}: the supporting face does not offer ${info.supportNeeds} support`,
        );
      }
    }

    // Something to click on.
    if (!this.hasClickableNeighbour(x, y, z, info)) {
      for (const d of CLICK_ORDER) {
        if (!info.maskAny[d]) continue;
        const cx = x - (DX[d] as number);
        const cy = y - (DY[d] as number);
        const cz = z - (DZ[d] as number);
        if (this.provideColumn(cx, cy, cz, phase)) break;
      }
    }

    if (info.fluid) {
      // Only prepare scaffolding now; the source itself is placed in placeFluids().
      const opts = this.clickOptions(x, y, z, info, false);
      if (opts.length > 0 && !this.findStand(x, y, z, opts, false)) {
        this.buildTower(x, y, z, opts, phase);
      }
      this.fluidNodes.push(i);
      this.release(i);
      return;
    }

    const upper = this.grid.design(x, y + 1, z);
    const upperInfo = upper > 0 ? this.info(upper - 1) : undefined;
    const partnerUp = upperInfo?.kind === 'implicit' && upperInfo.ownerDir === D_DOWN;
    this.emitPlacement(
      x,
      y,
      z,
      info,
      this.chestSneak(x, y, z, info),
      partnerUp,
      phase,
      flags,
      false,
    );

    this.grid.setWorld(x, y, z, W_FINAL);
    this.wake(x, y, z);
    if (partnerUp) {
      this.grid.setWorld(x, y + 1, z, W_IMPLICIT);
      this.wake(x, y + 1, z);
    }
    this.release(i);
  }

  /** Marks the dependents of a placed node. */
  private release(i: number): void {
    for (let e = this.depStart[i] as number; e < (this.depStart[i + 1] as number); e++) {
      const k = this.deps[e] as number;
      this.indeg[k] = (this.indeg[k] as number) - 1;
      if (this.indeg[k] === 0 && this.status[k] === ST_BLOCKED) {
        this.status[k] = ST_QUEUED;
        this.queue.push(k);
      }
    }
  }

  /** Places all fluid sources after every other placement (scaffolding is already built). */
  private placeFluids(): void {
    const f = this.flowing;
    for (let k = 0; k < f.length; k += 3) {
      this.grid.setWorld(f[k] as number, f[k + 1] as number, f[k + 2] as number, W_FINAL);
    }
    for (const i of this.fluidNodes) {
      const x = this.nx[i] as number;
      const y = this.ny[i] as number;
      const z = this.nz[i] as number;
      const info = this.nodeInfo(i);
      this.emitPlacement(x, y, z, info, false, false, 'fluids', 0, false, false);
      this.grid.setWorld(x, y, z, W_FINAL);
    }
  }

  /** A single chest next to a chest with the same facing must be placed sneaking. */
  private chestSneak(x: number, y: number, z: number, info: StateInfo): boolean {
    if (info.def?.id !== 'minecraft:chest' || info.props['type'] !== 'single') return false;
    for (const [dx, dz] of H_NEIGHBOURS) {
      const d = this.grid.design(x + dx, y, z + dz);
      if (d === 0) continue;
      const other = this.info(d - 1);
      if (other.def?.id === 'minecraft:chest' && other.props['facing'] === info.props['facing']) {
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------- cleanup

  private cleanup(): number {
    const removable = this.temps.map((t, seq) => ({ ...t, seq }));
    removable.sort((a, b) => b.y - a.y || b.seq - a.seq);
    for (const t of removable) {
      this.entries.push({
        phase: 'cleanup',
        action: {
          kind: 'remove',
          pos: vec(t.x, t.y, t.z),
          state: this.scaffold.state,
          reason: 'scaffold',
        },
        count: 0,
        flags: F_SCAFFOLD,
      });
      this.grid.setWorld(t.x, t.y, t.z, W_AIR);
    }
    return removable.length;
  }
}

/** Computes a survival build plan; see the module comment for the algorithm. */
export function planBuildWithProgress(
  doc: BuildDocument,
  registry: BlockRegistry,
  options?: Partial<BuildOrderOptions>,
  onProgress?: PlanProgressFn,
): BuildPlan {
  return new Planner(doc, registry, options, onProgress).run();
}

export const planBuild: PlanBuildFn = (doc, registry, options) =>
  planBuildWithProgress(doc, registry, options);
