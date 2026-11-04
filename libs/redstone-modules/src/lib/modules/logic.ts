import { LocalBuilder, defineModule, moduleKey, wire } from '../define';

const STONE = 'minecraft:stone';
const repeater = (facing: string, delay: number, powered = false, locked = false) =>
  `minecraft:repeater[delay=${delay},facing=${facing},locked=${locked},powered=${powered}]`;
const wallTorch = (facing: string, lit: boolean) =>
  `minecraft:redstone_wall_torch[facing=${facing},lit=${lit}]`;

const BEDROCK_LOGIC_NOTE =
  'Built only from torches, repeaters (incl. repeater locking) and dust, which Bedrock also ' +
  'has; timing and dust connection details are not verified there.';

/**
 * T flip-flop: master–slave D flip-flop from two lockable repeaters (Java Edition).
 *
 * Design: the standard master–slave principle with repeater locking. M (master, delay 2)
 * reads D = NOT Q from a torch on the output block; S (slave, delay 1) reads M and drives
 * the output block B. The clock input powers block K: repeater L1 (from K) locks M while
 * the input is on; the torch T2 on K is the inverted clock and drives repeater L2, which
 * locks S while the input is off. On a rising edge M locks first (1 rt), then S unlocks
 * (2 rt) and copies M → Q toggles at 3 rt; the new NOT Q reaches M at 4 rt, when M is
 * already locked. On the falling edge S locks (2 rt) before M's new value arrives (3 rt,
 * thanks to M's delay 2). Edge-triggered, any input pulse ≥ 2 game ticks works; no items,
 * no pistons, no quasi-connectivity. Layout is laracraft's own.
 *
 * References:
 * - https://minecraft.wiki/w/Redstone_circuits/Memory (D and T flip-flops, master–slave)
 * - https://minecraft.wiki/w/Redstone_Repeater (locking by a powered repeater pointing into its side)
 * - https://minecraft.wiki/w/Redstone_Torch
 *
 * Local layout (y = 0), facing north = output block B at the −Z edge:
 *
 *   z=0   T1   B    .    .      B = output block (stone), T1 = wall torch on B (facing west)
 *   z=1   w    S^   <L2  T2     S = slave repeater (signal → north), L2 locks S (signal → west)
 *   z=2   w    M^   <L1  K      M = master repeater, delay 2; K = clock block (stone)
 *   z=3   w    w    .    i      T2 = wall torch on K (facing north); i = input dust
 *   x=    0    1    2    3
 *
 * Stored state: input off, Q = 0 (T1 lit, M on but S locked off).
 */
export const T_FLIP_FLOP = defineModule({
  id: 't_flip_flop',
  nameKey: moduleKey('t_flip_flop', 'name'),
  descriptionKey: moduleKey('t_flip_flop', 'description'),
  category: 'logic',
  editions: { java: 'tested', bedrock: 'untested' },
  editionNotes: { bedrock: BEDROCK_LOGIC_NOTE },
  size: { x: 4, y: 1, z: 4 },
  anchor: { x: 0, y: 0, z: 0 },
  design:
    'Master–slave flip-flop from two locked repeaters with NOT Q feedback; toggles on every rising edge.',
  references: [
    'https://minecraft.wiki/w/Redstone_circuits/Memory',
    'https://minecraft.wiki/w/Redstone_Repeater',
    'https://minecraft.wiki/w/Redstone_Torch',
  ],
  ports: [
    { name: 'toggle', kind: 'input', pos: { x: 3, y: 0, z: 3 }, side: 'south', signal: 'pulse' },
    { name: 'q', kind: 'output', pos: { x: 1, y: 0, z: 0 }, side: 'north', signal: 'level' },
  ],
  behaviour: {
    status: 'specified',
    notes:
      'After building, Q may settle in either state while the torches are placed; one pulse sets it as wanted.',
    initial: { outputs: { q: false } },
    steps: [
      {
        description: 'Short pulse: Q toggles on (3 rt after the rising edge).',
        pulse: { port: 'toggle', ticks: 2 },
        waitTicks: 12,
        expect: { outputs: { q: true } },
      },
      {
        description: 'Next pulse: Q toggles off.',
        pulse: { port: 'toggle', ticks: 4 },
        waitTicks: 12,
        expect: { outputs: { q: false } },
      },
      {
        description: 'A long pulse toggles exactly once.',
        pulse: { port: 'toggle', ticks: 40 },
        waitTicks: 50,
        expect: { outputs: { q: true } },
      },
    ],
  },
  blocks() {
    return new LocalBuilder()
      .set(1, 0, 0, STONE)
      .set(0, 0, 0, wallTorch('west', true))
      .set(1, 0, 1, repeater('south', 1, false, true))
      .set(1, 0, 2, repeater('south', 2, true, false))
      .set(0, 0, 1, wire({ n: 'side', s: 'side' }, 15))
      .set(0, 0, 2, wire({ n: 'side', s: 'side' }, 14))
      .set(0, 0, 3, wire({ n: 'side', e: 'side' }, 13))
      .set(1, 0, 3, wire({ n: 'side', w: 'side' }, 12))
      .set(2, 0, 1, repeater('east', 1, true))
      .set(2, 0, 2, repeater('east', 1, false))
      .set(3, 0, 2, STONE)
      .set(3, 0, 1, wallTorch('north', true))
      .set(3, 0, 3, wire({ n: 'side', e: 'side', s: 'side', w: 'side' }))
      .blocks();
  },
});

