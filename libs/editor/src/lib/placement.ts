import {
  AIR,
  type BlockDefinition,
  type BlockRegistry,
  type BlockState,
  type BlockStateString,
  type Direction,
  HORIZONTAL_DIRECTIONS,
  type HorizontalDirection,
  OPPOSITE,
  type PlacementSource,
  type PropertyDefinition,
  parseBlockState,
  resolveBlockState,
} from '@laracraft/core-model';
import type { Pick } from './api';

/** Camera pitch class, see `ToolContext.lookVertical`. */
export type LookVertical = 'up' | 'level' | 'down';

const AXIS_OF: Readonly<Record<Direction, string>> = {
  up: 'y',
  down: 'y',
  east: 'x',
  west: 'x',
  north: 'z',
  south: 'z',
};

const FACE_OF: Readonly<Record<Direction, string>> = {
  up: 'floor',
  down: 'ceiling',
  north: 'wall',
  south: 'wall',
  west: 'wall',
  east: 'wall',
};

/** Converts a direction into a value of `prop` (direction, axis or attach face). */
function directionValue(prop: PropertyDefinition, dir: Direction): string | undefined {
  for (const candidate of [dir, AXIS_OF[dir], FACE_OF[dir]]) {
    if (prop.values.includes(candidate)) return candidate;
  }
  return undefined;
}

/** 3D facing from the camera: a steep pitch wins, otherwise the horizontal look. */
function look3dValue(
  prop: PropertyDefinition,
  opposite: boolean,
  lookHorizontal: HorizontalDirection | undefined,
  lookVertical: LookVertical | undefined,
): string | undefined {
  const dir: Direction | undefined =
    lookVertical === 'up' || lookVertical === 'down' ? lookVertical : lookHorizontal;
  if (!dir) return undefined;
  return directionValue(prop, opposite ? OPPOSITE[dir] : dir);
}

/** Half of the clicked face: bottom face → top, top face → bottom, side faces by hit point. */
function clickedHalf(pick: Pick): 'top' | 'bottom' {
  if (pick.face === 'down') return 'top';
  if (pick.face === 'up') return 'bottom';
  return pick.hit && pick.hit.y >= 0.5 ? 'top' : 'bottom';
}

interface WallPairs {
  /** Floor id → wall id. */
  readonly wallOf: ReadonlyMap<string, string>;
  /** Wall id → floor id. */
  readonly floorOf: ReadonlyMap<string, string>;
}

const wallPairsCache = new WeakMap<BlockRegistry, WallPairs>();

/**
 * Floor/wall block pairs, derived from registry ids: a block whose id path has a
 * `wall` segment that is not the last one (`wall_torch`, `redstone_wall_torch`,
 * `oak_wall_sign`, `skeleton_wall_skull` …) is the wall variant of the id without
 * that segment (`torch`, `redstone_torch`, `oak_sign`, `skeleton_skull`) if both
 * exist and the wall variant has a horizontal `facing`. Walls such as
 * `cobblestone_wall` (`wall` is the last segment) are not variants.
 */
export function wallVariantPairs(registry: BlockRegistry): WallPairs {
  const cached = wallPairsCache.get(registry);
  if (cached) return cached;
  const wallOf = new Map<string, string>();
  const floorOf = new Map<string, string>();
  for (const def of registry.all()) {
    const colon = def.id.indexOf(':');
    const segments = def.id.slice(colon + 1).split('_');
    const i = segments.indexOf('wall');
    if (i === -1 || i === segments.length - 1) continue;
    const floorId = def.id.slice(0, colon + 1) + segments.filter((_, j) => j !== i).join('_');
    const facing = def.properties['facing'];
    if (!registry.has(floorId) || !facing) continue;
    if (!HORIZONTAL_DIRECTIONS.every((d) => facing.values.includes(d))) continue;
    wallOf.set(floorId, def.id);
    floorOf.set(def.id, floorId);
  }
  const pairs: WallPairs = { wallOf, floorOf };
  wallPairsCache.set(registry, pairs);
  return pairs;
}

/**
 * Picks the floor or wall variant for the clicked face: side faces give the wall
 * variant, the top face the floor variant. Shared properties (redstone torch
 * `lit`) carry over. Returns null on the bottom face (Java has no ceiling torch),
 * and the input unchanged for blocks that are not part of a pair.
 */
