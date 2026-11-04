import type { BlockStateString } from '@laracraft/core-model';

/**
 * Lara build-operation DSL (lead-owned contract, M3).
 *
 * The LLM never writes blocks directly. It calls tools whose arguments are exactly
 * these operations; the backend validates them against the JSON Schema generated
 * from this file (`schema/`), the client interprets them into ChangeSets
 * (`interpreter/`). Operations are deterministic, validated and size-limited.
 *
 * Coordinates are integer document coordinates (Y up; Java axes: north = −Z, east = +X).
 * Block arguments are blockstate strings (`minecraft:oak_stairs[facing=east]`, missing
 * properties take defaults) and are resolved against the registry; unknown blocks or
 * properties are errors, not guesses.
 */

export interface Pos {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Inclusive box given by two corners (any order). */
export interface Region {
  readonly from: Pos;
  readonly to: Pos;
}

export type HorizontalFacing = 'north' | 'east' | 'south' | 'west';

/** Block argument as written by the model (resolved and canonicalised by the interpreter). */
export type BlockArg = string;

/** Optional mask: only replace cells currently holding one of these blocks (`minecraft:air` allowed). */
export interface MaskArg {
  readonly onlyReplace?: readonly BlockArg[];
}

// --- Shapes -------------------------------------------------------------------

export interface FillOp extends MaskArg {
  readonly op: 'fill';
  readonly region: Region;
  readonly block: BlockArg;
}

/** Hollow box: walls, floor and ceiling of the region; interior cleared to air unless `keepInterior`. */
export interface HollowBoxOp extends MaskArg {
  readonly op: 'hollowBox';
  readonly region: Region;
  readonly block: BlockArg;
  readonly keepInterior?: boolean;
}

/** Straight or diagonal line (3D Bresenham) from `from` to `to`, inclusive. */
export interface LineOp extends MaskArg {
  readonly op: 'line';
  readonly from: Pos;
  readonly to: Pos;
  readonly block: BlockArg;
}

/** Vertical wall between two horizontal points, `height` blocks tall starting at `from.y`. */
export interface WallOp extends MaskArg {
  readonly op: 'wall';
  readonly from: Pos;
  readonly to: Pos;
  readonly height: number;
  readonly block: BlockArg;
}

/** Horizontal floor (one layer) of the region's XZ footprint at `y`. */
export interface FloorOp extends MaskArg {
  readonly op: 'floor';
  readonly region: Region;
  readonly y: number;
  readonly block: BlockArg;
}

export type RoofType = 'gable' | 'hip' | 'shed' | 'flat';

/**
 * Roof over the XZ footprint of `region`, starting one block above `region`'s max Y.
 * `pitch` = rise per run as integer steps (1 = 45° with stairs, 2 = steeper with full
 * blocks + stairs); `ridgeAxis` for gable/shed ('x' | 'z', default: longer side).
 * Uses `stairs` for slopes, `block` for ridge/gaps, optional `overhang` 0–2.
 */
export interface RoofOp {
  readonly op: 'roof';
  readonly region: Region;
  readonly type: RoofType;
  readonly pitch: number;
  readonly stairs: BlockArg;
  readonly block: BlockArg;
  readonly ridgeAxis?: 'x' | 'z';
  readonly overhang?: number;
}

// --- Editing ------------------------------------------------------------------

export interface PlaceBlockOp {
  readonly op: 'placeBlock';
  readonly pos: Pos;
  readonly block: BlockArg;
}

export interface ReplaceOp {
  readonly op: 'replace';
  readonly region: Region;
  readonly from: BlockArg;
  readonly to: BlockArg;
}

export interface ClearOp {
  readonly op: 'clear';
  readonly region: Region;
}

export interface MirrorOp {
  readonly op: 'mirror';
  readonly region: Region;
  readonly axis: 'x' | 'z';
}

export interface RotateOp {
  readonly op: 'rotate';
  readonly region: Region;
  /** Clockwise quarter turns seen from above. */
  readonly turns: 1 | 2 | 3;
}

export interface CopyOp {
  readonly op: 'copy';
  readonly region: Region;
  /** Destination of the region's min corner. */
  readonly to: Pos;
  /** Number of copies along `step` (default 1). */
  readonly repeat?: number;
  /** Offset between repeated copies (default: region size along X). */
  readonly step?: Pos;
}

// --- Modules ------------------------------------------------------------------

/** Insert a tested redstone/building module from `@laracraft/redstone-modules`. */
export interface InsertModuleOp {
  readonly op: 'insertModule';
  readonly moduleId: string;
  /** Position of the module's origin (its documented anchor). */
  readonly pos: Pos;
  readonly facing: HorizontalFacing;
  /** Module-specific parameters (validated by the module's own schema). */
  readonly params?: Readonly<Record<string, string | number | boolean>>;
}

export type Operation =
  | FillOp
  | HollowBoxOp
  | LineOp
  | WallOp
  | FloorOp
  | RoofOp
  | PlaceBlockOp
  | ReplaceOp
  | ClearOp
  | MirrorOp
  | RotateOp
  | CopyOp
  | InsertModuleOp;

export type OperationName = Operation['op'];

/** Limits enforced on every operation (and per Lara turn). */
export interface DslLimits {
  /** Max cells a single operation may touch. */
  readonly maxCellsPerOp: number; // default 262 144 (64³)
  /** Max total changed cells per Lara turn. */
  readonly maxCellsPerTurn: number; // default 1 048 576
  /** Max operations per Lara turn. */
  readonly maxOpsPerTurn: number; // default 200
  /** Allowed coordinate range per axis (absolute). */
  readonly maxAbsCoord: number; // default 4096
}

export const DEFAULT_DSL_LIMITS: DslLimits = {
  maxCellsPerOp: 262_144,
  maxCellsPerTurn: 1_048_576,
  maxOpsPerTurn: 200,
  maxAbsCoord: 4096,
};

export type DslErrorCode =
  | 'schema' // malformed operation (missing/extra fields, wrong types)
  | 'unknown-block' // block id not in registry
  | 'invalid-state' // property/value not allowed for the block
  | 'limit' // exceeds a DslLimits value
  | 'unknown-module'
  | 'module-params'
  | 'not-in-edition'; // block/module not available in the build's target edition (ADR-0006)

/** Structured error returned to the model as a tool error so it can correct itself. */
export interface DslError {
  readonly code: DslErrorCode;
  /** JSON-pointer-ish path into the operation, e.g. `/region/from/x`. */
  readonly path: string;
  readonly message: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly operation: Operation }
  | { readonly ok: false; readonly errors: readonly DslError[] };

/** Summary of what an applied operation did (for Lara's next turn and the chat UI). */
export interface OperationReport {
  readonly op: OperationName;
  readonly changed: number;
  /** States actually written, canonical, with counts. */
  readonly blocks: readonly { readonly state: BlockStateString; readonly count: number }[];
}
