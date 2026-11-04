import {
  faceSupport,
  parseBlockState,
  requiredSupport,
  type BlockDefinition,
  type BlockRegistry,
  type BlockState,
  type BlockStateString,
  type Direction,
  type FaceSupport,
  type HorizontalDirection,
  type PlacementRule,
  type PropertyDefinition,
  type SupportRule,
} from '@laracraft/core-model';

/*
 * Per-blockstate analysis. Everything the planner needs to know about one
 * palette entry is computed once here, so the hot loops only do table lookups.
 */

/** Direction tables in the same order as core-model `DIRECTIONS`. */
export const DIRS: readonly Direction[] = ['down', 'up', 'north', 'south', 'west', 'east'];
export const DX: readonly number[] = [0, 0, 0, 0, -1, 1];
export const DY: readonly number[] = [-1, 1, 0, 0, 0, 0];
export const DZ: readonly number[] = [0, 0, -1, 1, 0, 0];
export const OPP: readonly number[] = [1, 0, 3, 2, 5, 4];
export const D_DOWN = 0;
export const D_UP = 1;

export const DIR_INDEX: Readonly<Record<Direction, number>> = {
  down: 0,
  up: 1,
  north: 2,
  south: 3,
  west: 4,
  east: 5,
};

/** Look directions: index = h * 3 + v (12 combinations). */
export const LOOK_H: readonly HorizontalDirection[] = ['north', 'east', 'south', 'west'];
export const LOOK_V: readonly ('up' | 'level' | 'down')[] = ['up', 'level', 'down'];
export const V_UP = 0;
export const V_LEVEL = 1;
export const V_DOWN = 2;
export const ALL_LOOKS = (1 << 12) - 1;
/** Horizontal look index → direction index. */
export const LOOK_H_DIR: readonly number[] = [2, 5, 3, 4];

/** Click half: 0 = not relevant, 1 = top, 2 = bottom. */
export const HALF_NONE = 0;
export const HALF_TOP = 1;
export const HALF_BOTTOM = 2;

/** Ordering groups. Mapped to phases by {@link RANK_PHASE}. */
export const RANK_STRUCTURE = 0;
export const RANK_REDSTONE = 1;
export const RANK_OBSERVER = 2;
export const RANK_POWER = 3;
export const RANK_FLUIDS = 4;
export const RANK_PHASE = ['structure', 'redstone', 'redstone', 'power', 'fluids'] as const;

/**
 * - `place`: placed by the player.
 * - `skip`: never placed (air variants, flowing fluid, technical blocks).
 * - `implicit`: appears together with another part (upper door half, piston head).
 */
export type StateKind = 'place' | 'skip' | 'implicit';

export interface StateInfo {
  readonly state: BlockStateString;
  readonly props: Readonly<Record<string, string>>;
  readonly def: BlockDefinition | undefined;
  readonly kind: StateKind;
  readonly baseRank: number;
  /** Direction index from the block to the block it is attached to, or -1. */
  readonly supportDir: number;
  readonly supportNeeds: FaceSupport;
  readonly gravity: boolean;
  readonly fluid: boolean;
  readonly item: string;
  readonly count: number;
  readonly interactions: number;
  /** Placement depends on the player's look direction. */
  readonly lookDependent: boolean;
  /** Acceptable looks per click option: index `dir * 3 + half`, 12-bit look mask. */
  readonly masks: Uint16Array;
  /** OR of {@link masks} per clicked-face direction (6 entries). */
  readonly maskAny: Uint16Array;
  /** Support offered per face (direction index). */
  readonly offers: readonly FaceSupport[];
  /** A player can stand on top of it. */
  readonly standable: boolean;
  /** Can be clicked to place a block against it. */
  readonly clickable: boolean;
  /** Right-click opens/changes it, so placing against it needs sneaking. */
  readonly interactive: boolean;
  /** Observer: direction index of the watched block, else -1. */
  readonly observerDir: number;
  /** Actuator that reacts when placed into a powered context (piston, dispenser, TNT). */
  readonly triggers: boolean;
  /** Implicit part: direction index to the part that is placed, else -1. */
  readonly ownerDir: number;
  /** Reasons why the exact state cannot be produced in survival. */
  readonly issues: readonly string[];
  readonly unknown: boolean;
  /** Air variant: not part of the build at all. */
  readonly air: boolean;
}

const AIR_IDS = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);

