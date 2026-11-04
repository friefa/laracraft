import {
  parseBlockState,
  type BlockRegistry,
  type BlockState,
  type BlockStateString,
  type BlockTextures,
  type Direction,
} from '@laracraft/core-model';
import type { FaceTextures, PaletteRenderInfo, TintKind } from './types';

/** Texture name used for unknown blocks and unknown texture names. */
export const MISSING_TEXTURE = 'missing';

type MutableFaces = { -readonly [K in keyof FaceTextures]: string };

const uniformFaces = (name: string): MutableFaces => ({
  up: name,
  down: name,
  north: name,
  south: name,
  west: name,
  east: name,
});

/** Faces as described in the registry (for `facing=north`, `axis=y`). */
function baseFaces(textures: BlockTextures): MutableFaces {
  if ('all' in textures) return uniformFaces(textures.all);
  if ('top' in textures) {
    const side = textures.side;
    return {
      up: textures.top,
      down: textures.bottom,
      north: side,
      south: side,
      west: side,
      east: side,
    };
  }
  if ('end' in textures) {
    const side = textures.side;
    return {
      up: textures.end,
      down: textures.end,
      north: side,
      south: side,
      west: side,
      east: side,
    };
  }
  const f = textures.faces;
  const pick = (d: Direction): string => f[d] ?? f.side ?? MISSING_TEXTURE;
  return {
    up: pick('up'),
    down: pick('down'),
    north: pick('north'),
    south: pick('south'),
    west: pick('west'),
    east: pick('east'),
  };
}

/**
 * For each target face, the face of the north-facing description it shows.
 * Horizontal facings rotate around Y (north → east → south → west); `up`/`down`
 * tilt the north face onto the top/bottom face around the X axis.
 */
const FACING_SOURCE: Readonly<Record<Direction, Readonly<Record<Direction, Direction>>>> = {
  north: { up: 'up', down: 'down', north: 'north', south: 'south', west: 'west', east: 'east' },
  east: { up: 'up', down: 'down', east: 'north', south: 'east', west: 'south', north: 'west' },
  south: { up: 'up', down: 'down', south: 'north', west: 'east', north: 'south', east: 'west' },
  west: { up: 'up', down: 'down', west: 'north', north: 'east', east: 'south', south: 'west' },
  // facing=up: north → up, up → south, south → down, down → north.
  up: { up: 'north', south: 'up', down: 'south', north: 'down', west: 'west', east: 'east' },
  // facing=down: north → down, down → south, south → up, up → north.
  down: { down: 'north', south: 'down', up: 'south', north: 'up', west: 'west', east: 'east' },
};

const DIRS: readonly Direction[] = ['down', 'up', 'north', 'south', 'west', 'east'];

function rotateFacing(faces: MutableFaces, facing: Direction): MutableFaces {
  const map = FACING_SOURCE[facing];
  const out = { ...faces };
  for (const d of DIRS) out[d] = faces[map[d]];
  return out;
}

/** Logs/pillars: `end` texture on the two faces along `axis`. */
function axisFaces(textures: { end: string; side: string }, axis: string): MutableFaces {
  const faces = uniformFaces(textures.side);
  if (axis === 'x') faces.west = faces.east = textures.end;
  else if (axis === 'z') faces.north = faces.south = textures.end;
  else faces.up = faces.down = textures.end;
  return faces;
}

const isDirection = (v: string | undefined): v is Direction =>
  v !== undefined && (DIRS as readonly string[]).includes(v);

const allTint = (kind: TintKind): Partial<Record<Direction, TintKind>> => ({
  up: kind,
  down: kind,
  north: kind,
  south: kind,
  west: kind,
  east: kind,
});

function resolveTint(state: BlockState): Partial<Record<Direction, TintKind>> | undefined {
  const path = state.id.slice(state.id.indexOf(':') + 1);
  if (path === 'grass_block') return { up: 'grass' };
  if (path.endsWith('_leaves')) return allTint('foliage');
  if (path === 'water') return allTint('water');
  if (path === 'redstone_wire') return allTint('redstone');
  return undefined;
}

const UNKNOWN = (state: BlockStateString): PaletteRenderInfo => ({
  state,
  shape: 'full',
  layer: 'opaque',
  faces: uniformFaces(MISSING_TEXTURE),
  occludes: true,
});

/**
 * Resolves render info for one blockstate. Face textures are resolved for every
 * textured block (also `model` blocks, as a convenience for model geometry) and are
 * rotated for `facing` (only for `textures.faces`, which the registry describes for
 * `facing=north`) and `axis` (`end`/`side`). Unknown or malformed states render as a
 * full opaque cube with the `missing` texture.
 */
export function resolveRenderInfo(
  registry: BlockRegistry,
  state: BlockStateString,
): PaletteRenderInfo {
  let parsed: BlockState;
  try {
    parsed = parseBlockState(state);
  } catch {
    return UNKNOWN(state);
  }
  const def = registry.get(parsed.id);
  if (!def) return UNKNOWN(state);
  const { shape, layer, textures, modelId } = def.render;
  if (shape === 'none') return { state, shape, layer, occludes: false };

  let faces: MutableFaces | undefined;
  if (textures) {
    const props = parsed.properties;
    if ('end' in textures) {
      faces = axisFaces(textures, props['axis'] ?? 'y');
    } else {
      faces = baseFaces(textures);
      const facing = props['facing'];
      if ('faces' in textures && isDirection(facing)) faces = rotateFacing(faces, facing);
    }
  } else if (shape === 'full') {
    faces = uniformFaces(MISSING_TEXTURE);
  }
  const tint = resolveTint(parsed);
  return {
    state,
    shape,
    layer,
    ...(faces ? { faces } : {}),
    ...(tint ? { tint } : {}),
    ...(modelId ? { modelId } : {}),
    occludes: shape === 'full' && layer === 'opaque',
  };
}

/** Resolves a whole palette (index-aligned), e.g. `doc.palette.entries()`. */
export function resolvePaletteRenderInfo(
  registry: BlockRegistry,
  states: readonly BlockStateString[],
): PaletteRenderInfo[] {
  return states.map((s) => resolveRenderInfo(registry, s));
}
