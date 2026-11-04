import {
  type BlockState,
  type BlockStateString,
  parseBlockState,
  stringifyBlockState,
} from '../blockstate/blockstate';
import type { Direction, HorizontalDirection } from '../math/direction';
import type { BlockRegistry } from '../registry/types';

/**
 * Blockstate rotation and mirroring with Java Edition structure semantics
 * (`BlockState.rotate(Rotation)` / `BlockState.mirror(Mirror)`).
 *
 * Conventions:
 * - `quarterTurns` rotates around the Y axis, positive = clockwise seen from
 *   above (Java `Rotation.CLOCKWISE_90`: north → east → south → west).
 * - `mirror(axis: 'x')` flips the X coordinate (east ↔ west, Java `Mirror.FRONT_BACK`);
 *   `mirror(axis: 'z')` flips the Z coordinate (north ↔ south, Java `Mirror.LEFT_RIGHT`).
 *
 * Deliberate deviation: Java's `StairBlock.mirror` leaves `shape` untouched for
 * some facing/mirror combinations and relies on the following neighbour shape
 * update. We always swap left/right, which is the geometrically correct result
 * (and what the world shows after that shape update).
 */

export type MirrorAxis = 'x' | 'z';

const CLOCKWISE: Readonly<Record<HorizontalDirection, HorizontalDirection>> = {
  north: 'east',
  east: 'south',
  south: 'west',
  west: 'north',
};

const isHorizontal = (v: string): v is HorizontalDirection => Object.hasOwn(CLOCKWISE, v);

/** Rotates a direction clockwise (seen from above) by `quarterTurns`; up/down are unchanged. */
export function rotateDirectionY<D extends Direction>(dir: D, quarterTurns: number): D {
  if (!isHorizontal(dir)) return dir;
  let d: HorizontalDirection = dir;
  for (let i = 0; i < normalizeTurns(quarterTurns); i++) d = CLOCKWISE[d];
  return d as D;
}

/** Mirrors a direction: axis `x` swaps east/west, axis `z` swaps north/south. */
export function mirrorDirection<D extends Direction>(dir: D, axis: MirrorAxis): D {
  if (axis === 'x') {
    if (dir === 'east') return 'west' as D;
    if (dir === 'west') return 'east' as D;
  } else {
    if (dir === 'north') return 'south' as D;
    if (dir === 'south') return 'north' as D;
  }
  return dir;
}

/** Normalizes any integer number of quarter turns to 0..3. */
export function normalizeTurns(quarterTurns: number): 0 | 1 | 2 | 3 {
  if (!Number.isInteger(quarterTurns))
    throw new RangeError(`Invalid quarter turns ${quarterTurns}`);
  return (((quarterTurns % 4) + 4) % 4) as 0 | 1 | 2 | 3;
}

type DirMap = (d: Direction) => Direction;

const RAIL_STRAIGHT: Readonly<Record<string, readonly [Direction, Direction]>> = {
  north_south: ['north', 'south'],
  east_west: ['east', 'west'],
};
const RAIL_CURVES = new Set(['south_east', 'south_west', 'north_west', 'north_east']);

/** Maps a rail `shape` value through a direction transform. Unknown values pass through. */
function mapRailShape(shape: string, map: DirMap): string {
  if (shape.startsWith('ascending_')) {
    const dir = shape.slice('ascending_'.length);
    return isHorizontal(dir) ? `ascending_${map(dir)}` : shape;
  }
  const straight = RAIL_STRAIGHT[shape];
  if (straight) {
    const d = map(straight[0]);
    return d === 'north' || d === 'south' ? 'north_south' : 'east_west';
  }
  if (RAIL_CURVES.has(shape)) {
    const [a, b] = shape.split('_') as [Direction, Direction];
    const dirs = [map(a), map(b)];
    const ns = dirs.find((d) => d === 'north' || d === 'south');
    const ew = dirs.find((d) => d === 'east' || d === 'west');
    return ns && ew ? `${ns}_${ew}` : shape;
  }
  return shape;
}

const STAIR_SHAPE_SWAP: Readonly<Record<string, string>> = {
  inner_left: 'inner_right',
  inner_right: 'inner_left',
  outer_left: 'outer_right',
  outer_right: 'outer_left',
};

