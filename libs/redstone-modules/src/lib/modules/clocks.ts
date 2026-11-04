import { LocalBuilder, defineModule, moduleKey, wire } from '../define';

/** Period of the hand-placed observer clock in game ticks (2 on, 4 off). */
export const OBSERVER_CLOCK_PERIOD_TICKS = 6;

/**
 * Observer clock (Java Edition).
 *
 * Design: two observers facing each other. Each one watches the other's face; when one
 * changes state, the other fires 2 game ticks later and stays on for 2 game ticks.
 * When both observers are placed by hand, each observer is still on when the other one
 * turns on, so it misses that change and only reacts to the other turning off: the pair
 * settles into a 6 gt (3 rt) clock, 2 gt on and 4 gt off per observer
 * (https://minecraft.wiki/w/Redstone_circuits/Clock, "Double Observer Clock": "Manually
 * placing each observer facing each other will set them in a state which will form a
 * 6gt(3rt) clock"). The 4 gt variant needs an observer pushed into place by a piston; a
 * player building this module by hand does not get it.
 *
 * Starting: the clock starts when the second observer is placed, because the first one
 * sees that placement. The stored state is a snapshot without pending ticks (both
 * observers off), so a pasted or loaded copy stands still until a player breaks and places
 * one observer again; the behaviour spec does exactly that. It cannot be switched off
 * (break one observer to stop it). Same arrangement as the build-order golden build
 * `observer-clock`.
 *
 * References:
 * - https://minecraft.wiki/w/Observer (detection, 2 gt delay, 2 gt pulse)
 * - https://minecraft.wiki/w/Redstone_circuits/Clock (double observer clock, 6 gt by hand)
 * - libs/build-order/src/testing/golden/observer-clock.ts
 *
 * Local layout (x = 0, y = 0), facing north = the front output points to −Z:
 *   z=0  observer facing=south (watches z=1, outputs north)
 *   z=1  observer facing=north (watches z=0, outputs south)
 */
export const OBSERVER_CLOCK = defineModule({
  id: 'observer_clock',
  nameKey: moduleKey('observer_clock', 'name'),
  descriptionKey: moduleKey('observer_clock', 'description'),
  category: 'clock',
  editions: { java: 'tested', bedrock: 'untested' },
  editionNotes: {
    bedrock:
      'Facing observer pairs are also used as clocks in Bedrock, but observer timing differs in ' +
      'detail there; period and pulse length are not verified.',
  },
  size: { x: 1, y: 1, z: 2 },
  anchor: { x: 0, y: 0, z: 0 },
  design:
    'Two observers facing each other, placed by hand: 2-tick pulses every 6 game ticks (2 on, 4 off).',
  references: [
    'https://minecraft.wiki/w/Observer',
    'https://minecraft.wiki/w/Redstone_circuits/Clock',
    'libs/build-order/src/testing/golden/observer-clock.ts',
  ],
  ports: [
    { name: 'out', kind: 'output', pos: { x: 0, y: 0, z: 0 }, side: 'north', signal: 'pulse' },
    { name: 'outBack', kind: 'output', pos: { x: 0, y: 0, z: 1 }, side: 'south', signal: 'pulse' },
  ],
  behaviour: {
    status: 'specified',
    notes:
      'The stored state has no pending ticks, so the clock does not run by itself after loading; ' +
      'step 2 places the back observer again by hand, which starts it like building it does.',
    initial: { outputs: { out: false, outBack: false } },
    steps: [
      {
        description: 'Loaded as stored: nothing is scheduled, the clock stands still.',
        waitTicks: 20,
        expect: { outputs: { out: false, outBack: false } },
      },
      {
        description:
          'Break and place the back observer by hand: the clock starts, 2 game ticks on, 4 off.',
        rebuild: [{ x: 0, y: 0, z: 1 }],
        waitTicks: 40,
        expect: {
          oscillation: { port: 'out', periodTicks: OBSERVER_CLOCK_PERIOD_TICKS, onTicks: 2 },
        },
      },
      {
        description: 'The back output runs with the same period.',
        waitTicks: 40,
        expect: {
          oscillation: { port: 'outBack', periodTicks: OBSERVER_CLOCK_PERIOD_TICKS, onTicks: 2 },
        },
      },
    ],
  },
  blocks() {
    return new LocalBuilder()
      .set(0, 0, 0, 'minecraft:observer[facing=south,powered=false]')
      .set(0, 0, 1, 'minecraft:observer[facing=north,powered=false]')
      .blocks();
  },
});

const DEFAULT_DELAY = 2;

/** Period of the repeater clock in game ticks for a repeater delay `d` (redstone ticks). */
export const repeaterClockPeriodTicks = (d: number): number => 4 + 8 * d;

const CLOCK_OSCILLATION = {
  port: 'out',
  periodTicks: repeaterClockPeriodTicks(DEFAULT_DELAY),
  onTicks: repeaterClockPeriodTicks(DEFAULT_DELAY) / 2,
};

