import type { BlockStateString, Direction, HorizontalDirection, Vec3 } from '@laracraft/core-model';

/**
 * Build-order engine contract (M2). Owned by the lead; implementations live in
 * `planner/` (plan generation) and `validator/` (independent rule checker).
 *
 * Coordinates are document coordinates (Y up, Java axes: north = -Z, east = +X).
 * Everything here is plain data so it can cross a Web Worker boundary.
 */

/** Java survival block interaction range (attribute `block_interaction_range`). */
export const DEFAULT_REACH = 4.5;

/** Eye height above the feet (standing). */
export const EYE_HEIGHT = 1.62;

/**
 * Extra eye height at the peak of a jump (Java jump apex ≈ 1.2522 blocks). A jumping
 * placement needs air at standAt, +1 and +2 (head clearance at the apex).
 */
export const JUMP_HEIGHT = 1.25;

export interface BuildOrderOptions {
  /** Target number of placements per step; steps may be smaller at layer/phase boundaries. */
  readonly minStepSize: number; // default 10
  readonly maxStepSize: number; // default 30
  /** Block used for temporary supports (under gravity blocks) and scaffolding. */
  readonly scaffoldBlock: BlockStateString; // default 'minecraft:dirt'
  /** Max distance from the player's eye to the clicked face centre. */
  readonly reach: number; // default DEFAULT_REACH
  /**
   * Y of the ground the build stands on: positions at `groundY` count as supported
   * by the world (the build's lowest layer sits on existing terrain).
   * Default: the minimum Y of the build minus 1.
   */
  readonly groundY?: number;
}

/** How the player has to look while placing (drives facing-dependent blockstates). */
export interface LookDirection {
  /** Horizontal component of the look direction. */
  readonly horizontal: HorizontalDirection;
  /** Vertical component. `up`/`down` matter for 3D-facing blocks (piston, observer, dispenser). */
  readonly vertical: 'up' | 'level' | 'down';
}

/** One block placement, fully specified so a survival player can reproduce the exact state. */
export interface PlaceAction {
  readonly kind: 'place';
  readonly pos: Vec3;
  /** Canonical target blockstate. */
  readonly state: BlockStateString;
  /** Item to hold (from the registry's ItemCost; e.g. `minecraft:redstone` for wire). */
  readonly item: string;
  /** Block position the player's feet are in while placing. */
  readonly standAt: Vec3;
  readonly look: LookDirection;
  /** The existing block the player right-clicks and which face of it. */
  readonly clickOn: { readonly pos: Vec3; readonly face: Direction };
  /** Upper or lower half of the clicked face (stairs, slabs, trapdoors). */
  readonly clickHalf?: 'top' | 'bottom';
  /** Hold sneak while placing (e.g. placing against an interactive block like a chest). */
  readonly sneak?: boolean;
  /**
   * Place at the apex of a jump: eye height EYE_HEIGHT + JUMP_HEIGHT. Lets players reach the
   * top face of blocks at head height (third wall row) and pillar up (place below own feet,
   * then `standAt` is the jump origin and the new block is at `standAt`).
   */
  readonly jump?: boolean;
  /** Right-clicks on the placed block afterwards (repeater delay, comparator mode, wire dot). */
  readonly interactions?: number;
  /** True for blocks that are not part of the final build (supports, scaffolding). */
  readonly temporary?: boolean;
}

export interface RemoveAction {
  readonly kind: 'remove';
  readonly pos: Vec3;
  /** State expected at `pos` before removal (always a temporary block placed earlier). */
  readonly state: BlockStateString;
  readonly reason: 'temporary-support' | 'scaffold';
  /** Where the player stands to break it (optional; reach is checked when present). */
  readonly standAt?: Vec3;
}

export type StepAction = PlaceAction | RemoveAction;

/** Machine-readable hint; UI renders it via i18n key `guide.hint.<code>`. */
export type HintCode =
  | 'temporary-support' // gravity block needs a support that is removed later
  | 'scaffold' // scaffolding needed to reach blocks
  | 'remove-temporary' // this step removes temporary blocks
  | 'keep-circuit-open' // do not connect power yet
  | 'power-source-last' // this step closes the circuit
  | 'observer-order' // observers placed after the block they watch (or explicitly before, to avoid pulses)
  | 'fluids-last' // water/lava are placed at the end
  | 'look-direction' // facing-dependent block: follow look direction exactly
  | 'interaction'; // right-click after placing

export interface Hint {
  readonly code: HintCode;
  /** Positions the hint refers to (for highlighting). */
  readonly positions?: readonly Vec3[];
  readonly params?: Readonly<Record<string, string | number>>;
}

export interface MaterialCount {
  readonly item: string;
  readonly count: number;
}

export type BuildPhase = 'structure' | 'redstone' | 'power' | 'fluids' | 'cleanup';

export interface BuildStep {
  readonly index: number;
  readonly phase: BuildPhase;
  readonly actions: readonly StepAction[];
  /** Items needed for this step (placements only; temporary blocks included). */
  readonly materials: readonly MaterialCount[];
  readonly hints: readonly Hint[];
  /** Y range covered by this step's placements, for the layer view. */
  readonly yRange: readonly [number, number];
}

export type WarningCode =
  | 'unknown-block' // state not in registry; placed without rules
  | 'unsupported-state' // a state that can't be produced in survival (e.g. floating attachment)
  | 'unreachable' // engine could not find a stand position even with scaffolding
  | 'cycle'; // dependency cycle broken heuristically

export interface PlanWarning {
  readonly code: WarningCode;
  readonly pos?: Vec3;
  readonly message: string;
}

export interface BuildPlan {
  readonly steps: readonly BuildStep[];
  /** Final build materials (temporary blocks excluded). */
  readonly totalMaterials: readonly MaterialCount[];
  /** Extra items needed for temporary blocks (returned after removal). */
  readonly temporaryMaterials: readonly MaterialCount[];
  readonly warnings: readonly PlanWarning[];
  readonly stats: {
    readonly blocks: number;
    readonly placements: number;
    readonly removals: number;
    readonly millis: number;
  };
}

/** Rules checked by the validator; each corresponds to a section of the briefing. */
export type RuleId =
  | 'completeness' // every build block placed exactly once with the exact state, nothing else remains
  | 'support' // attachment placed only when its support exists and is strong enough
  | 'gravity' // gravity blocks only on existing support
  | 'click-target' // clickOn is an existing block adjacent to pos, face points to pos
  | 'orientation' // look/click/half produce the target state per registry placement rules
  | 'reachability' // eye-to-face distance <= reach, standAt is free (2 blocks of air) and standing on something
  | 'redstone-safety' // triggersOnPlace components not placed into an already powered/active context
  | 'fluids-last' // fluids only in the fluids phase
  | 'temporary-cleanup'; // every temporary block removed, removals only of temporary blocks

export interface ValidationIssue {
  readonly rule: RuleId;
  readonly step: number;
  readonly action: number;
  readonly pos: Vec3;
  readonly message: string;
}