/** Wooden doors/trapdoors/fence gates, buttons, lever and plain interactive blocks (iron doors are not). */
const INTERACTIVE_RE =
  /^(?!minecraft:iron_).*(_door|_trapdoor|_fence_gate)$|_button$|^minecraft:(lever|crafting_table|dispenser|dropper|note_block|repeater|comparator|daylight_detector|enchanting_table|anvil|bed)$/;

/** Right-clicking the block does something, so placing against it needs sneaking. */
function isInteractive(def: BlockDefinition): boolean {
  return (
    INTERACTIVE_RE.test(def.id) ||
    def.redstone?.role === 'container' ||
    (def.placement ?? []).some((r) => r.source === 'interaction')
  );
}

const STANDABLE_MODELS = new Set(['stairs', 'slab', 'chest', 'piston']);

/** First placement rule for `property` whose `when` condition holds for `props`. */
export function selectRule(
  placement: readonly PlacementRule[] | undefined,
  property: string,
  props: Readonly<Record<string, string>>,
): PlacementRule | undefined {
  if (!placement) return undefined;
  for (const rule of placement) {
    if (rule.property !== property) continue;
    if (!rule.when || props[rule.when.property] === rule.when.value) return rule;
  }
  return undefined;
}

/** Resolves a support rule against a state: direction index towards the support, or -1. */
export function resolveSupport(
  rule: SupportRule,
  props: Readonly<Record<string, string>>,
): { dir: number; needs: FaceSupport } | undefined {
  switch (rule.kind) {
    case 'none':
      return undefined;
    case 'below':
      return { dir: D_DOWN, needs: requiredSupport(rule) };
    case 'ceiling':
      return { dir: D_UP, needs: requiredSupport(rule) };
    case 'facing': {
      const value = props[rule.property];
      if (value === undefined || !(value in DIR_INDEX)) return undefined;
      return { dir: OPP[DIR_INDEX[value as Direction]] as number, needs: requiredSupport(rule) };
    }
    case 'face': {
      const face = props[rule.faceProperty];
      if (face === 'floor') return { dir: D_DOWN, needs: requiredSupport(rule) };
      if (face === 'ceiling') return { dir: D_UP, needs: requiredSupport(rule) };
      const facing = props[rule.facingProperty];
      if (facing === undefined || !(facing in DIR_INDEX)) return undefined;
      return { dir: OPP[DIR_INDEX[facing as Direction]] as number, needs: requiredSupport(rule) };
    }
    case 'conditional': {
      const value = props[rule.property];
      const next =
        value !== undefined && Object.hasOwn(rule.cases, value) ? rule.cases[value] : undefined;
      return next ? resolveSupport(next, props) : undefined;
    }
  }
}

/** Value a `clickedFace`-like source yields for `dir` (direction index). */
function faceValue(prop: PropertyDefinition, name: string, dir: number): string {
  const d = DIRS[dir] as Direction;
  const values = prop.values;
  if (values.includes(d)) return d;
  if (name === 'axis' || (values.includes('x') && values.includes('y') && values.includes('z'))) {
    return dir < 2 ? 'y' : dir < 4 ? 'z' : 'x';
  }
  if (values.includes('floor')) return dir === D_UP ? 'floor' : dir === D_DOWN ? 'ceiling' : 'wall';
  if (values.length === 2 && values.includes('true') && values.includes('false')) {
    // Lantern `hanging`: clicking the underside of a block hangs it.
    return dir === D_DOWN ? 'true' : 'false';
  }
  return prop.default;
}

function look3d(look: number): Direction {
  const v = look % 3;
  if (v === V_UP) return 'up';
  if (v === V_DOWN) return 'down';
  return LOOK_H[Math.floor(look / 3)] as Direction;
}

const OPPOSITE_NAME: Readonly<Record<Direction, Direction>> = {
  down: 'up',
  up: 'down',
  north: 'south',
  south: 'north',
  west: 'east',
  east: 'west',
};

type Controlled = {
  readonly name: string;
  readonly prop: PropertyDefinition;
  readonly rule: PlacementRule;
  readonly target: string;
};

