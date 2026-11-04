import { DIRECTION_OFFSET, OPPOSITE, type Direction, type Vec3 } from '@laracraft/core-model';

/**
 * Position and direction helpers with Java Edition iteration orders.
 *
 * Direction semantics used throughout the simulator follow the decompiled Java code:
 * a block's `getSignal(pos, dir)` is asked by the neighbour at `pos - dir`, i.e. `dir` is the
 * direction *from the asking block towards the emitter* (`level.getSignal(pos.relative(d), d)`).
 * Source: https://minecraft.wiki/w/Redstone_mechanics (power sources and directions).
 */

export type Pos = Vec3;

/**
 * Map key of a position. Small coordinates (|v| < 512) map to a small integer (fast V8
 * "Smi" map keys), larger ones (|x|,|z| < 2^19, |y| < 2^10) to a float above 2^30, anything
 * else to a string. The three ranges never collide.
 */
export type PosKey = number | string;

const SMALL = 512;
const XZ = 2 ** 19;
const Y = 2 ** 10;

export const posKey = (p: Pos): PosKey => {
  const { x, y, z } = p;
  if (x >= -SMALL && x < SMALL && y >= -SMALL && y < SMALL && z >= -SMALL && z < SMALL) {
    return ((x + SMALL) << 20) | ((y + SMALL) << 10) | (z + SMALL);
  }
  if (x >= -XZ && x < XZ && z >= -XZ && z < XZ && y >= -Y && y < Y) {
    return 2 ** 30 + (x + XZ) * 2 ** 32 + (y + Y) * 2 ** 21 + (z + XZ);
  }
  return `${x},${y},${z}`;
};

export const rel = (p: Pos, d: Direction, n = 1): Pos => {
  const o = DIRECTION_OFFSET[d];
  return { x: p.x + o.x * n, y: p.y + o.y * n, z: p.z + o.z * n };
};

export const above = (p: Pos): Pos => ({ x: p.x, y: p.y + 1, z: p.z });
export const below = (p: Pos): Pos => ({ x: p.x, y: p.y - 1, z: p.z });

export const samePos = (a: Pos, b: Pos): boolean => a.x === b.x && a.y === b.y && a.z === b.z;

export const opposite = (d: Direction): Direction => OPPOSITE[d];

/** Java `Direction.values()`: DOWN, UP, NORTH, SOUTH, WEST, EAST. */
export const JAVA_DIRECTIONS: readonly Direction[] = [
  'down',
  'up',
  'north',
  'south',
  'west',
  'east',
];

/** Java `Direction.Plane.HORIZONTAL`: NORTH, EAST, SOUTH, WEST. */
export const JAVA_HORIZONTAL: readonly Direction[] = ['north', 'east', 'south', 'west'];

/**
 * Java neighbour (block) update order: west, east, down, up, north, south
 * (`NeighborUpdater.UPDATE_ORDER`). Source: https://minecraft.wiki/w/Block_update
 */
export const NEIGHBOUR_UPDATE_ORDER: readonly Direction[] = [
  'west',
  'east',
  'down',
  'up',
  'north',
  'south',
];

/**
 * Java shape (post-placement) update order: west, east, north, south, down, up
 * (`BlockBehaviour.UPDATE_SHAPE_ORDER`). Source: https://minecraft.wiki/w/Block_update
 */
export const SHAPE_UPDATE_ORDER: readonly Direction[] = [
  'west',
  'east',
  'north',
  'south',
  'down',
  'up',
];

const CW: Readonly<Record<string, Direction>> = {
  north: 'east',
  east: 'south',
  south: 'west',
  west: 'north',
};
const CCW: Readonly<Record<string, Direction>> = {
  north: 'west',
  west: 'south',
  south: 'east',
  east: 'north',
};

/** Clockwise around Y (seen from above), Java `Direction.getClockWise()`. */
export const clockWise = (d: Direction): Direction => CW[d] ?? d;
export const counterClockWise = (d: Direction): Direction => CCW[d] ?? d;

export const axisOf = (d: Direction): 'x' | 'y' | 'z' =>
  d === 'west' || d === 'east' ? 'x' : d === 'up' || d === 'down' ? 'y' : 'z';

export const isHorizontal = (d: Direction): boolean => d !== 'up' && d !== 'down';

/** Java `Direction.get3DDataValue()` (used as block event parameter). */
export const DATA_3D: Readonly<Record<Direction, number>> = {
  down: 0,
  up: 1,
  north: 2,
  south: 3,
  west: 4,
  east: 5,
};
export const FROM_3D: readonly Direction[] = JAVA_DIRECTIONS;
