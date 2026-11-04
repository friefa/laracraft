import { blockPosHash, javaHashOrder } from './core/java-hash';
import { JavaSimulation } from './simulation';
import {
  LAMP,
  LEVER,
  RB,
  STONE,
  javaRegistry,
  makeDoc,
  prop,
  repeater,
  simOf,
  trace,
  v,
  wire,
} from './spec-helpers';

/*
 * Unit tests per mechanic (times in game ticks, gt). Stimuli are applied between ticks like
 * player input; `trace` samples after each following tick (index 0 = first tick after).
 */

const lit = (sim: JavaSimulation, x: number, y: number, z: number): boolean =>
  prop(sim, v(x, y, z), 'lit') === 'true';

describe('redstone lamp (https://minecraft.wiki/w/Redstone_Lamp)', () => {
  it('turns on at once and off 4 gt after losing power', () => {
    const sim = simOf([
      [0, 0, 0, STONE],
      [0, 1, 0, LEVER],
      [1, 0, 0, LAMP],
    ]);
    sim.apply({ kind: 'use', pos: v(0, 1, 0) });
    expect(lit(sim, 1, 0, 0)).toBe(true);
    sim.step(5);
    sim.apply({ kind: 'use', pos: v(0, 1, 0) });
    expect(trace(sim, 5, () => lit(sim, 1, 0, 0))).toEqual([true, true, true, false, false]);
  });
});

describe('redstone torch (https://minecraft.wiki/w/Redstone_Torch)', () => {
  const blocks = [
    [0, 0, 0, STONE],
    [1, 0, 0, 'minecraft:redstone_wall_torch[facing=east,lit=true]'],
    [0, 1, 0, LEVER],
  ] as const;

  it('inverts its attachment block with a 2 gt delay', () => {
    const sim = simOf(blocks);
    sim.apply({ kind: 'use', pos: v(0, 1, 0) });
    expect(trace(sim, 3, () => lit(sim, 1, 0, 0))).toEqual([true, false, false]);
    sim.apply({ kind: 'use', pos: v(0, 1, 0) });
    expect(trace(sim, 3, () => lit(sim, 1, 0, 0))).toEqual([false, true, true]);
  });

  it('burns out after 8 turn-offs within 60 gt and relights 160 gt later', () => {
    const sim = simOf(blocks);
    let lastOff = 0;
    for (let i = 0; i < 8; i++) {
      sim.apply({ kind: 'use', pos: v(0, 1, 0) });
      sim.step(2);
      expect(lit(sim, 1, 0, 0)).toBe(false);
      lastOff = sim.tick;
      sim.step(2);
      sim.apply({ kind: 'use', pos: v(0, 1, 0) });
      sim.step(4);
      if (i < 7) expect(lit(sim, 1, 0, 0)).toBe(true);
    }
    // Burnt out: unpowered but still off.
    expect(lit(sim, 1, 0, 0)).toBe(false);
    sim.step(lastOff + 159 - sim.tick);
    expect(lit(sim, 1, 0, 0)).toBe(false);
    sim.step(1);
    expect(lit(sim, 1, 0, 0)).toBe(true);
  });
});

describe('repeater (https://minecraft.wiki/w/Redstone_Repeater)', () => {
  it.each([1, 2, 3, 4])('delay %i rt = 2·delay gt', (delay) => {
    const sim = simOf([
      [1, 0, 0, repeater('west', delay)],
      [2, 0, 0, LAMP],
    ]);
    sim.apply({ kind: 'place', pos: v(0, 0, 0), state: RB as never });
    const on = trace(sim, 2 * delay + 1, () => lit(sim, 2, 0, 0));
    expect(on.indexOf(true)).toBe(2 * delay - 1);
  });

  it('is locked by a powered repeater pointing into its side', () => {
    const sim = simOf([
      [1, 0, 0, repeater('west')],
      [2, 0, 0, LAMP],
      [1, 0, 1, repeater('south')],
    ]);
    sim.apply({ kind: 'place', pos: v(1, 0, 2), state: RB as never });
    sim.step(3);
    expect(prop(sim, v(1, 0, 0), 'locked')).toBe('true');
    sim.apply({ kind: 'place', pos: v(0, 0, 0), state: RB as never });
    sim.step(10);
    expect(prop(sim, v(1, 0, 0), 'powered')).toBe('false');
    expect(lit(sim, 2, 0, 0)).toBe(false);
    // Unlocking lets the held input through.
    sim.apply({ kind: 'break', pos: v(1, 0, 2) });
    sim.step(10);
    expect(lit(sim, 2, 0, 0)).toBe(true);
  });

  it('extends a 1 gt input pulse to its delay', () => {
    const sim = simOf([
      [1, 0, 0, repeater('west', 3)],
      [2, 0, 0, LAMP],
    ]);
    sim.apply({ kind: 'place', pos: v(0, 0, 0), state: RB as never });
    sim.step(1);
    sim.apply({ kind: 'break', pos: v(0, 0, 0) });
    const out = trace(sim, 14, () => prop(sim, v(1, 0, 0), 'powered') === 'true');
    expect(out.filter(Boolean)).toHaveLength(6);
  });
});

