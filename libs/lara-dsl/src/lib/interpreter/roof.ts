import {
  type BlockRegistry,
  type BlockStateString,
  type Box3,
  type HorizontalDirection,
  parseBlockState,
  resolveBlockState,
} from '@laracraft/core-model';
import type { Pos, RoofType } from '../types';

/**
 * Roof geometry (pure; no document access).
 *
 * Footprint = region X/Z extended by `overhang` on every side; the roof starts at
 * `region.max.y + 1`. Distances are measured in rows from the eaves. With pitch `p`, a row
 * at distance `e` occupies layers `p·e … p·e + p − 1`: `p − 1` full blocks topped by one
 * bottom-half stair facing up-slope (Java: `facing` points to the stair's high back side).
 * Rows where the slopes meet on a single row (odd span) are the ridge: `p` full blocks.
 *
 * - gable: rows across `ridgeAxis`; the two triangular ends (planes at region.min/max of the
 *   ridge axis, within the region's span) are filled with `block` below the slope.
 * - hip: distance = min distance to all four footprint edges; corners on the hip lines are
 *   stairs facing in a clockwise pinwheel (NW→east, NE→south, SE→west, SW→north), which makes
 *   Java's own neighbour shape rule produce outer corners; ridge cells (two opposite edges
 *   equally near) are full blocks.
 * - shed: one slope rising towards north (ridgeAxis x) or west (ridgeAxis z); both side ends
 *   and the tall wall below the high edge are filled with `block`.
 * - flat: one layer of `block`.
 *
 * Stair `shape`s are computed afterwards with Java's `StairBlock.getStairsShape` over the
 * roof's own cells, so the result equals what the game shows after neighbour updates.
 */

export interface RoofSpec {
  readonly box: Box3;
  readonly type: RoofType;
  readonly pitch: 1 | 2;
  readonly ridgeAxis: 'x' | 'z';
  readonly overhang: number;
}

export type RoofCell =
  | { readonly pos: Pos; readonly kind: 'block' }
  | {
      readonly pos: Pos;
      readonly kind: 'stair';
      readonly facing: HorizontalDirection;
      shape?: StairShape;
    };

export type StairShape = 'straight' | 'inner_left' | 'inner_right' | 'outer_left' | 'outer_right';

const DIR: Readonly<Record<HorizontalDirection, { x: number; z: number }>> = {
  north: { x: 0, z: -1 },
  south: { x: 0, z: 1 },
  west: { x: -1, z: 0 },
  east: { x: 1, z: 0 },
};
const OPPOSITE: Readonly<Record<HorizontalDirection, HorizontalDirection>> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};
const CCW: Readonly<Record<HorizontalDirection, HorizontalDirection>> = {
  north: 'west',
  west: 'south',
  south: 'east',
  east: 'north',
};
const axisOf = (d: HorizontalDirection): 'x' | 'z' => (d === 'east' || d === 'west' ? 'x' : 'z');

/** Default ridge axis: along the longer side of the footprint (x on ties). */
export function defaultRidgeAxis(box: Box3): 'x' | 'z' {
  return box.max.x - box.min.x >= box.max.z - box.min.z ? 'x' : 'z';
}

export function roofFootprint(spec: RoofSpec): Box3 {
  const o = spec.overhang;
  const { min, max } = spec.box;
  return {
    min: { x: min.x - o, y: max.y + 1, z: min.z - o },
    max: { x: max.x + o, y: max.y + 1, z: max.z + o },
  };
}

/** Number of layers the roof occupies. */
export function roofHeight(spec: RoofSpec): number {
  const f = roofFootprint(spec);
  const w = f.max.x - f.min.x + 1;
  const d = f.max.z - f.min.z + 1;
  switch (spec.type) {
    case 'flat':
      return 1;
    case 'gable':
      return spec.pitch * Math.ceil((spec.ridgeAxis === 'x' ? d : w) / 2);
    case 'hip':
      return spec.pitch * Math.ceil(Math.min(w, d) / 2);
    case 'shed':
      return spec.pitch * (spec.ridgeAxis === 'x' ? d : w);
  }
}

