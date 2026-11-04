import type {
  BlockRegistry,
  BlockStateString,
  BuildDocument,
  Direction,
  Vec3,
} from '@laracraft/core-model';

/**
 * Redstone simulator contract (lead-owned). Goal: reproduce **Minecraft Java Edition**
 * redstone behaviour tick-accurately ("echte Ingame-Spielregeln"). A Bedrock profile
 * follows later (ADR-0006) behind `edition`.
 *
 * Time: 1 game tick (gt) = 1/20 s; 1 redstone tick = 2 gt. `step()` advances one game tick
 * and processes, in Java's order, scheduled block ticks (by due time, then priority, then
 * scheduling order), block events (piston actions), and the neighbour/shape updates they
 * cause (Java neighbour update order: west, east, down, up, north, south).
 *
 * The world outside the build is air above `groundY` and solid, non-conductive-to-power
 * stone-like ground at and below it, unless configured otherwise.
 */

export type SimEdition = 'java'; // 'bedrock' later

export interface SimOptions {
  readonly edition: SimEdition;
  /** Y at and below which the world is solid ground (default: build min Y − 1). */
  readonly groundY?: number;
  /** Safety bound for update cascades within one tick (default 1 000 000). */
  readonly maxUpdatesPerTick?: number;
}

/** External stimuli a test or the UI applies, like a player would. */
export type Stimulus =
  /** Right-click: lever toggle, button press, repeater delay cycle, comparator mode, door/trapdoor/gate toggle, note block. */
  | { readonly kind: 'use'; readonly pos: Vec3 }
  /** Entity steps on / leaves a pressure plate (or tripwire later). */
  | { readonly kind: 'step-on'; readonly pos: Vec3 }
  | { readonly kind: 'step-off'; readonly pos: Vec3 }
  /** Player places a block (triggers updates like in-game placement). */
  | { readonly kind: 'place'; readonly pos: Vec3; readonly state: BlockStateString }
  /** Player breaks a block. */
  | { readonly kind: 'break'; readonly pos: Vec3 }
  /** Put items into a container (hopper/chest/dropper/dispenser/barrel). */
  | {
      readonly kind: 'insert-items';
      readonly pos: Vec3;
      readonly item: string;
      readonly count: number;
    }
  /** Change daylight for daylight detectors (0–15 sky light). */
  | { readonly kind: 'set-daylight'; readonly level: number };

export interface ContainerSnapshot {
  readonly pos: Vec3;
  readonly slots: readonly ({ readonly item: string; readonly count: number } | null)[];
}

/** Read-only view of the simulated world at the current tick. */
export interface SimView {
  readonly tick: number;
  getState(pos: Vec3): BlockStateString;
  /** Redstone power a block emits into `direction` (weak, 0–15), Java semantics. */
  getEmittedPower(pos: Vec3, direction: Direction): number;
  /** Power level a block receives (max over neighbours, strong + weak as Java computes it). */
  getReceivedPower(pos: Vec3): number;
  /** Is the block powered (e.g. lamp lit condition, piston activation incl. quasi-connectivity in Java)? */
  isPowered(pos: Vec3): boolean;
  getContainer(pos: Vec3): ContainerSnapshot | undefined;
}

export interface Simulation extends SimView {
  apply(stimulus: Stimulus): void;
  /** Advance `ticks` game ticks (default 1). */
  step(ticks?: number): void;
  /** Run until no scheduled ticks/events remain or `maxTicks` elapsed; returns ticks run. */
  settle(maxTicks?: number): number;
  /** Export current block states as a document (for rendering/debugging). */
  toDocument(): BuildDocument;
}

export type CreateSimulationFn = (
  doc: BuildDocument,
  registry: BlockRegistry,
  options?: Partial<SimOptions>,
) => Simulation;

/**
 * Behaviour scenario (data) used by the independent test suite and by
 * `@laracraft/redstone-modules` behaviour specs. Times are game ticks relative to the
 * start of the scenario (after an initial `settle`).
 */
export interface Scenario {
  readonly name: string;
  /** What in-game behaviour this checks, with a source URL. */
  readonly description: string;
  readonly source: string;
  /** Blocks as Java blockstates (air omitted). */
  readonly blocks: readonly { readonly pos: Vec3; readonly state: string }[];
  readonly steps: readonly ScenarioStep[];
}

export type ScenarioStep =
  | { readonly at: number; readonly do: Stimulus }
  | {
      readonly at: number;
      readonly expect:
        | { readonly kind: 'state'; readonly pos: Vec3; readonly state: string }
        /** Only the given properties must match (others ignored). */
        | {
            readonly kind: 'props';
            readonly pos: Vec3;
            readonly props: Readonly<Record<string, string>>;
          }
        | { readonly kind: 'powered'; readonly pos: Vec3; readonly value: boolean }
        | { readonly kind: 'power'; readonly pos: Vec3; readonly level: number }
        | {
            readonly kind: 'items';
            readonly pos: Vec3;
            readonly item: string;
            readonly count: number;
          };
    };
