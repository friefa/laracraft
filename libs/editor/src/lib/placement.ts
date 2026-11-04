import {
  type BlockRegistry,
  type BlockStateString,
  type Direction,
  type HorizontalDirection,
  OPPOSITE,
  type PlacementSource,
  type PropertyDefinition,
  parseBlockState,
  resolveBlockState,
} from '@laracraft/core-model';
import type { Pick } from './api';

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

/**
 * Orients a palette state for placement like Java Edition does, from the
 * registry's `placement` rules: clicked face (logs `axis`, wall torches,
 * lever `face`), clicked half (stairs/slabs: clicking the underside of a block
 * gives the top half; side clicks give the bottom half because a pick has no
 * hit point), and the camera's horizontal look direction (stairs, furnaces …).
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
): BlockStateString {
  const parsed = parseBlockState(state);
  const def = registry.get(parsed.id);
  if (!def?.placement || !pick) return state;
  const props: Record<string, string> = { ...parsed.properties };
  const decided = new Set<string>();

  const derive = (prop: PropertyDefinition, source: PlacementSource): string | undefined => {
    switch (source) {
      case 'clickedFace':
        return directionValue(prop, pick.face);
      case 'clickedFaceOpposite':
        return directionValue(prop, OPPOSITE[pick.face]) ?? prop.default;
      case 'playerFacing':
      case 'playerLook3d':
        return lookHorizontal && directionValue(prop, lookHorizontal);
      case 'playerFacingOpposite':
      case 'playerLook3dOpposite':
        return lookHorizontal && directionValue(prop, OPPOSITE[lookHorizontal]);
      case 'clickedHalf': {
        if (prop.values.includes('lower')) return 'lower';
        const half = pick.face === 'down' ? 'top' : 'bottom';
        return prop.values.includes(half) ? half : undefined;
      }
      default:
        return undefined;
    }
  };

  for (const rule of def.placement) {
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
