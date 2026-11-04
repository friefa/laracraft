import type { Direction, HorizontalDirection, Vec3 } from '@laracraft/core-model';

/**
 * Redstone module library contract (M3.2).
 *
 * A module is a small, tested redstone circuit that Lara (via the DSL operation
 * `insertModule`) or the editor can place as a whole. Modules are pure data plus a
 * deterministic `build` function; they contain no simulation.
 *
 * Coordinates:
 * - Local coordinates are given for the module facing **north** (Java axes: north = −Z,
 *   east = +X, Y up). The module occupies the box `[0, size)` on every axis.
 * - Local `y = 0` is the first layer above the ground. Every module assumes full,
 *   sturdy ground (e.g. stone) under its whole footprint.
 * - `build(params, facing)` returns offsets **relative to the anchor**: the module
 *   is rotated clockwise (seen from above) around its anchor by 0/1/2/3 quarter turns
 *   for facing north/east/south/west. The world position of a block is the
 *   `insertModule` position plus its offset.
 * - Blockstates are canonical Java Edition states (all properties spelled out), stored
 *   in the module's resting state: inputs off, nothing moving, no item inside. Values the
 *   game derives from neighbours (wire power, torch `lit`, repeater `powered`/`locked`,
 *   lamp `lit`, hopper `enabled`) are given as they settle in that resting state.
 */

export type Pos = Vec3;

/** Direction the module's documented front points to. */
export type ModuleFacing = HorizontalDirection;

export type ModuleCategory = 'door' | 'clock' | 'logic' | 'sorting' | 'lighting' | 'transport';

/**
 * - `tested`: structure and buildability are covered by this library's tests (every
 *   block resolves, all four facings plan and validate without issues) and the
 *   behaviour is specified in {@link BehaviourSpec} for a future simulator.
 * - `untested`: design is believed to work but no test or solid source covers it.
 * - `incompatible`: known not to work in that edition.
 */
export type EditionStatus = 'tested' | 'untested' | 'incompatible';

export interface ModuleEditions {
  readonly java: EditionStatus;
  readonly bedrock: EditionStatus;
}

export interface ModulePort {
  /** Stable port name, unique per module (i18n: `redstoneModule.<id>.port.<name>`). */
  readonly name: string;
  readonly kind: 'input' | 'output';
  /** Local position (north orientation) of the block that carries the port. */
  readonly pos: Pos;
  /** Side of that block where the outside connection is made (north orientation). */
  readonly side: Direction;
  /** `pulse`: short signals are expected/produced; `level`: the value is held. */
  readonly signal?: 'pulse' | 'level';
  /** What passes the port; default `redstone`. */
  readonly carrier?: 'redstone' | 'items';
}

export type ModuleParamValue = string | number | boolean;
export type ModuleParams = Readonly<Record<string, ModuleParamValue>>;

interface ParamSpecBase {
  /** i18n key of the parameter label/description. */
  readonly descriptionKey: string;
}

/** JSON-schema-like parameter specs (subset: integer range, boolean, string enum). */
export interface IntegerParamSpec extends ParamSpecBase {
  readonly type: 'integer';
  readonly minimum: number;
  readonly maximum: number;
  readonly default: number;
}

export interface BooleanParamSpec extends ParamSpecBase {
  readonly type: 'boolean';
  readonly default: boolean;
}

export interface EnumParamSpec extends ParamSpecBase {
  readonly type: 'string';
  readonly enum: readonly string[];
  readonly default: string;
}

export type ParamSpec = IntegerParamSpec | BooleanParamSpec | EnumParamSpec;

/** One block of a built module. `state` is a canonical Java blockstate. */
export interface ModuleBlock {
  readonly offset: Pos;
  readonly state: string;
}

// --- Behaviour (machine-readable, checked by a future redstone simulator) ------

/** `true`/`false` = signal on/off; a number = exact signal strength 0–15. */
export type PortValue = boolean | number;

/** A cell that must (not) contain a non-air block, e.g. a closed doorway. */
export interface CellExpectation {
  readonly pos: Pos;
  readonly filled: boolean;
}

/** A blockstate property at a local position, e.g. lamp `lit=true`. */
export interface PropertyExpectation {
  readonly pos: Pos;
  readonly property: string;
  readonly value: string;
}

/** The output toggles forever with this period and on-time (game ticks). */
export interface OscillationExpectation {
  readonly port: string;
  readonly periodTicks: number;
  readonly onTicks: number;
}

