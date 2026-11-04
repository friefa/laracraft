import type { Vec3 } from '@laracraft/core-model';
import type { Scenario, ScenarioStep, Stimulus } from '../../lib/api';

/**
 * Small builders that keep the scenario data readable.
 *
 * Coordinate conventions (Java): +x = east, −x = west, +z = south, −z = north, +y = up.
 * Every scenario has at least one block at y = 0 so the default ground (solid,
 * non-conductive, at build min Y − 1) is directly below y = 0.
 *
 * Scenario time: `at` is in game ticks after the initial settle. Stimuli are applied
 * between ticks, like player input in Java (the "player phase"). A scheduled tick with
 * delay `d` caused by a stimulus at `at = t` therefore runs in tick `t + d`, and a
 * piston block event caused directly by a stimulus runs one tick later (`t + 1`).
 */

export type ScenarioBlock = Scenario['blocks'][number];
type Expectation = Extract<ScenarioStep, { expect: unknown }>['expect'];

export const WIKI = 'https://minecraft.wiki/w/';

export const p = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const b = (pos: Vec3, state: string): ScenarioBlock => ({ pos, state });

// --- stimuli ----------------------------------------------------------------------------

const act = (at: number, stimulus: Stimulus): ScenarioStep => ({ at, do: stimulus });

export const use = (at: number, pos: Vec3): ScenarioStep => act(at, { kind: 'use', pos });
export const place = (at: number, pos: Vec3, state: string): ScenarioStep =>
  act(at, { kind: 'place', pos, state: state as Extract<Stimulus, { kind: 'place' }>['state'] });
export const breakBlock = (at: number, pos: Vec3): ScenarioStep => act(at, { kind: 'break', pos });
export const stepOn = (at: number, pos: Vec3): ScenarioStep => act(at, { kind: 'step-on', pos });
export const stepOff = (at: number, pos: Vec3): ScenarioStep => act(at, { kind: 'step-off', pos });
export const insert = (at: number, pos: Vec3, count: number, item = COBBLE): ScenarioStep =>
  act(at, { kind: 'insert-items', pos, item, count });
export const daylight = (at: number, level: number): ScenarioStep =>
  act(at, { kind: 'set-daylight', level });

// --- expectations -----------------------------------------------------------------------

const exp = (at: number, expect: Expectation): ScenarioStep => ({ at, expect });

export const props = (
  at: number,
  pos: Vec3,
  values: Readonly<Record<string, string>>,
): ScenarioStep => exp(at, { kind: 'props', pos, props: values });
export const state = (at: number, pos: Vec3, s: string): ScenarioStep =>
  exp(at, { kind: 'state', pos, state: s });
export const powered = (at: number, pos: Vec3, value: boolean): ScenarioStep =>
  exp(at, { kind: 'powered', pos, value });
export const items = (at: number, pos: Vec3, count: number, item = COBBLE): ScenarioStep =>
  exp(at, { kind: 'items', pos, item, count });

/** Shorthands for the most common property checks. */
export const lit = (at: number, pos: Vec3, value: boolean): ScenarioStep =>
  props(at, pos, { lit: String(value) });
export const on = (at: number, pos: Vec3, value: boolean): ScenarioStep =>
  props(at, pos, { powered: String(value) });
export const dustPower = (at: number, pos: Vec3, level: number): ScenarioStep =>
  props(at, pos, { power: String(level) });
export const extended = (at: number, pos: Vec3, value: boolean): ScenarioStep =>
  props(at, pos, { extended: String(value) });
export const air = (at: number, pos: Vec3): ScenarioStep => state(at, pos, 'minecraft:air');

// --- block states -----------------------------------------------------------------------

export const COBBLE = 'minecraft:cobblestone';
export const STONE = 'minecraft:stone';
export const GLASS = 'minecraft:glass';
export const OBSIDIAN = 'minecraft:obsidian';
export const REDSTONE_BLOCK = 'minecraft:redstone_block';

export type Side = 'side' | 'up';
export type HFacing = 'north' | 'south' | 'west' | 'east';
export type Facing6 = HFacing | 'up' | 'down';

/** Redstone dust with the given connections (missing = none). */
export const wire = (c: { n?: Side; e?: Side; s?: Side; w?: Side }, power = 0): string =>
  `minecraft:redstone_wire[east=${c.e ?? 'none'},north=${c.n ?? 'none'},power=${power},south=${
    c.s ?? 'none'
  },west=${c.w ?? 'none'}]`;
/** Unconnected dust in Java 1.16+ is a cross (points into all four sides). */
export const CROSS = wire({ n: 'side', e: 'side', s: 'side', w: 'side' });
export const DOT = wire({});
export const WIRE_EW = wire({ e: 'side', w: 'side' });
export const WIRE_NS = wire({ n: 'side', s: 'side' });

/** Lever on the floor (attached to the block below). */
export const LEVER = 'minecraft:lever[face=floor,facing=north,powered=false]';
/** Lever on a wall; `facing` points away from the block it is attached to. */
export const wallLever = (facing: HFacing): string =>
  `minecraft:lever[face=wall,facing=${facing},powered=false]`;
export const button = (wood: string, face: 'floor' | 'wall', facing: HFacing): string =>
  `minecraft:${wood}_button[face=${face},facing=${facing},powered=false]`;
export const LAMP = 'minecraft:redstone_lamp[lit=false]';
export const TORCH = 'minecraft:redstone_torch[lit=true]';
/** Wall torch; `facing` points away from the block it hangs on. */
export const wallTorch = (facing: HFacing, isLit = true): string =>
  `minecraft:redstone_wall_torch[facing=${facing},lit=${isLit}]`;
/** Repeater: `facing` points from the output to the input (input at pos + facing). */
export const repeater = (facing: HFacing, delay = 1): string =>
  `minecraft:repeater[delay=${delay},facing=${facing},locked=false,powered=false]`;
/** Comparator: `facing` points from the output to the input (rear at pos + facing). */
export const comparator = (facing: HFacing, mode: 'compare' | 'subtract' = 'compare'): string =>
  `minecraft:comparator[facing=${facing},mode=${mode},powered=false]`;
export const piston = (facing: Facing6, sticky = false): string =>
  `minecraft:${sticky ? 'sticky_piston' : 'piston'}[extended=false,facing=${facing}]`;
export const pistonHead = (facing: Facing6, sticky = false): string =>
  `minecraft:piston_head[facing=${facing},short=false,type=${sticky ? 'sticky' : 'normal'}]`;
/** Observer: `facing` is the direction it watches; the output is on the opposite face. */
export const observer = (facing: Facing6): string =>
  `minecraft:observer[facing=${facing},powered=false]`;
export const hopper = (facing: 'down' | HFacing): string =>
  `minecraft:hopper[enabled=true,facing=${facing}]`;
export const CHEST = 'minecraft:chest[facing=north,type=single,waterlogged=false]';
export const dropper = (facing: Facing6, kind: 'dropper' | 'dispenser' = 'dropper'): string =>
  `minecraft:${kind}[facing=${facing},triggered=false]`;
