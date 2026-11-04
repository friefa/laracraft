import {
  faceSupport,
  requiredSupport,
  satisfiesSupport,
  type Direction,
  type FaceSupport,
  type SupportRule,
} from '@laracraft/core-model';
import { opposite } from '../core/pos';
import type { BState } from '../core/state';
import type { PushReaction } from './behaviour';

/**
 * Static block properties relevant to redstone, derived from the registry plus the Java
 * exceptions documented on the wiki.
 */

/**
 * Full cubes that are NOT redstone conductors in Java Edition (`isRedstoneConductor(never)`).
 * Source: https://minecraft.wiki/w/Conductivity (non-conductive: block of redstone, glass,
 * glowstone, honey block, hopper, ice, leaves, observer, piston, slab, stairs, TNT …) and
 * https://minecraft.wiki/w/Sea_Lantern ("does not transfer a redstone signal").
 */
const NON_CONDUCTIVE = new Set([
  'minecraft:redstone_block',
  'minecraft:glass',
  'minecraft:white_stained_glass',
  'minecraft:black_stained_glass',
  'minecraft:red_stained_glass',
  'minecraft:blue_stained_glass',
  'minecraft:light_blue_stained_glass',
  'minecraft:glowstone',
  'minecraft:sea_lantern',
  'minecraft:ice',
  'minecraft:observer',
  'minecraft:piston',
  'minecraft:sticky_piston',
  'minecraft:tnt',
  'minecraft:honey_block',
  'minecraft:moving_piston',
]);

/** Java redstone conductor test (`isRedstoneConductor`): opaque-ish full collision cubes. */
export function isConductorState(s: BState): boolean {
  if (NON_CONDUCTIVE.has(s.id)) return false;
  const def = s.def;
  if (!def) return false;
  // Double slabs are full cubes and conduct like any full block.
  if (def.render.modelId === 'slab') return s.get('type') === 'double';
  return def.render.shape === 'full' && def.solid;
}

/** Blocks with a block entity: Java pistons never move them (`hasBlockEntity`). */
const BLOCK_ENTITY_BLOCKS = new Set([
  'minecraft:chest',
  'minecraft:barrel',
  'minecraft:furnace',
  'minecraft:hopper',
  'minecraft:dispenser',
  'minecraft:dropper',
  'minecraft:comparator',
  'minecraft:daylight_detector',
  'minecraft:moving_piston',
]);

export const hasBlockEntity = (s: BState): boolean => BLOCK_ENTITY_BLOCKS.has(s.id);

/**
 * Java `PushReaction.DESTROY` blocks of our registry (they break when a piston pushes into
 * them). Source: https://minecraft.wiki/w/Piston#Behavior ("Breaks when pushed").
 */
const DESTROY_IDS = new Set([
  'minecraft:redstone_wire',
  'minecraft:redstone_torch',
  'minecraft:redstone_wall_torch',
  'minecraft:torch',
  'minecraft:wall_torch',
  'minecraft:lever',
  'minecraft:repeater',
  'minecraft:comparator',
  'minecraft:ladder',
  'minecraft:lantern',
  'minecraft:water',
  'minecraft:lava',
]);
const DESTROY_MODELS = new Set(['button', 'pressure_plate', 'door', 'leaves']);

/** Never movable (Java: obsidian, piston head, moving piston …). */
const BLOCK_IDS = new Set([
  'minecraft:obsidian',
  'minecraft:piston_head',
  'minecraft:moving_piston',
]);

export function basePushReaction(s: BState): PushReaction {
  if (BLOCK_IDS.has(s.id)) return 'block';
  if (DESTROY_IDS.has(s.id)) return 'destroy';
  const model = s.def?.render.modelId;
  if (model && DESTROY_MODELS.has(model)) return 'destroy';
  if (s.id.endsWith('_leaves')) return 'destroy';
  return 'normal';
}

/** Support a block face offers (registry data; air/unknown = none). */
export function offeredSupport(s: BState, face: Direction): FaceSupport {
  if (s.isAir) return 'none';
  return faceSupport(s.def, { id: s.id, properties: s.props }, face);
}

/** Java `isFaceSturdy(..., FULL)`. */
export const isFaceSturdy = (s: BState, face: Direction): boolean =>
  offeredSupport(s, face) === 'full';

/** Resolves a registry support rule for a state to (direction to the supporter, needed level). */
export function supportOf(
  s: BState,
): { readonly dir: Direction; readonly needs: FaceSupport } | undefined {
  const def = s.def;
  if (!def) return undefined;
  let rule: SupportRule | undefined = def.physics.support;
  while (rule && rule.kind === 'conditional') rule = rule.cases[s.get(rule.property)];
  if (!rule) return undefined;
  switch (rule.kind) {
    case 'none':
      return undefined;
    case 'below':
      return { dir: 'down', needs: requiredSupport(rule) };
    case 'ceiling':
      return { dir: 'up', needs: requiredSupport(rule) };
    case 'facing': {
      const f = s.get(rule.property) as Direction;
      return f ? { dir: opposite(f), needs: requiredSupport(rule) } : undefined;
    }
    case 'face': {
      const face = s.get(rule.faceProperty);
      if (face === 'floor') return { dir: 'down', needs: requiredSupport(rule) };
      if (face === 'ceiling') return { dir: 'up', needs: requiredSupport(rule) };
      const f = s.get(rule.facingProperty) as Direction;
      return f ? { dir: opposite(f), needs: requiredSupport(rule) } : undefined;
    }
  }
  return undefined;
}

/** Can `s` stay when `supporter` is the block in its support direction? */
export function survivesOn(
  s: BState,
  dir: Direction,
  needs: FaceSupport,
  supporter: BState,
): boolean {
  if (needs === 'none') return !supporter.isAir && !supporter.is('minecraft:moving_piston');
  // Java: dust and diodes also survive on hoppers (`canSurviveOn`), covered by `rigid` data.
  return satisfiesSupport(offeredSupport(supporter, opposite(dir)), needs);
}

/** Blocks with a comparator-readable output (`hasAnalogOutputSignal`) in our registry. */
const ANALOG_IDS = new Set([
  'minecraft:chest',
  'minecraft:barrel',
  'minecraft:furnace',
  'minecraft:hopper',
  'minecraft:dispenser',
  'minecraft:dropper',
  'minecraft:detector_rail',
]);

export const hasAnalogOutput = (s: BState): boolean => ANALOG_IDS.has(s.id);