function wallVariantFor(
  registry: BlockRegistry,
  parsed: BlockState,
  face: Direction,
): BlockState | null {
  const { wallOf, floorOf } = wallVariantPairs(registry);
  const floorId = floorOf.get(parsed.id) ?? (wallOf.has(parsed.id) ? parsed.id : undefined);
  if (floorId === undefined) return parsed;
  if (face === 'down') return null;
  const targetId = face === 'up' ? floorId : wallOf.get(floorId);
  const target = targetId === undefined ? undefined : registry.get(targetId);
  if (!target || target.id === parsed.id) return parsed;
  const properties: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.properties)) {
    if (target.properties[key]?.values.includes(value)) properties[key] = value;
  }
  return { id: target.id, properties };
}

/** Redstone wire placed as a dot starts as a cross (Java `getStateForPlacement`). */
function wireAsCross(def: BlockDefinition, props: Record<string, string>): void {
  if (def.redstone?.role !== 'wire') return;
  if (!HORIZONTAL_DIRECTIONS.every((d) => (props[d] ?? 'none') === 'none')) return;
  for (const d of HORIZONTAL_DIRECTIONS) {
    if (def.properties[d]?.values.includes('side')) props[d] = 'side';
  }
}

/**
 * Orients a palette state for placement like Java Edition does, from the
 * registry's `placement` rules:
 * - clicked face (logs `axis`, wall torches, lever `face`);
 * - clicked half (stairs/slabs/trapdoors): the underside of a block gives the
 *   top half, the top face the bottom half; on side faces the hit point decides
 *   (`hit.y >= 0.5` → top; without a hit point → bottom);
 * - the camera's horizontal look (stairs, furnaces …) and, for 3D-facing blocks
 *   (`playerLook3d*`: pistons, observers, dispensers, droppers, barrels), its
 *   pitch: looking steeply up or down faces them vertically.
 *
 * Floor/wall pairs ({@link wallVariantPairs}) switch to the wall variant on side
 * faces and to the floor variant on the top face. On the bottom face they cannot
 * be placed and `AIR` is returned (callers treat that as a no-op). A redstone
 * wire whose palette state is a dot is placed as a cross; its final connections
 * come from `updateNeighbourShapes`.
 *
 * `pick.face` is the clicked face, i.e. the direction from the clicked block
 * to the new block. Values not derivable here (`neighbors`, `interaction`,
 * `environment`, or player look without `lookHorizontal`) keep the palette
 * state's value. Door-like `half=upper|lower` is forced to `lower`.
 */
export function placementStateFor(
  registry: BlockRegistry,
  state: BlockStateString,
  pick: Pick | null,
  lookHorizontal?: HorizontalDirection,
  lookVertical?: LookVertical,
): BlockStateString {
  if (!pick) return state;
  const parsed = wallVariantFor(registry, parseBlockState(state), pick.face);
  if (!parsed) return AIR;
  const def = registry.get(parsed.id);
  if (!def) return state;
  const props: Record<string, string> = { ...parsed.properties };
  wireAsCross(def, props);
  const decided = new Set<string>();

  const derive = (prop: PropertyDefinition, source: PlacementSource): string | undefined => {
    switch (source) {
      case 'clickedFace':
        return directionValue(prop, pick.face);
      case 'clickedFaceOpposite':
        return directionValue(prop, OPPOSITE[pick.face]) ?? prop.default;
      case 'playerFacing':
        return lookHorizontal && directionValue(prop, lookHorizontal);
      case 'playerFacingOpposite':
        return lookHorizontal && directionValue(prop, OPPOSITE[lookHorizontal]);
      case 'playerLook3d':
        return look3dValue(prop, false, lookHorizontal, lookVertical);
      case 'playerLook3dOpposite':
        return look3dValue(prop, true, lookHorizontal, lookVertical);
      case 'clickedHalf': {
        if (prop.values.includes('lower')) return 'lower';
        const half = clickedHalf(pick);
        return prop.values.includes(half) ? half : undefined;
      }
      default:
        return undefined;
    }
  };

  for (const rule of def.placement ?? []) {
    if (decided.has(rule.property)) continue;
    if (rule.when && props[rule.when.property] !== rule.when.value) continue;
    const prop = def.properties[rule.property];
    if (!prop) continue;
    decided.add(rule.property);
    if (rule.source === 'fixed') {
      props[rule.property] = rule.value ?? prop.default;
      continue;
    }
    const value = derive(prop, rule.source);
    if (value !== undefined && prop.values.includes(value)) props[rule.property] = value;
  }
  // Two-block-tall blocks are always placed from their lower half.
  const half = def.properties['half'];
  if (half?.values.includes('lower') && half.values.includes('upper')) props['half'] = 'lower';

  const resolved = resolveBlockState(registry, { id: parsed.id, properties: props });
  return resolved.ok ? resolved.state : state;
}