describe('comparator (https://minecraft.wiki/w/Redstone_Comparator)', () => {
  // Rear: redstone block (15). Side: dust 14 from a redstone block two blocks away.
  const blocks = (mode: string) =>
    [
      [0, 0, 0, RB],
      [1, 0, 0, `minecraft:comparator[facing=west,mode=${mode},powered=false]`],
      [1, 0, 1, wire({ n: 'side', s: 'side' })],
      [1, 0, 2, wire({ n: 'side', s: 'side' })],
      [1, 0, 3, RB],
    ] as const;

  it('compare mode passes the rear signal when it is not weaker than the side', () => {
    const sim = simOf(blocks('compare'));
    expect(sim.getEmittedPower(v(1, 0, 0), 'east')).toBe(15);
  });

  it('subtract mode outputs rear − side', () => {
    const sim = simOf(blocks('subtract'));
    expect(sim.getReceivedPower(v(1, 0, 1))).toBe(14);
    expect(sim.getEmittedPower(v(1, 0, 0), 'east')).toBe(1);
  });

  it.each([
    [0, 0],
    [1, 1],
    [22, 1],
    [23, 2],
    [64, 3],
    [320, 15],
  ])('reads a hopper holding %i items as %i', (count, level) => {
    const sim = simOf([
      // Facing down onto the ground: nothing to push into, so the items stay.
      [0, 0, 0, 'minecraft:hopper[enabled=true,facing=down]'],
      [1, 0, 0, 'minecraft:comparator[facing=west,mode=compare,powered=false]'],
    ]);
    if (count > 0)
      sim.apply({ kind: 'insert-items', pos: v(0, 0, 0), item: 'minecraft:stone', count });
    sim.step(3);
    expect(sim.getEmittedPower(v(1, 0, 0), 'east')).toBe(level);
  });
});

describe('redstone dust (https://minecraft.wiki/w/Redstone_Dust)', () => {
  it('decays by one per block, 15 → 0 over 15 blocks', () => {
    const blocks: [number, number, number, string][] = [[0, 0, 0, RB]];
    for (let x = 1; x <= 16; x++) blocks.push([x, 0, 0, wire({ e: 'side', w: 'side' })]);
    const sim = simOf(blocks);
    for (let x = 1; x <= 16; x++) expect(Number(prop(sim, v(x, 0, 0), 'power'))).toBe(16 - x);
  });

  it('strong power passes into dust, weak power does not', () => {
    // Lever strongly powers A (0,0,0); dust next to A receives 15.
    // That dust weakly powers B (2,0,0): a lamp next to B lights, dust next to B stays 0.
    const sim = simOf([
      [0, 0, 0, STONE],
      [0, 1, 0, LEVER],
      [1, 0, 0, wire({ e: 'side', w: 'side' })],
      [2, 0, 0, STONE],
      [3, 0, 0, wire({ e: 'side', w: 'side' })],
      [2, 0, 1, LAMP],
    ]);
    sim.apply({ kind: 'use', pos: v(0, 1, 0) });
    sim.settle();
    expect(prop(sim, v(1, 0, 0), 'power')).toBe('15');
    expect(lit(sim, 2, 0, 1)).toBe(true);
    expect(prop(sim, v(3, 0, 0), 'power')).toBe('0');
  });

  it('a dot powers no side, a cross powers all sides', () => {
    const sim = simOf([
      [0, 0, 0, wire({ n: 'side', e: 'side', s: 'side', w: 'side' })],
      [0, -1, 0, RB],
      [1, 0, 0, LAMP],
    ]);
    expect(lit(sim, 1, 0, 0)).toBe(true);
    sim.apply({ kind: 'use', pos: v(0, 0, 0) });
    sim.settle();
    expect(sim.getState(v(0, 0, 0))).toContain('east=none');
    expect(lit(sim, 1, 0, 0)).toBe(false);
  });
});

