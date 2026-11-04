import {
  parseBlockState,
  resolveBlockState,
  type BlockRegistry,
  type BlockStateString,
} from '@laracraft/core-model';
import type { ModelGeometry, TextureLayers } from '../mesh/types';
import { button, lever } from './attached';
import { chest } from './chest';
import {
  blockFaceTextures,
  MISSING_TEXTURE,
  type BlockFaceTextures,
  type ModelBuilder,
  type ModelContext,
} from './context';
import { cross } from './cross';
import { comparator, repeater } from './diode';
import { door } from './door';
import { fence, fenceGate } from './fence';
import { fluid } from './fluid';
import { lockedBox, toModelGeometry, type Quad } from './geometry';
import { hopper } from './hopper';
import { ladder } from './ladder';
import { pane } from './pane';
import { piston, pistonHead } from './piston';
import { carpet, daylightDetector, pressurePlate } from './plates';
import { rail } from './rail';
import { slab } from './slab';
import { stairs } from './stairs';
import { lantern, torch, wallTorch } from './torch';
import { trapdoor } from './trapdoor';
import { wall } from './wall';
import { wire } from './wire';

/** Model builders by registry `render.modelId`. */
export const MODEL_BUILDERS: Readonly<Record<string, ModelBuilder>> = Object.freeze({
  stairs,
  slab,
  fence,
  fence_gate: fenceGate,
  pane,
  wall,
  door,
  trapdoor,
  torch,
  wall_torch: wallTorch,
  lantern,
  ladder,
  carpet,
  pressure_plate: pressurePlate,
  daylight_detector: daylightDetector,
  button,
  lever,
  rail,
  wire,
  repeater,
  comparator,
  piston,
  piston_head: pistonHead,
  hopper,
  chest,
  fluid,
  cross,
});

/** Model ids with a dedicated builder. */
export const SUPPORTED_MODEL_IDS: readonly string[] = Object.freeze(Object.keys(MODEL_BUILDERS));

export function isModelSupported(modelId: string | undefined): boolean {
  return modelId !== undefined && Object.hasOwn(MODEL_BUILDERS, modelId);
}

/** Fallback for unknown blocks / model ids and for `full` blocks: a textured unit cube. */
function cube(faces: BlockFaceTextures): Quad[] {
  return lockedBox([0, 0, 0], [16, 16, 16], faces);
}

const cache = new WeakMap<BlockRegistry, WeakMap<TextureLayers, Map<string, ModelGeometry>>>();

function cacheFor(registry: BlockRegistry, textures: TextureLayers): Map<string, ModelGeometry> {
  let byTextures = cache.get(registry);
  if (!byTextures) {
    byTextures = new WeakMap();
    cache.set(registry, byTextures);
  }
  let byState = byTextures.get(textures);
  if (!byState) {
    byState = new Map();
    byTextures.set(textures, byState);
  }
  return byState;
}

/** Builds the quads of one blockstate (uncached, pixel space). */
function buildQuads(registry: BlockRegistry, state: string, textures: TextureLayers): Quad[] {
  const resolved = resolveBlockState(registry, state);
  const def = resolved.ok ? registry.get(parseBlockState(resolved.state).id) : undefined;
  if (!resolved.ok || !def) return cube(blockFaceTextures(undefined));
  const faces = blockFaceTextures(def);
  const modelId = def.render.modelId;
  if (def.render.shape !== 'model' || !isModelSupported(modelId)) return cube(faces);
  const has = (name: string) => Object.hasOwn(textures, name);
  const ctx: ModelContext = {
    def,
    props: parseBlockState(resolved.state).properties,
    faces,
    has,
    pick: (...names) => names.find(has) ?? names[0] ?? MISSING_TEXTURE,
  };
  return (MODEL_BUILDERS[modelId as string] as ModelBuilder)(ctx);
}

/**
 * Unit-space geometry for a `model` blockstate: the block occupies [0,1]³, Y up, Java axes
 * (north = -Z, east = +X). UVs are 0..1 fractions within one texture layer (GL convention,
 * v = 1 is the top row of the texture), `layers` index `textures` (unknown names use
 * `missing`), `colors` carry face shading × tint. Unknown blocks or model ids and non-model
 * blocks yield a textured unit cube. Results are cached per registry, texture map and state
 * string and must be treated as read-only.
 */
export function buildModelGeometry(
  registry: BlockRegistry,
  state: BlockStateString | string,
  textures: TextureLayers,
): ModelGeometry {
  const byState = cacheFor(registry, textures);
  let geometry = byState.get(state);
  if (!geometry) {
    geometry = toModelGeometry(buildQuads(registry, state, textures), textures);
    byState.set(state, geometry);
  }
  return geometry;
}
