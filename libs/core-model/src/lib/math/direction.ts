import type { Vec3 } from './vec3';

/** The six block faces, named exactly like Java Edition blockstate values. */
export type Direction = 'down' | 'up' | 'north' | 'south' | 'west' | 'east';
export type HorizontalDirection = 'north' | 'south' | 'west' | 'east';

export const DIRECTIONS: readonly Direction[] = ['down', 'up', 'north', 'south', 'west', 'east'];
export const HORIZONTAL_DIRECTIONS: readonly HorizontalDirection[] = [
  'north',
  'east',
  'south',
  'west',
];

/** Java Edition: north = -Z, south = +Z, west = -X, east = +X. */
export const DIRECTION_OFFSET: Readonly<Record<Direction, Vec3>> = {
  down: { x: 0, y: -1, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  north: { x: 0, y: 0, z: -1 },
  south: { x: 0, y: 0, z: 1 },
  west: { x: -1, y: 0, z: 0 },
  east: { x: 1, y: 0, z: 0 },
};

export const OPPOSITE: Readonly<Record<Direction, Direction>> = {
  down: 'up',
  up: 'down',
  north: 'south',
  south: 'north',
  west: 'east',
  east: 'west',
};

export const isDirection = (v: string): v is Direction =>
  (DIRECTIONS as readonly string[]).includes(v);