describe('observer (https://minecraft.wiki/w/Observer)', () => {
  it('fires 2 gt after a change in front and stays on for 2 gt', () => {
    const sim = simOf([
      [0, 0, 0, 'minecraft:observer[facing=east,powered=false]'],
      [-1, 0, 0, LAMP],
    ]);
    sim.apply({ kind: 'place', pos: v(1, 0, 0), state: STONE as never });
    const out = trace(sim, 6, () => prop(sim, v(0, 0, 0), 'powered') === 'true');
    expect(out).toEqual([false, true, true, false, false, false]);
  });

  it('two placed observers facing each other form a 6 gt clock (2 on, 4 off)', () => {
    // https://minecraft.wiki/w/Redstone_circuits/Clock: "6gt (3rt) clock" when placed by hand.
    const sim = simOf([[0, 0, 0, 'minecraft:observer[facing=south,powered=false]']]);
    sim.apply({
      kind: 'place',
      pos: v(0, 0, 1),
      state: 'minecraft:observer[facing=north,powered=false]' as never,
    });
    sim.step(10);
    const out = trace(sim, 24, () => (prop(sim, v(0, 0, 0), 'powered') === 'true' ? 1 : 0)).join(
      '',
    );
    expect(out).toMatch(/^(?:0*)(110000)+/);
    expect(out.match(/1+/g)?.every((r) => r.length === 2)).toBe(true);
    expect(
      out
        .match(/0+/g)
        ?.slice(1, -1)
        .every((r) => r.length === 4),
    ).toBe(true);
  });
});

