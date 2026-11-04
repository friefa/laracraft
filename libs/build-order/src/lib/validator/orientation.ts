import {
  OPPOSITE,
  type BlockDefinition,
  type BlockState,
  type Direction,
  type PlacementRule,
  type PropertyDefinition,
} from '@laracraft/core-model';
import type { PlaceAction } from '../types';

/**
 * Independent re-implementation of Java Edition placement semantics, driven by
 * the registry's `PlacementRule`s. Given HOW the player places a block (look
 * direction, clicked face, clicked half, interactions) it derives the value each
 * player-controlled property gets. The validator compares that with the target
 * state; properties derived from neighbours or the environment are not checked.
 */

/** Properties whose value is derived, with the source used (for messages and look checks). */
export interface DerivedProperty {
  readonly property: string;
  readonly source: PlacementRule['source'];
  /** Expected value, or `undefined` if this placement cannot produce any valid value. */
  readonly value: string | undefined;
}

/** The 3D direction the player looks in, as Java's `nearestLookingDirection` would report it. */
export function lookDirection3d(action: PlaceAction): Direction {
  if (action.look.vertical === 'up') return 'up';
  if (action.look.vertical === 'down') return 'down';
  return action.look.horizontal;
}

/**
 * Maps a direction onto the value domain of a property:
 * - direction-valued properties (`facing`) take the direction itself;
 * - `face` properties (floor|wall|ceiling): up → floor, down → ceiling, sides → wall;
 * - `axis` properties (x|y|z): the axis of the direction;
 * - boolean properties fed by `clickedFace` (lantern `hanging`): true iff the
 *   underside of a block was clicked (clicked face = down).
 * Returns `undefined` if the property cannot take a value for this direction
 * (e.g. a wall torch's horizontal `facing` when clicking a top face).
 */
export function valueForDirection(prop: PropertyDefinition, dir: Direction): string | undefined {
  const values = prop.values;
  if (values.includes(dir)) return dir;
  if (values.includes('floor') && values.includes('wall') && values.includes('ceiling')) {
    return dir === 'up' ? 'floor' : dir === 'down' ? 'ceiling' : 'wall';
  }
  if (values.includes('x') && values.includes('y') && values.includes('z')) {
    return dir === 'up' || dir === 'down' ? 'y' : dir === 'east' || dir === 'west' ? 'x' : 'z';
  }
  if (values.length === 2 && values.includes('true') && values.includes('false')) {
    return dir === 'down' ? 'true' : 'false';
  }
  return undefined;
}

/**
 * Java `clickedHalf` semantics for stairs/slabs/trapdoors: clicking the underside
 * of a block gives `top`, clicking a top face gives `bottom`, clicking a side face
 * gives the half of the face that was hit (`clickHalf`, default `bottom`).
 */
export function clickedHalf(action: PlaceAction): 'top' | 'bottom' {
  if (action.clickOn.face === 'down') return 'top';
  if (action.clickOn.face === 'up') return 'bottom';
  return action.clickHalf ?? 'bottom';
}

/** Value after `n` right-clicks: interaction properties cycle through their values from the default. */
function cycledValue(prop: PropertyDefinition, interactions: number): string {
  const start = prop.values.indexOf(prop.default);
  const n = Math.max(0, Math.floor(interactions));
  return prop.values[(start + n) % prop.values.length] as string;
}

function deriveFromRule(
  rule: PlacementRule,
  prop: PropertyDefinition,
  action: PlaceAction,
): string | undefined | null {
  // `null` = not player-controlled (not checked).
  switch (rule.source) {
    case 'playerFacing':
      return valueForDirection(prop, action.look.horizontal);
    case 'playerFacingOpposite':
      return valueForDirection(prop, OPPOSITE[action.look.horizontal]);
    case 'playerLook3d':
      return valueForDirection(prop, lookDirection3d(action));
    case 'playerLook3dOpposite':
      return valueForDirection(prop, OPPOSITE[lookDirection3d(action)]);
    case 'clickedFace':
      return valueForDirection(prop, action.clickOn.face);
    case 'clickedFaceOpposite':
      // Values the property does not allow (hopper `up`) fall back to the default.
      return valueForDirection(prop, OPPOSITE[action.clickOn.face]) ?? prop.default;
    case 'clickedHalf': {
      const half = clickedHalf(action);
      return prop.values.includes(half) ? half : undefined;
    }
    case 'interaction':
      return cycledValue(prop, action.interactions ?? 0);
    case 'fixed':
      return rule.value ?? prop.default;
    case 'neighbors':
    case 'environment':
      return null;
  }
}

/**
 * Derives the player-controlled properties of `def` for a placement. `target` is
 * only consulted for `when` conditions on properties that are themselves not
 * player-controlled; conditions on derived properties use the derived value
 * (lever `facing` depends on the derived `face`).
 */
export function derivePlacedProperties(
  def: BlockDefinition,
  target: BlockState,
  action: PlaceAction,
): DerivedProperty[] {
  const rulesByProp = new Map<string, PlacementRule[]>();
  for (const rule of def.placement ?? []) {
    const list = rulesByProp.get(rule.property);
    if (list) list.push(rule);
    else rulesByProp.set(rule.property, [rule]);
  }

  const derived = new Map<string, DerivedProperty>();
  const names = Object.keys(def.properties).sort();
  // Unconditional properties first so that `when` conditions can see derived values.
  const conditional = (name: string) => (rulesByProp.get(name) ?? []).some((r) => r.when);
  const ordered = [...names.filter((n) => !conditional(n)), ...names.filter(conditional)];

  for (const name of ordered) {
    const prop = def.properties[name] as PropertyDefinition;
    const rules = rulesByProp.get(name) ?? [];
    if (rules.length === 0) {
      // No rule: `waterlogged` is implicitly environment, everything else fixed default.
      if (name !== 'waterlogged') {
        derived.set(name, { property: name, source: 'fixed', value: prop.default });
      }
      continue;
    }
    const rule = rules.find((r) => {
      if (!r.when) return true;
      const cond = derived.get(r.when.property);
      const condValue = cond ? cond.value : target.properties[r.when.property];
      return condValue === r.when.value;
    });
    if (!rule) continue;
    const value = deriveFromRule(rule, prop, action);
    if (value === null) continue;
    derived.set(name, { property: name, source: rule.source, value });
  }
  return [...derived.values()];
}
