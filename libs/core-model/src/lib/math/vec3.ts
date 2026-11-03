/** Integer block coordinate. Y is up (Minecraft convention). */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const addVec3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

export const equalsVec3 = (a: Vec3, b: Vec3): boolean => a.x === b.x && a.y === b.y && a.z === b.z;

/** Stable string key, e.g. for Map/Set usage. */
export const vec3Key = (v: Vec3): string => `${v.x},${v.y},${v.z}`;

/** Axis-aligned box, `min` inclusive, `max` inclusive. */
export interface Box3 {
  readonly min: Vec3;
  readonly max: Vec3;
}

export const boxSize = (b: Box3): Vec3 => ({
  x: b.max.x - b.min.x + 1,
  y: b.max.y - b.min.y + 1,
  z: b.max.z - b.min.z + 1,
});