describe('pistons (https://minecraft.wiki/w/Piston)', () => {
  it('extends 1 gt after player input, block arrives 2 gt later; retracts', () => {
    const sim = simOf([
      [0, 0, 0, 'minecraft:piston[extended=false,facing=east]'],
      [1, 0, 0, STONE],
    ]);
    sim.apply({ kind: 'place', pos: v(-1, 0, 0), state: RB as never });
    const states = trace(sim, 3, () => sim.getState(v(2, 0, 0)));
    expect(states[0]).toMatch(/moving_piston/);
    expect(states[1]).toMatch(/moving_piston/);
    expect(states[2]).toBe('minecraft:stone');
    expect(sim.getState(v(1, 0, 0))).toMatch(/piston_head/);
    sim.apply({ kind: 'break', pos: v(-1, 0, 0) });
    sim.settle();
    expect(sim.getState(v(0, 0, 0))).toBe('minecraft:piston[extended=false,facing=east]');
    expect(sim.getState(v(1, 0, 0))).toBe('minecraft:air');
    expect(sim.getState(v(2, 0, 0))).toBe('minecraft:stone');
  });

  const line = (n: number) => {
    const blocks: [number, number, number, string][] = [
      [0, 0, 0, 'minecraft:piston[extended=false,facing=east]'],
    ];
    for (let x = 1; x <= n; x++) blocks.push([x, 0, 0, 'minecraft:cobblestone']);
    return blocks;
  };

  it('pushes 12 blocks but not 13', () => {
    for (const [n, ok] of [
      [12, true],
      [13, false],
    ] as const) {
      const sim = simOf(line(n));
      sim.apply({ kind: 'place', pos: v(-1, 0, 0), state: RB as never });
      sim.settle();
      expect(prop(sim, v(0, 0, 0), 'extended')).toBe(String(ok));
    }
  });

  it('cannot push obsidian; breaks a torch in front', () => {
    const sim = simOf([
      [0, 0, 0, 'minecraft:piston[extended=false,facing=east]'],
      [1, 0, 0, 'minecraft:obsidian'],
      [0, 0, 2, 'minecraft:piston[extended=false,facing=east]'],
      [1, 0, 2, 'minecraft:redstone_torch[lit=true]'],
    ]);
    sim.apply({ kind: 'place', pos: v(-1, 0, 0), state: RB as never });
    sim.apply({ kind: 'place', pos: v(-1, 0, 2), state: RB as never });
    sim.settle();
    expect(prop(sim, v(0, 0, 0), 'extended')).toBe('false');
    expect(prop(sim, v(0, 0, 2), 'extended')).toBe('true');
    expect(sim.getState(v(1, 0, 2))).toMatch(/piston_head/);
  });

  it('slime block drags attached blocks, honey does not stick to slime', () => {
    const sim = simOf([
      [0, 0, 0, 'minecraft:sticky_piston[extended=false,facing=east]'],
      [1, 0, 0, 'minecraft:slime_block'],
      [1, 1, 0, STONE],
      [1, 0, 1, 'minecraft:honey_block'],
      [1, 0, -1, 'minecraft:cobblestone'],
    ]);
    sim.apply({ kind: 'place', pos: v(-1, 0, 0), state: RB as never });
    sim.settle();
    expect(sim.getState(v(2, 0, 0))).toBe('minecraft:slime_block');
    expect(sim.getState(v(2, 1, 0))).toBe('minecraft:stone');
    expect(sim.getState(v(2, 0, -1))).toBe('minecraft:cobblestone');
    expect(sim.getState(v(1, 0, 1))).toBe('minecraft:honey_block');
    sim.apply({ kind: 'break', pos: v(-1, 0, 0) });
    sim.settle();
    expect(sim.getState(v(1, 0, 0))).toBe('minecraft:slime_block');
    expect(sim.getState(v(1, 1, 0))).toBe('minecraft:stone');
  });

  it('quasi-connectivity: powered from above only reacts to a block update (BUD)', () => {
    // https://minecraft.wiki/w/Quasi-connectivity
    const sim = simOf([[0, 0, 0, 'minecraft:piston[extended=false,facing=east]']]);
    sim.apply({ kind: 'place', pos: v(0, 2, 0), state: RB as never });
    sim.settle();
    expect(sim.isPowered(v(0, 0, 0))).toBe(true);
    expect(prop(sim, v(0, 0, 0), 'extended')).toBe('false');
    sim.apply({ kind: 'place', pos: v(0, 0, 1), state: STONE as never });
    sim.settle();
    expect(prop(sim, v(0, 0, 0), 'extended')).toBe('true');
  });

  it('sticky piston drops its block on a 1 gt pulse and pulls it on a long one', () => {
    // https://minecraft.wiki/w/Sticky_Piston (block dropping on short pulses)
    for (const [pulse, expectAt] of [
      [1, 2],
      [6, 1],
    ] as const) {
      const sim = simOf([
        [0, 0, 0, 'minecraft:sticky_piston[extended=false,facing=east]'],
        [1, 0, 0, STONE],
      ]);
      sim.apply({ kind: 'place', pos: v(-1, 0, 0), state: RB as never });
      sim.step(pulse);
      sim.apply({ kind: 'break', pos: v(-1, 0, 0) });
      sim.settle();
      expect(sim.getState(v(expectAt, 0, 0))).toBe('minecraft:stone');
      expect(sim.getState(v(expectAt === 2 ? 1 : 2, 0, 0))).toBe('minecraft:air');
    }
  });
});