/**
 * RS NOR latch from two torch inverters (Java Edition).
 *
 * Design: the classic two-torch latch. Torch TA on block A feeds a dust that points into
 * block B; torch TB on B feeds the Q line that ends pointing into A. Powering A (set)
 * turns TA off, B loses power, TB turns on: Q = 1, which in turn holds A powered.
 * Powering B (reset) does the opposite. Layout is laracraft's own.
 *
 * References:
 * - https://minecraft.wiki/w/Redstone_circuits/Memory (RS NOR latch)
 * - https://minecraft.wiki/w/Redstone_Torch
 *
 * Local layout (y = 0), facing north = Q output at the −Z edge:
 *
 *   z=0   w    q    w    w       Q line (q = output port), fed by TB
 *   z=1   w    .    .    TB      TB = wall torch on B (facing north)
 *   z=2   A    TA   w    B       TA = wall torch on A (facing east); set → A, reset → B
 *   x=    0    1    2    3
 *
 * Stored state: reset (Q = 0): TA lit, B powered, TB off.
 */
export const RS_NOR_LATCH = defineModule({
  id: 'rs_nor_latch',
  nameKey: moduleKey('rs_nor_latch', 'name'),
  descriptionKey: moduleKey('rs_nor_latch', 'description'),
  category: 'logic',
  editions: { java: 'tested', bedrock: 'untested' },
  editionNotes: { bedrock: BEDROCK_LOGIC_NOTE },
  size: { x: 4, y: 1, z: 3 },
  anchor: { x: 0, y: 0, z: 0 },
  design: 'Two cross-coupled torch inverters; set and reset inputs on opposite sides, Q in front.',
  references: [
    'https://minecraft.wiki/w/Redstone_circuits/Memory',
    'https://minecraft.wiki/w/Redstone_Torch',
  ],
  ports: [
    { name: 'set', kind: 'input', pos: { x: 0, y: 0, z: 2 }, side: 'west', signal: 'pulse' },
    { name: 'reset', kind: 'input', pos: { x: 3, y: 0, z: 2 }, side: 'east', signal: 'pulse' },
    { name: 'q', kind: 'output', pos: { x: 1, y: 0, z: 0 }, side: 'north', signal: 'level' },
  ],
  behaviour: {
    status: 'specified',
    notes: 'After building, the latch may settle in either state; one reset pulse clears it.',
    initial: { outputs: { q: false } },
    steps: [
      {
        description: 'Set pulse: Q turns on (≤ 2 rt) and stays on.',
        pulse: { port: 'set', ticks: 2 },
        waitTicks: 10,
        expect: { outputs: { q: true } },
      },
      {
        description: 'Another set pulse changes nothing.',
        pulse: { port: 'set', ticks: 2 },
        waitTicks: 10,
        expect: { outputs: { q: true } },
      },
      {
        description: 'Reset pulse: Q turns off and stays off.',
        pulse: { port: 'reset', ticks: 2 },
        waitTicks: 10,
        expect: { outputs: { q: false } },
      },
    ],
  },
  blocks() {
    return new LocalBuilder()
      .set(0, 0, 2, STONE)
      .set(1, 0, 2, wallTorch('east', true))
      .set(2, 0, 2, wire({ e: 'side', w: 'side' }, 15))
      .set(3, 0, 2, STONE)
      .set(3, 0, 1, wallTorch('north', false))
      .set(3, 0, 0, wire({ s: 'side', w: 'side' }))
      .set(2, 0, 0, wire({ e: 'side', w: 'side' }))
      .set(1, 0, 0, wire({ e: 'side', w: 'side' }))
      .set(0, 0, 0, wire({ e: 'side', s: 'side' }))
      .set(0, 0, 1, wire({ n: 'side', s: 'side' }))
      .blocks();
  },
});