/** Value produced by a player-controlled rule, or undefined when the rule is not player-controlled. */
function produced(c: Controlled, dir: number, half: number, look: number): string | undefined {
  const h = LOOK_H[Math.floor(look / 3)] as HorizontalDirection;
  switch (c.rule.source) {
    case 'playerFacing':
      return h;
    case 'playerFacingOpposite':
      return OPPOSITE_NAME[h];
    case 'playerLook3d':
      return look3d(look);
    case 'playerLook3dOpposite':
      return OPPOSITE_NAME[look3d(look)];
    case 'clickedFace':
      return faceValue(c.prop, c.name, dir);
    case 'clickedFaceOpposite': {
      const v = OPPOSITE_NAME[DIRS[dir] as Direction];
      return c.prop.values.includes(v) ? v : faceValue(c.prop, c.name, OPP[dir] as number);
    }
    case 'clickedHalf':
      if (c.target === 'double') return undefined;
      if (dir === D_UP) return 'bottom';
      if (dir === D_DOWN) return 'top';
      return half === HALF_TOP ? 'top' : 'bottom';
    default:
      return undefined;
  }
}

function itemCost(def: BlockDefinition, props: Readonly<Record<string, string>>) {
  const cost = def.item;
  if (!cost) return { item: def.id, count: 1, secondary: false };
  let count = cost.count ?? 1;
  if (cost.countByProperty) {
    const value = props[cost.countByProperty.property];
    const byValue = value !== undefined ? cost.countByProperty.counts[value] : undefined;
    if (byValue !== undefined) count = byValue;
  }
  const secondary =
    cost.primaryPart !== undefined && props[cost.primaryPart.property] !== cost.primaryPart.value;
  return { item: cost.item, count: secondary ? 0 : count, secondary };
}

function emptyMasks(all: boolean): { masks: Uint16Array; maskAny: Uint16Array } {
  const masks = new Uint16Array(18);
  const maskAny = new Uint16Array(6);
  if (all) {
    for (let d = 0; d < 6; d++) {
      masks[d * 3] = ALL_LOOKS;
      maskAny[d] = ALL_LOOKS;
    }
  }
  return { masks, maskAny };
}

function unknownInfo(state: BlockStateString, parsed: BlockState | undefined): StateInfo {
  const { masks, maskAny } = emptyMasks(true);
  return {
    state,
    props: parsed?.properties ?? {},
    def: undefined,
    kind: 'place',
    baseRank: RANK_STRUCTURE,
    supportDir: -1,
    supportNeeds: 'none',
    gravity: false,
    fluid: false,
    item: parsed?.id ?? state,
    count: 1,
    interactions: 0,
    lookDependent: false,
    masks,
    maskAny,
    offers: ['full', 'full', 'full', 'full', 'full', 'full'],
    standable: true,
    clickable: true,
    interactive: false,
    observerDir: -1,
    triggers: false,
    ownerDir: -1,
    issues: [],
    unknown: true,
    air: false,
  };
}

function baseRankOf(def: BlockDefinition): number {
  if (def.physics.fluid) return RANK_FLUIDS;
  const role = def.redstone?.role;
  if (role === 'source') return RANK_POWER;
  if (role === 'observer') return RANK_OBSERVER;
  if (role === 'wire' || role === 'repeater' || role === 'comparator') return RANK_REDSTONE;
  if (role === 'actuator' && def.category === 'redstone') return RANK_REDSTONE;
  return RANK_STRUCTURE;
}