describe('hoppers, droppers (https://minecraft.wiki/w/Hopper, https://minecraft.wiki/w/Dropper)', () => {
  const CHEST = 'minecraft:chest[facing=north,type=single,waterlogged=false]';
  const count = (sim: JavaSimulation, x: number, y: number, z: number) =>
    (sim.getContainer(v(x, y, z))?.slots ?? []).reduce((n, s) => n + (s?.count ?? 0), 0);

  it('moves one item per 8 gt', () => {
    const sim = simOf([
      [0, 2, 0, CHEST],
      [0, 1, 0, 'minecraft:hopper[enabled=true,facing=east]'],
      [1, 1, 0, CHEST],
    ]);
    sim.apply({ kind: 'insert-items', pos: v(0, 2, 0), item: 'minecraft:stone', count: 4 });
    const out = trace(sim, 34, () => count(sim, 1, 1, 0));
    const arrivals = out
      .map((c, i) => (i > 0 && c > (out[i - 1] ?? 0) ? i : -1))
      .filter((i) => i >= 0);
    expect(arrivals).toEqual([8, 16, 24, 32]);
  });

  it('is locked while powered', () => {
    const sim = simOf([
      [0, 1, 0, 'minecraft:hopper[enabled=true,facing=east]'],
      [1, 1, 0, CHEST],
      [0, 0, 0, RB],
    ]);
    expect(prop(sim, v(0, 1, 0), 'enabled')).toBe('false');
    sim.apply({ kind: 'insert-items', pos: v(0, 1, 0), item: 'minecraft:stone', count: 2 });
    sim.step(20);
    expect(count(sim, 1, 1, 0)).toBe(0);
  });

  it('dropper fires 4 gt after power into a hopper, which passes it on 7 gt later', () => {
    // The dropper inserts during the scheduled-tick phase and sets the hopper's cooldown to
    // 8; the hopper's block entity already counts down once in the same game tick.
    const sim = simOf([
      [0, 0, 0, 'minecraft:dropper[facing=east,triggered=false]'],
      [1, 0, 0, 'minecraft:hopper[enabled=true,facing=east]'],
      [2, 0, 0, CHEST],
    ]);
    sim.apply({ kind: 'insert-items', pos: v(0, 0, 0), item: 'minecraft:stone', count: 3 });
    sim.apply({ kind: 'place', pos: v(-1, 0, 0), state: RB as never });
    const hopper = trace(sim, 12, () => [count(sim, 1, 0, 0), count(sim, 2, 0, 0)]);
    expect(hopper[2]).toEqual([0, 0]);
    expect(hopper[3]).toEqual([1, 0]);
    expect(hopper[9]).toEqual([1, 0]);
    expect(hopper[10]).toEqual([0, 1]);
    expect(count(sim, 0, 0, 0)).toBe(2);
  });
});

describe('buttons (https://minecraft.wiki/w/Button)', () => {
  it.each([
    ['stone', 20],
    ['oak', 30],
  ])('%s button stays pressed %i gt', (wood, ticks) => {
    const sim = simOf([
      [0, 0, 0, STONE],
      [0, 1, 0, `minecraft:${wood}_button[face=floor,facing=north,powered=false]`],
      [1, 0, 0, LAMP],
    ]);
    sim.apply({ kind: 'use', pos: v(0, 1, 0) });
    const out = trace(sim, ticks + 1, () => prop(sim, v(0, 1, 0), 'powered'));
    expect(out[ticks - 2]).toBe('true');
    expect(out[ticks - 1]).toBe('false');
  });
});

describe('engine', () => {
  it('reproduces java.util.HashSet<BlockPos> iteration order', () => {
    // BlockPos(1,2,3).hashCode() = (2 + 3·31)·31 + 1 = 2946 → bucket 2946 & 15 = 2.
    expect(blockPosHash(v(1, 2, 3))).toBe(2946);
    const order = javaHashOrder([v(0, 0, 0), v(0, 0, 1), v(1, 0, 0), v(0, 1, 0)]);
    // Buckets: (0,0,0)→0, (0,0,1)→961&15=1, (1,0,0)→1, (0,1,0)→31&15=15.
    expect(order).toEqual([v(0, 0, 0), v(0, 0, 1), v(1, 0, 0), v(0, 1, 0)]);
  });

  it('guards update cascades with maxUpdatesPerTick', () => {
    const blocks = [{ pos: v(0, 0, 0), state: STONE }];
    for (let x = 1; x < 40; x++)
      blocks.push({ pos: v(x, 0, 0), state: wire({ e: 'side', w: 'side' }) });
    const sim = new JavaSimulation(makeDoc(blocks), javaRegistry(), { maxUpdatesPerTick: 50 });
    sim.apply({ kind: 'place', pos: v(0, 0, 0), state: RB as never });
    expect(sim.suppressedUpdates).toBeGreaterThan(0);
  });

  it('exports the world as a document', () => {
    const sim = simOf([[0, 0, 0, LAMP]]);
    const doc = sim.toDocument();
    expect(doc.getBlock(0, 0, 0)).toBe(LAMP);
    expect(doc.volume.blockCount).toBe(1);
  });
});