/** Bounding box of every cell the roof writes. */
export function roofBounds(spec: RoofSpec): Box3 {
  const f = roofFootprint(spec);
  return { min: f.min, max: { ...f.max, y: f.min.y + roofHeight(spec) - 1 } };
}

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** Computes the roof cells (deterministic order: Y, then Z, then X). */
export function roofCells(spec: RoofSpec): RoofCell[] {
  const cells = new Map<string, RoofCell>();
  const f = roofFootprint(spec);
  const base = f.min.y;
  const p = spec.pitch;
  const put = (
    x: number,
    y: number,
    z: number,
    cell: { kind: 'block' } | { kind: 'stair'; facing: HorizontalDirection },
  ): void => {
    cells.set(key(x, y, z), { ...cell, pos: { x, y, z } } as RoofCell);
  };
  /** Row at distance e: p−1 blocks and a stair, or p blocks for a ridge row. */
  const column = (x: number, z: number, e: number, facing: HorizontalDirection | null): void => {
    const y0 = base + p * e;
    for (let j = 0; j < p - 1; j++) put(x, y0 + j, z, { kind: 'block' });
    if (facing) put(x, y0 + p - 1, z, { kind: 'stair', facing });
    else put(x, y0 + p - 1, z, { kind: 'block' });
  };
  /** Fills layers base … base + top − 1 with blocks (gable ends, shed walls). */
  const fillBelow = (x: number, z: number, top: number): void => {
    for (let y = base; y < base + top; y++) {
      if (!cells.has(key(x, y, z))) put(x, y, z, { kind: 'block' });
    }
  };

  switch (spec.type) {
    case 'flat':
      for (let z = f.min.z; z <= f.max.z; z++) {
        for (let x = f.min.x; x <= f.max.x; x++) put(x, base, z, { kind: 'block' });
      }
      break;
    case 'gable': {
      // "Across" = the axis perpendicular to the ridge; rows are indexed along it.
      const alongX = spec.ridgeAxis === 'x';
      const [a0, a1] = alongX ? [f.min.z, f.max.z] : [f.min.x, f.max.x];
      const [l0, l1] = alongX ? [f.min.x, f.max.x] : [f.min.z, f.max.z];
      const span = a1 - a0 + 1;
      const [lowSide, highSide]: HorizontalDirection[] = alongX
        ? ['south', 'north']
        : ['east', 'west'];
      for (let a = a0; a <= a1; a++) {
        const r = a - a0;
        const e = Math.min(r, span - 1 - r);
        const facing = r === span - 1 - r ? null : r < span - 1 - r ? lowSide : highSide;
        for (let l = l0; l <= l1; l++) {
          if (alongX) column(l, a, e, facing ?? null);
          else column(a, l, e, facing ?? null);
        }
      }
      const ends = alongX ? [spec.box.min.x, spec.box.max.x] : [spec.box.min.z, spec.box.max.z];
      const [s0, s1] = alongX ? [spec.box.min.z, spec.box.max.z] : [spec.box.min.x, spec.box.max.x];
      for (const l of new Set(ends)) {
        for (let a = s0; a <= s1; a++) {
          const r = a - a0;
          const e = Math.min(r, span - 1 - r);
          if (alongX) fillBelow(l, a, p * e);
          else fillBelow(a, l, p * e);
        }
      }
      break;
    }
    case 'shed': {
      const alongX = spec.ridgeAxis === 'x';
      // High edge at min Z (north) for ridge x, at min X (west) for ridge z.
      const facing: HorizontalDirection = alongX ? 'north' : 'west';
      const [a0, a1] = alongX ? [f.min.z, f.max.z] : [f.min.x, f.max.x];
      const [l0, l1] = alongX ? [f.min.x, f.max.x] : [f.min.z, f.max.z];
      for (let a = a0; a <= a1; a++) {
        const r = a1 - a;
        for (let l = l0; l <= l1; l++) {
          if (alongX) column(l, a, r, facing);
          else column(a, l, r, facing);
        }
      }
      const ends = alongX ? [spec.box.min.x, spec.box.max.x] : [spec.box.min.z, spec.box.max.z];
      const [s0, s1] = alongX ? [spec.box.min.z, spec.box.max.z] : [spec.box.min.x, spec.box.max.x];
      for (const l of new Set(ends)) {
        for (let a = s0; a <= s1; a++) {
          if (alongX) fillBelow(l, a, p * (a1 - a));
          else fillBelow(a, l, p * (a1 - a));
        }
      }
      const tall = alongX ? spec.box.min.z : spec.box.min.x;
      const [t0, t1] = alongX ? [spec.box.min.x, spec.box.max.x] : [spec.box.min.z, spec.box.max.z];
      for (let l = t0; l <= t1; l++) {
        if (alongX) fillBelow(l, tall, p * (a1 - tall));
        else fillBelow(tall, l, p * (a1 - tall));
      }
      break;
    }
    case 'hip': {
      for (let z = f.min.z; z <= f.max.z; z++) {
        for (let x = f.min.x; x <= f.max.x; x++) {
          const dN = z - f.min.z;
          const dS = f.max.z - z;
          const dW = x - f.min.x;
          const dE = f.max.x - x;
          const e = Math.min(dN, dS, dW, dE);
          const n = dN === e;
          const s = dS === e;
          const w = dW === e;
          const east = dE === e;
          let facing: HorizontalDirection | null;
          if ((n && s) || (w && east)) facing = null;
          else if (n && w) facing = 'east';
          else if (n && east) facing = 'south';
          else if (s && east) facing = 'west';
          else if (s && w) facing = 'north';
          else if (n) facing = 'south';
          else if (s) facing = 'north';
          else if (w) facing = 'east';
          else facing = 'west';
          column(x, z, e, facing);
        }
      }
      break;
    }
  }

  // Java stair shapes over the roof's own cells (all stairs are bottom half).
  const stairAt = (x: number, y: number, z: number): HorizontalDirection | undefined => {
    const c = cells.get(key(x, y, z));
    return c && c.kind === 'stair' ? c.facing : undefined;
  };
  const shaped = new Map<string, RoofCell>();
  for (const [k, c] of cells) {
    if (c.kind !== 'stair') {
      shaped.set(k, c);
      continue;
    }
    shaped.set(k, { ...c, shape: javaStairShape(c.pos, c.facing, stairAt) });
  }
  return [...shaped.values()].sort(
    (a, b) => a.pos.y - b.pos.y || a.pos.z - b.pos.z || a.pos.x - b.pos.x,
  );
}