/** Analyzes one canonical blockstate against the registry. */
export function analyzeState(state: BlockStateString, registry: BlockRegistry): StateInfo {
  let parsed: BlockState;
  try {
    parsed = parseBlockState(state);
  } catch {
    return unknownInfo(state, undefined);
  }
  const def = registry.get(parsed.id);
  if (!def) return unknownInfo(state, parsed);
  const props = parsed.properties;
  const issues: string[] = [];

  let kind: StateKind = 'place';
  let ownerDir = -1;
  const fluid = def.physics.fluid === true;
  const cost = itemCost(def, props);
  if (AIR_IDS.has(def.id)) kind = 'skip';
  else if (fluid && props['level'] !== undefined && props['level'] !== '0') kind = 'skip';
  else if (def.id === 'minecraft:piston_head') {
    kind = 'implicit';
    const facing = props['facing'];
    if (facing !== undefined && facing in DIR_INDEX) {
      ownerDir = OPP[DIR_INDEX[facing as Direction]] as number;
    }
  } else if (def.category === 'technical') {
    kind = 'skip';
    issues.push(`${def.id} cannot be placed in survival`);
  } else if (cost.secondary) {
    kind = 'implicit';
    const primary = def.item?.primaryPart;
    if (primary && props[primary.property] === 'upper' && primary.value === 'lower') {
      ownerDir = D_DOWN;
    } else {
      issues.push(`${def.id}: secondary part without a known partner position`);
    }
  }

  const support = resolveSupport(def.physics.support, props);
  const supportDir = support?.dir ?? -1;
  // Attachments are placed by clicking the block they attach to.
  const restrictDir = supportDir >= 0 ? (OPP[supportDir] as number) : -1;

  // Classify properties. State issues only matter for blocks the player places.
  const stateIssues: string[] = [];
  const controlled: Controlled[] = [];
  let interactions = 0;
  let lookDependent = false;
  let halfUsed = false;
  for (const [name, prop] of Object.entries(def.properties)) {
    const target = Object.hasOwn(props, name) ? (props[name] as string) : prop.default;
    const rule = selectRule(def.placement, name, props);
    if (!rule) {
      if (name !== 'waterlogged' && target !== prop.default) {
        stateIssues.push(`${def.id}: ${name}=${target} is not produced by placement`);
      }
      continue;
    }
    switch (rule.source) {
      case 'fixed': {
        const value = rule.value ?? prop.default;
        if (target !== value) {
          if (def.id === 'minecraft:lever' && name === 'powered') interactions += 1;
          else stateIssues.push(`${def.id}: ${name}=${target} cannot be placed (always ${value})`);
        }
        break;
      }
      case 'interaction': {
        const n = prop.values.length;
        const diff = prop.values.indexOf(target) - prop.values.indexOf(prop.default);
        interactions += ((diff % n) + n) % n;
        break;
      }
      case 'neighbors':
      case 'environment':
        break;
      default:
        controlled.push({ name, prop, rule, target });
        if (rule.source.startsWith('player')) lookDependent = true;
        if (rule.source === 'clickedHalf' && target !== 'double') halfUsed = true;
    }
  }

  if (kind === 'place') issues.push(...stateIssues);
  const { masks, maskAny } = emptyMasks(false);
  for (let d = 0; d < 6; d++) {
    if (restrictDir >= 0 && d !== restrictDir) continue;
    const vertical = d < 2;
    for (let half = 0; half < 3; half++) {
      if (vertical ? half !== HALF_NONE : halfUsed === (half === HALF_NONE)) continue;
      let mask = 0;
      for (let look = 0; look < 12; look++) {
        let ok = true;
        for (const c of controlled) {
          const v = produced(c, d, half, look);
          if (v !== undefined && v !== c.target) {
            ok = false;
            break;
          }
        }
        if (ok) mask |= 1 << look;
      }
      masks[d * 3 + half] = mask;
      maskAny[d] = (maskAny[d] as number) | mask;
    }
  }
  if (kind === 'place' && maskAny.every((m) => m === 0)) {
    // Not producible: still plan a placement (ignoring orientation) and report it.
    issues.push(`${def.id}: no click/look combination produces this state`);
    for (let d = 0; d < 6; d++) {
      if (restrictDir >= 0 && d !== restrictDir) continue;
      masks[d * 3] = ALL_LOOKS;
      maskAny[d] = ALL_LOOKS;
    }
  }

  const offers: FaceSupport[] = [];
  for (let d = 0; d < 6; d++) offers.push(faceSupport(def, parsed, DIRS[d] as Direction));
  const modelId = def.render.modelId;
  const standable =
    !fluid &&
    (def.solid ||
      offers[D_UP] === 'full' ||
      offers[D_UP] === 'rigid' ||
      (modelId !== undefined && STANDABLE_MODELS.has(modelId)));

  const role = def.redstone?.role;
  let observerDir = -1;
  if (role === 'observer') {
    const facing = props['facing'];
    if (facing !== undefined && facing in DIR_INDEX) observerDir = DIR_INDEX[facing as Direction];
  }

  return {
    state,
    props,
    def,
    kind,
    baseRank: baseRankOf(def),
    supportDir,
    supportNeeds: support?.needs ?? 'none',
    gravity: def.physics.gravity === true,
    fluid,
    item: cost.item,
    count: cost.count,
    interactions,
    lookDependent,
    masks,
    maskAny,
    offers,
    standable,
    clickable: !fluid && def.category !== 'technical',
    interactive: isInteractive(def),
    observerDir,
    triggers: role !== 'observer' && def.redstone?.triggersOnPlace === true,
    ownerDir,
    issues,
    unknown: false,
    air: AIR_IDS.has(def.id),
  };
}
