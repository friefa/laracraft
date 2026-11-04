import type { HorizontalDirection, Vec3 } from '@laracraft/core-model';
import type { BuildPlan, StepAction } from '@laracraft/build-order';

/** Horizontal offset along one axis: `distance` blocks towards `direction`. */
export interface AxisOffset {
  readonly direction: HorizontalDirection;
  /** Always ≥ 1. */
  readonly distance: number;
}

/**
 * How the stand position lies horizontally relative to the target block:
 * - `same`: same column (directly above/below it, or in it when pillaring)
 * - `adjacent`: a direct side neighbour (one block in one compass direction)
 * - `diagonal`: a corner neighbour (one block along both axes)
 * - `offset`: anything further away
 */
export type HorizontalRelation = 'same' | 'adjacent' | 'diagonal' | 'offset';

/**
 * Structured, language-neutral description of where the player stands, relative to the
 * block the action is about (`action.pos`). The UI turns it into a sentence via i18n.
 */
export interface StandPositionDescription {
  /** `standAt - pos` (feet relative to the target block; north = -Z, east = +X, up = +Y). */
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  readonly relation: HorizontalRelation;
  /** North/south part of the offset (absent when `dz === 0`). */
  readonly northSouth?: AxisOffset;
  /** East/west part of the offset (absent when `dx === 0`). */
  readonly eastWest?: AxisOffset;
  /**
   * Pillaring: the player's feet are in the target cell itself (standing on the block
   * below it) and the new block is placed under the feet at the top of a jump.
   */
  readonly pillar: boolean;
  /** The block the player stands on is temporary (scaffolding or a support). */
  readonly onTemporary: boolean;
}

export interface DescribeStandOptions {
  /** The block below `standAt` is temporary at that moment (see {@link temporaryBlockAt}). */
  readonly onTemporary?: boolean;
}

function axis(
  delta: number,
  negative: HorizontalDirection,
  positive: HorizontalDirection,
): AxisOffset | undefined {
  return delta === 0
    ? undefined
    : { direction: delta < 0 ? negative : positive, distance: Math.abs(delta) };
}

function relationOf(ax: number, az: number): HorizontalRelation {
  if (ax === 0 && az === 0) return 'same';
  if (ax + az === 1) return 'adjacent';
  if (ax === 1 && az === 1) return 'diagonal';
  return 'offset';
}

/**
 * Describes the stand position of an action relative to its target block, or `null`
 * when the action has no stand position (a removal without `standAt`).
 */
export function describeStandPosition(
  action: StepAction,
  options: DescribeStandOptions = {},
): StandPositionDescription | null {
  const standAt = action.standAt;
  if (!standAt) return null;
  const dx = standAt.x - action.pos.x;
  const dy = standAt.y - action.pos.y;
  const dz = standAt.z - action.pos.z;
  const relation = relationOf(Math.abs(dx), Math.abs(dz));
  const northSouth = axis(dz, 'north', 'south');
  const eastWest = axis(dx, 'west', 'east');
  return {
    dx,
    dy,
    dz,
    relation,
    ...(northSouth ? { northSouth } : {}),
    ...(eastWest ? { eastWest } : {}),
    pillar: action.kind === 'place' && relation === 'same' && dy === 0,
    onTemporary: options.onTemporary ?? false,
  };
}

const sameCell = (a: Vec3, b: Vec3) => a.x === b.x && a.y === b.y && a.z === b.z;

/**
 * Whether a temporary block (support or scaffold) occupies `pos` right before action
 * `actionIndex` of step `stepIndex` runs: placed as temporary earlier and not removed since.
 */
export function temporaryBlockAt(
  plan: BuildPlan,
  stepIndex: number,
  actionIndex: number,
  pos: Vec3,
): boolean {
  let temporary = false;
  for (let s = 0; s < plan.steps.length && s <= stepIndex; s++) {
    const actions = plan.steps[s]?.actions ?? [];
    const end = s === stepIndex ? Math.min(actionIndex, actions.length) : actions.length;
    for (let i = 0; i < end; i++) {
      const a = actions[i] as StepAction;
      if (sameCell(a.pos, pos)) temporary = a.kind === 'place' && a.temporary === true;
    }
  }
  return temporary;
}