/** After the step's input change the output rises after `delayTicks` and stays on for `lengthTicks`. */
export interface PulseExpectation {
  readonly port: string;
  readonly delayTicks: number;
  readonly lengthTicks: number;
}

/** Item counts in a container port. `sort` = the filtered item, `other` = any other item. */
export interface ItemCount {
  readonly port: string;
  readonly item: 'sort' | 'other';
  readonly count: number;
}

export interface BehaviourExpectation {
  readonly outputs?: Readonly<Record<string, PortValue>>;
  readonly cells?: readonly CellExpectation[];
  readonly properties?: readonly PropertyExpectation[];
  readonly oscillation?: OscillationExpectation;
  readonly pulse?: PulseExpectation;
  readonly items?: readonly ItemCount[];
}

export interface BehaviourStep {
  readonly description: string;
  /** Input ports held at these values from the start of the step (levers flipped). */
  readonly set?: Readonly<Record<string, PortValue>>;
  /** Drive an input port with one pulse of `ticks` game ticks at the start of the step. */
  readonly pulse?: { readonly port: string; readonly ticks: number };
  /** Items inserted into an item input port at the start of the step. */
  readonly insertItems?: readonly ItemCount[];
  /** Game ticks to simulate before `expect` is checked (upper bound, 20 ticks = 1 s). */
  readonly waitTicks: number;
  readonly expect: BehaviourExpectation;
}

/**
 * Inputs → expected outputs with timing. All times are game ticks (1 redstone tick =
 * 2 game ticks). Steps run in order on one instance, starting from the stored state.
 */
export interface BehaviourSpec {
  /** `specified`: written down, not yet checked by a simulator. */
  readonly status: 'specified';
  /** Parameters the spec assumes (defaults otherwise). */
  readonly params?: ModuleParams;
  /** Container contents to load before the first step (e.g. a sorter's filter hopper). */
  readonly preload?: readonly {
    readonly pos: Pos;
    readonly item: 'sort' | 'other';
    readonly count: number;
  }[];
  /** Holds for the stored resting state, before any step. */
  readonly initial: BehaviourExpectation;
  readonly steps: readonly BehaviourStep[];
  readonly notes?: string;
}

// --- Module ----------------------------------------------------------------------

export interface RedstoneModule {
  /** Stable id, snake_case (used as DSL `moduleId` and in i18n keys). */
  readonly id: string;
  /** `redstoneModule.<id>.name` */
  readonly nameKey: string;
  /** `redstoneModule.<id>.description` */
  readonly descriptionKey: string;
  readonly category: ModuleCategory;
  readonly editions: ModuleEditions;
  /** Free-form (English) notes per edition, e.g. why Bedrock is untested. */
  readonly editionNotes?: { readonly java?: string; readonly bedrock?: string };
  /** Bounding box size in the north orientation. */
  readonly size: Pos;
  /** Rotation origin and insertion point, local north coordinates. */
  readonly anchor: Pos;
  /** Short English summary of the design. */
  readonly design: string;
  /** Sources/references for the design and the mechanics it relies on. */
  readonly references: readonly string[];
  readonly ports: readonly ModulePort[];
  readonly params?: Readonly<Record<string, ParamSpec>>;
  readonly behaviour: BehaviourSpec;
  /**
   * Builds the module. Throws {@link ModuleParamsError} for invalid parameters.
   * `facing` defaults to `north`.
   */
  build(params?: ModuleParams, facing?: ModuleFacing): readonly ModuleBlock[];
}

/**
 * Minimal catalogue shape consumed by the Lara DSL interpreter (`insertModule`).
 * Declared here structurally; `libs/lara-dsl` defines its own interface of the same shape.
 */
export interface ModuleCatalogueEntry {
  readonly id: string;
  readonly size: Pos;
  build(params: ModuleParams | undefined, facing: ModuleFacing): readonly ModuleBlock[];
}

export interface ModuleCatalogue<M extends ModuleCatalogueEntry = RedstoneModule> {
  get(id: string): M | undefined;
  all(): readonly M[];
}

export class ModuleParamsError extends Error {
  constructor(
    readonly moduleId: string,
    readonly errors: readonly string[],
  ) {
    super(`Invalid parameters for module ${moduleId}: ${errors.join('; ')}`);
    this.name = 'ModuleParamsError';
  }
}