const isRailShape = (v: string): boolean =>
  v.startsWith('ascending_') || Object.hasOwn(RAIL_STRAIGHT, v) || RAIL_CURVES.has(v);

const SIDE_KEYS: readonly HorizontalDirection[] = ['north', 'east', 'south', 'west'];

interface Transform {
  readonly dir: DirMap;
  /** True for mirrors: handedness (left/right) flips. */
  readonly flipsHandedness: boolean;
  /** Odd number of quarter turns: x and z axes swap. */
  readonly swapsAxes: boolean;
  /** Maps the 16-step `rotation` property (0 = south, clockwise). */
  readonly rotation16: (r: number) => number;
}

function transformState(registry: BlockRegistry, input: BlockStateString, t: Transform) {
  const state = parseBlockState(input);
  const def = registry.get(state.id);
  const allowed = (key: string, value: string): boolean => {
    if (!def) return true;
    const prop = Object.hasOwn(def.properties, key) ? def.properties[key] : undefined;
    return prop !== undefined && prop.values.includes(value);
  };
  const src = state.properties;
  const out: Record<string, string> = { ...src };
  const set = (key: string, value: string): void => {
    // Keep the original value if the transformed one is not valid for this block.
    if (allowed(key, value)) out[key] = value;
  };

  for (const [key, value] of Object.entries(src)) {
    switch (key) {
      case 'facing':
        if (isHorizontal(value)) set(key, t.dir(value));
        break;
      case 'axis':
        if (t.swapsAxes && (value === 'x' || value === 'z')) set(key, value === 'x' ? 'z' : 'x');
        break;
      case 'rotation': {
        const r = Number(value);
        if (Number.isInteger(r) && r >= 0 && r < 16) set(key, String(t.rotation16(r)));
        break;
      }
      case 'shape':
        if (Object.hasOwn(STAIR_SHAPE_SWAP, value)) {
          if (t.flipsHandedness) set(key, STAIR_SHAPE_SWAP[value] as string);
        } else if (isRailShape(value)) {
          set(key, mapRailShape(value, t.dir));
        }
        break;
      case 'hinge':
      case 'type':
        // Door hinge and chest halves: handedness only changes on mirrors.
        if (t.flipsHandedness && (value === 'left' || value === 'right')) {
          set(key, value === 'left' ? 'right' : 'left');
        }
        break;
      default:
        break;
    }
  }

  // Side connections (fences, panes, walls, redstone wire): move values with their side.
  if (SIDE_KEYS.every((k) => Object.hasOwn(src, k))) {
    const moved: Record<string, string> = {};
    for (const k of SIDE_KEYS) moved[t.dir(k)] = src[k] as string;
    if (SIDE_KEYS.every((k) => allowed(k, moved[k] as string))) {
      for (const k of SIDE_KEYS) out[k] = moved[k] as string;
    }
  }

  const result: BlockState = { id: state.id, properties: out };
  return stringifyBlockState(result);
}

/**
 * Rotates a blockstate around the Y axis by `quarterTurns` × 90° clockwise
 * (seen from above). Returns a canonical state; for registry blocks every
 * transformed value is valid (values the block does not allow are left unchanged).
 */
export function rotateStateY(
  registry: BlockRegistry,
  state: BlockStateString,
  quarterTurns: number,
): BlockStateString {
  const turns = normalizeTurns(quarterTurns);
  if (turns === 0) return stringifyBlockState(parseBlockState(state));
  return transformState(registry, state, {
    dir: (d) => rotateDirectionY(d, turns),
    flipsHandedness: false,
    swapsAxes: turns % 2 === 1,
    rotation16: (r) => (r + turns * 4) % 16,
  });
}

/**
 * Mirrors a blockstate: axis `x` flips east/west, axis `z` flips north/south.
 * Returns a canonical state (see {@link rotateStateY}).
 */
export function mirrorState(
  registry: BlockRegistry,
  state: BlockStateString,
  axis: MirrorAxis,
): BlockStateString {
  return transformState(registry, state, {
    dir: (d) => mirrorDirection(d, axis),
    flipsHandedness: true,
    swapsAxes: false,
    // 0 = south, 4 = west, 8 = north, 12 = east.
    rotation16: axis === 'x' ? (r) => (16 - r) % 16 : (r) => (24 - r) % 16,
  });
}
