import { LAMP, LEVER, prop, simOf, v, wire, type BlockTuple } from './spec-helpers';

/** Rough budget check: a few thousand components must run far faster than 20 tps. */
it('runs ~3000 components (levers, torches, dust, lamps) faster than real time', () => {
  const blocks: BlockTuple[] = [];
  const rows = 100;
  for (let r = 0; r < rows; r++) {
    const z = r * 3;
    blocks.push([0, 0, z, 'minecraft:stone']);
    blocks.push([0, 1, z, LEVER]);
    blocks.push([1, 0, z, 'minecraft:redstone_wall_torch[facing=east,lit=true]']);
    for (let x = 2; x < 16; x++) {
      blocks.push([x, 0, z, wire({ e: 'side', w: 'side' })]);
      blocks.push([x, 0, z + 1, LAMP]);
    }
  }
  const sim = simOf(blocks);
  const t0 = performance.now();
  // Every row's lever flips every 2 s (each flip re-powers a 14-dust line, which in Java
  // costs ~1 700 neighbour updates because of dust's update fan-out).
  for (let i = 0; i < 10; i++) {
    if (i % 2 === 0) for (let r = 0; r < rows; r++) sim.apply({ kind: 'use', pos: v(0, 1, r * 3) });
    sim.step(20);
  }
  const ms = performance.now() - t0;
  expect(blocks.length).toBeGreaterThan(3000);
  // Odd number of flips: levers on, torches off, the lines are unpowered.
  expect(prop(sim, v(15, 0, 0), 'power')).toBe('0');
  // 200 gt = 10 s of game time; must be much faster than real time.
  expect(ms).toBeLessThan(10_000);
}, 30_000);