/**
 * Java Edition `StairBlock.getStairsShape` for a bottom-half stair, given the facings of
 * same-half stairs around it (`undefined` = no stair).
 */
export function javaStairShape(
  pos: Pos,
  facing: HorizontalDirection,
  stairAt: (x: number, y: number, z: number) => HorizontalDirection | undefined,
): StairShape {
  const at = (d: HorizontalDirection) => stairAt(pos.x + DIR[d].x, pos.y, pos.z + DIR[d].z);
  const canTakeShape = (d: HorizontalDirection) => at(d) !== facing;
  const front = at(facing);
  if (front !== undefined && axisOf(front) !== axisOf(facing) && canTakeShape(OPPOSITE[front])) {
    return front === CCW[facing] ? 'outer_left' : 'outer_right';
  }
  const back = at(OPPOSITE[facing]);
  if (back !== undefined && axisOf(back) !== axisOf(facing) && canTakeShape(back)) {
    return back === CCW[facing] ? 'inner_left' : 'inner_right';
  }
  return 'straight';
}

/**
 * Resolves roof cells to states: stairs get `facing`, `half=bottom` and their shape on top
 * of the given stairs state (other properties such as `waterlogged` are kept).
 */
export function roofStates(
  registry: BlockRegistry,
  cells: readonly RoofCell[],
  stairs: BlockStateString,
  block: BlockStateString,
): { pos: Pos; state: BlockStateString }[] {
  const base = parseBlockState(stairs);
  const cache = new Map<string, BlockStateString>();
  return cells.map((c) => {
    if (c.kind === 'block') return { pos: c.pos, state: block };
    const shape = c.shape ?? 'straight';
    const k = `${c.facing}|${shape}`;
    let state = cache.get(k);
    if (state === undefined) {
      const resolved = resolveBlockState(registry, {
        id: base.id,
        properties: { ...base.properties, facing: c.facing, half: 'bottom', shape },
      });
      if (!resolved.ok) throw new Error(`Invalid roof stair state: ${resolved.error}`);
      state = resolved.state;
      cache.set(k, state);
    }
    return { pos: c.pos, state };
  });
}