/**
 * AND gate from three torches (Java Edition).
 *
 * Design: the classic torch AND (= NOR of the inverted inputs). Each input powers a block
 * with a torch on top; the two torches feed one dust on the middle block, which powers that
 * block; a wall torch on the middle block's front is the output. Output on only when both
 * input torches are off, i.e. both inputs on. Delay 2 rt.
 *
 * References:
 * - https://minecraft.wiki/w/Redstone_circuits/Logic (AND gate)
 * - https://minecraft.wiki/w/Redstone_Torch
 *
 * Local layout, facing north = output torch at the −Z edge:
 *
 *   y=1        z=1:  T1   w    T3          T1/T3 = torches on top of X1/X3, w = dust on X2
 *   y=0   z=0:       .    To   .           To = wall torch on X2 (facing north), output
 *         z=1:       X1   X2   X3          stone blocks
 *         z=2:       a    .    b           input dusts (point north into X1 / X3)
 *         x=         0    1    2
 */
export const AND_GATE = defineModule({
  id: 'and_gate',
  nameKey: moduleKey('and_gate', 'name'),
  descriptionKey: moduleKey('and_gate', 'description'),
  category: 'logic',
  editions: { java: 'tested', bedrock: 'untested' },
  editionNotes: { bedrock: BEDROCK_LOGIC_NOTE },
  size: { x: 3, y: 2, z: 3 },
  anchor: { x: 0, y: 0, z: 0 },
  design: 'Three-torch AND: two input inverters joined by dust, one output inverter.',
  references: [
    'https://minecraft.wiki/w/Redstone_circuits/Logic',
    'https://minecraft.wiki/w/Redstone_Torch',
  ],
  ports: [
    { name: 'a', kind: 'input', pos: { x: 0, y: 0, z: 2 }, side: 'south', signal: 'level' },
    { name: 'b', kind: 'input', pos: { x: 2, y: 0, z: 2 }, side: 'south', signal: 'level' },
    { name: 'out', kind: 'output', pos: { x: 1, y: 0, z: 0 }, side: 'north', signal: 'level' },
  ],
  behaviour: {
    status: 'specified',
    initial: { outputs: { out: false } },
    steps: [
      {
        description: 'Only A on: output stays off.',
        set: { a: true, b: false },
        waitTicks: 6,
        expect: { outputs: { out: false } },
      },
      {
        description: 'Only B on: output stays off.',
        set: { a: false, b: true },
        waitTicks: 6,
        expect: { outputs: { out: false } },
      },
      {
        description: 'A and B on: output on after 2 rt.',
        set: { a: true, b: true },
        waitTicks: 6,
        expect: { outputs: { out: true } },
      },
      {
        description: 'Both off again: output off.',
        set: { a: false, b: false },
        waitTicks: 6,
        expect: { outputs: { out: false } },
      },
    ],
  },
  blocks() {
    const cross = wire({ n: 'side', e: 'side', s: 'side', w: 'side' });
    return new LocalBuilder()
      .fill(0, 0, 1, 2, 0, 1, STONE)
      .set(0, 1, 1, 'minecraft:redstone_torch[lit=true]')
      .set(2, 1, 1, 'minecraft:redstone_torch[lit=true]')
      .set(1, 1, 1, wire({ e: 'side', w: 'side' }, 15))
      .set(1, 0, 0, wallTorch('north', false))
      .set(0, 0, 2, cross)
      .set(2, 0, 2, cross)
      .blocks();
  },
});

const DEFAULT_EXTENDER_DELAY = 2;

/**
 * Output pulse of the pulse extender in game ticks for an input pulse of `inputTicks`
 * and repeater delay `delay` (redstone ticks): it starts `2·(delay + 1)` game ticks after
 * the rising edge and lasts `2·(3·delay + max(input rt, delay))` game ticks.
 */
export function pulseExtenderOutput(delay: number, inputTicks: number) {
  const inputRt = Math.max(1, Math.ceil(inputTicks / 2));
  return { delayTicks: 2 * (delay + 1), lengthTicks: 2 * (3 * delay + Math.max(inputRt, delay)) };
}

