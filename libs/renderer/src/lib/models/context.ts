import type { BlockDefinition, Direction, HorizontalDirection } from '@laracraft/core-model';
import type { FaceTexMap, Quad } from './geometry';

/** Registry face textures plus the generic `side` texture. */
export interface BlockFaceTextures extends FaceTexMap {
  readonly side: string;
}

/** Everything a model builder needs for one blockstate. */
export interface ModelContext {
  readonly def: BlockDefinition;
  /** Fully resolved properties (defaults filled in). */
  readonly props: Readonly<Record<string, string>>;
  /** Texture names from `render.textures` (not yet checked against the texture array). */
  readonly faces: BlockFaceTextures;
  /** Whether a texture name exists in the texture array. */
  has(name: string): boolean;
  /** First available texture name; falls back to the first candidate (rendered as `missing`). */
  pick(...names: string[]): string;
}

export type ModelBuilder = (ctx: ModelContext) => Quad[];

export const MISSING_TEXTURE = 'missing';

/** Per-face texture names of a block from its registry `render.textures`. */
export function blockFaceTextures(def: BlockDefinition | undefined): BlockFaceTextures {
  const t = def?.render.textures;
  const all = (name: string): BlockFaceTextures => ({
    up: name,
    down: name,
    north: name,
    south: name,
    west: name,
    east: name,
    side: name,
  });
  if (!t) return all(MISSING_TEXTURE);
  if ('all' in t) return all(t.all);
  if ('top' in t) return { ...all(t.side), up: t.top, down: t.bottom };
  if ('end' in t) return { ...all(t.side), up: t.end, down: t.end };
  const f = t.faces;
  const side = f.side ?? f.north ?? MISSING_TEXTURE;
  return {
    side,
    up: f.up ?? side,
    down: f.down ?? side,
    north: f.north ?? side,
    south: f.south ?? side,
    west: f.west ?? side,
    east: f.east ?? side,
  };
}

const Y_FROM_NORTH: Readonly<Record<HorizontalDirection, number>> = {
  north: 0,
  east: 90,
  south: 180,
  west: 270,
};

export function horizontal(value: string | undefined, fallback: HorizontalDirection = 'north') {
  return value === 'north' || value === 'east' || value === 'south' || value === 'west'
    ? value
    : fallback;
}

export function direction(value: string | undefined, fallback: Direction = 'north'): Direction {
  return value === 'up' || value === 'down' ? value : horizontal(value, horizontal(fallback));
}

/**
 * Clockwise Y rotation (degrees, seen from above) that turns a model built for
 * `base` facing into one for `facing`.
 */
export function yRotation(base: HorizontalDirection, facing: string | undefined): number {
  return (Y_FROM_NORTH[horizontal(facing)] - Y_FROM_NORTH[base] + 360) % 360;
}

/** Integer property with clamping. */
export function intProp(value: string | undefined, min: number, max: number, fallback: number) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