/**
 * Repeater loop clock with a torch inverter and a stop lever (Java Edition), also known
 * as the torch–repeater clock.
 *
 * Design: a redstone torch on block B feeds a loop of dust and two repeaters that ends in
 * B again. When the signal returns, B is powered and the torch turns off; that "off"
 * travels around the loop and turns it back on. Half period = torch (1 rt) + both
 * repeaters (2 × delay rt) → period = 2 × (1 + 2·delay) rt = 4 + 8·delay game ticks.
 * The loop is self-starting (no start pulse needed), unlike a pure repeater ring.
 * A lever on top of B holds B powered: torch off, clock stopped. The module is stored
 * with the lever off (a placed lever is always off), i.e. running: the stored state is the
 * snapshot right after the torch is placed (torch lit, the two dusts next to it powered,
 * the repeaters not yet on). Flip the lever on to stop it.
 * Torch burnout (more than 8 turn-offs within 60 game ticks) cannot happen: at delay 1
 * the torch turns off 5 times per 60 game ticks.
 *
 * References:
 * - https://minecraft.wiki/w/Redstone_circuits/Clock (torch–repeater clock)
 * - https://minecraft.wiki/w/Redstone_Torch (1 rt delay, burnout)
 * - https://minecraft.wiki/w/Redstone_Repeater (delay 1–4 rt)
 *
 * Local layout (y = 0; lever at y = 1 on top of B), facing north = output dust at −Z:
 *
 *   z=0   .    .    .    o       o = output dust
 *   z=1   w    R2>  B    T       B = stone (+ lever on top), T = wall torch on B (facing east)
 *   z=2   w    w    <R1  w       R2 signal → east into B, R1 signal → west
 *   x=    0    1    2    3
 */
export const REPEATER_CLOCK = defineModule({
  id: 'repeater_clock',
  nameKey: moduleKey('repeater_clock', 'name'),
  descriptionKey: moduleKey('repeater_clock', 'description'),
  category: 'clock',
  editions: { java: 'tested', bedrock: 'untested' },
  editionNotes: {
    bedrock:
      'Uses only torch, repeater and dust delays, which exist in Bedrock with the same tick ' +
      'values; torch burnout rules and the exact period are not verified there.',
  },
  size: { x: 4, y: 2, z: 3 },
  anchor: { x: 0, y: 0, z: 0 },
  design:
    'Torch inverter with a two-repeater feedback loop; period 4 + 8·delay game ticks; lever on top stops it.',
  references: [
    'https://minecraft.wiki/w/Redstone_circuits/Clock',
    'https://minecraft.wiki/w/Redstone_Torch',
    'https://minecraft.wiki/w/Redstone_Repeater',
  ],
  ports: [
    { name: 'stop', kind: 'input', pos: { x: 2, y: 1, z: 1 }, side: 'up', signal: 'level' },
    { name: 'out', kind: 'output', pos: { x: 3, y: 0, z: 0 }, side: 'north', signal: 'pulse' },
  ],
  params: {
    delay: {
      type: 'integer',
      minimum: 1,
      maximum: 4,
      default: DEFAULT_DELAY,
      descriptionKey: moduleKey('repeater_clock', 'param.delay'),
    },
  },
  behaviour: {
    status: 'specified',
    params: { delay: DEFAULT_DELAY },
    initial: {
      outputs: { out: true },
      properties: [{ pos: { x: 2, y: 1, z: 1 }, property: 'powered', value: 'false' }],
    },
    steps: [
      {
        description:
          'Lever off (as built): the clock runs; period 4 + 8·delay game ticks, 50 % duty.',
        set: { stop: false },
        waitTicks: 60,
        expect: { oscillation: CLOCK_OSCILLATION },
      },
      {
        description: 'Lever on: the torch goes out and stays out.',
        set: { stop: true },
        waitTicks: 4,
        expect: { outputs: { out: false } },
      },
      {
        description: 'Lever off again: the clock restarts by itself.',
        set: { stop: false },
        waitTicks: 60,
        expect: { oscillation: CLOCK_OSCILLATION },
      },
    ],
  },
  blocks(p) {
    const delay = Number(p['delay']);
    const repeater = (facing: string) =>
      `minecraft:repeater[delay=${delay},facing=${facing},locked=false,powered=false]`;
    return new LocalBuilder()
      .set(2, 0, 1, 'minecraft:stone')
      .set(2, 1, 1, 'minecraft:lever[face=floor,facing=north,powered=false]')
      .set(3, 0, 1, 'minecraft:redstone_wall_torch[facing=east,lit=true]')
      .set(3, 0, 0, wire({ n: 'side', s: 'side' }, 15))
      .set(3, 0, 2, wire({ n: 'side', w: 'side' }, 15))
      .set(2, 0, 2, repeater('east'))
      .set(1, 0, 2, wire({ e: 'side', w: 'side' }))
      .set(0, 0, 2, wire({ e: 'side', n: 'side' }))
      .set(0, 0, 1, wire({ e: 'side', s: 'side' }))
      .set(1, 0, 1, repeater('west'))
      .blocks();
  },
});