/**
 * Pulse extender: chain of four repeaters with an OR bus of taps (Java Edition).
 *
 * Design: the input runs through four repeaters R0, C1, C2, C3 (all with the same delay d);
 * after each of them a tap repeater (delay 1, used as a diode) feeds a common output dust
 * line. R0 stretches any input pulse to at least d rt, so the four delayed copies overlap
 * without gaps and the output stays on for 3·d rt longer than the (stretched) input.
 * The taps keep the bus from feeding back into the chain. Layout is laracraft's own.
 *
 * References:
 * - https://minecraft.wiki/w/Redstone_circuits/Pulse (pulse extender)
 * - https://minecraft.wiki/w/Redstone_Repeater (pulses shorter than the delay are extended to it)
 *
 * Local layout (y = 0), facing north = output bus at the −Z edge:
 *
 *   z=0   .   .   o   w   w   w   w   w   w     o = output port on the bus
 *   z=1   .   .   t   .   t   .   t   .   t     t = tap repeater (signal → north), delay 1
 *   z=2   i   R0> w   C1> w   C2> w   C3> w     i = input dust; chain signal → east, delay d
 *   x=    0   1   2   3   4   5   6   7   8
 */
export const PULSE_EXTENDER = defineModule({
  id: 'pulse_extender',
  nameKey: moduleKey('pulse_extender', 'name'),
  descriptionKey: moduleKey('pulse_extender', 'description'),
  category: 'logic',
  editions: { java: 'tested', bedrock: 'untested' },
  editionNotes: { bedrock: BEDROCK_LOGIC_NOTE },
  size: { x: 9, y: 1, z: 3 },
  anchor: { x: 0, y: 0, z: 0 },
  design:
    'Four-stage repeater chain OR-ed through diode taps; extends any pulse by 3·delay redstone ticks.',
  references: [
    'https://minecraft.wiki/w/Redstone_circuits/Pulse',
    'https://minecraft.wiki/w/Redstone_Repeater',
  ],
  ports: [
    { name: 'in', kind: 'input', pos: { x: 0, y: 0, z: 2 }, side: 'west', signal: 'pulse' },
    { name: 'out', kind: 'output', pos: { x: 2, y: 0, z: 0 }, side: 'north', signal: 'pulse' },
  ],
  params: {
    delay: {
      type: 'integer',
      minimum: 1,
      maximum: 4,
      default: DEFAULT_EXTENDER_DELAY,
      descriptionKey: moduleKey('pulse_extender', 'param.delay'),
    },
  },
  behaviour: {
    status: 'specified',
    params: { delay: DEFAULT_EXTENDER_DELAY },
    initial: { outputs: { out: false } },
    steps: [
      {
        description: '1-rt input pulse: output pulse of 2·(3·d + d) game ticks after 2·(d + 1).',
        pulse: { port: 'in', ticks: 2 },
        waitTicks: 40,
        expect: { pulse: { port: 'out', ...pulseExtenderOutput(DEFAULT_EXTENDER_DELAY, 2) } },
      },
      {
        description: 'Long input pulse: output = input stretched by 3·d rt.',
        pulse: { port: 'in', ticks: 20 },
        waitTicks: 60,
        expect: { pulse: { port: 'out', ...pulseExtenderOutput(DEFAULT_EXTENDER_DELAY, 20) } },
      },
    ],
  },
  blocks(p) {
    const d = Number(p['delay']);
    const b = new LocalBuilder();
    b.set(0, 0, 2, wire({ e: 'side', w: 'side' }));
    for (const x of [1, 3, 5, 7]) b.set(x, 0, 2, repeater('west', d));
    for (const x of [2, 4, 6]) b.set(x, 0, 2, wire({ e: 'side', n: 'side', w: 'side' }));
    b.set(8, 0, 2, wire({ n: 'side', w: 'side' }));
    for (const x of [2, 4, 6, 8]) b.set(x, 0, 1, repeater('south', 1));
    b.set(2, 0, 0, wire({ e: 'side', s: 'side' }));
    for (const x of [3, 5, 7]) b.set(x, 0, 0, wire({ e: 'side', w: 'side' }));
    for (const x of [4, 6]) b.set(x, 0, 0, wire({ e: 'side', s: 'side', w: 'side' }));
    b.set(8, 0, 0, wire({ s: 'side', w: 'side' }));
    return b.blocks();
  },
});
