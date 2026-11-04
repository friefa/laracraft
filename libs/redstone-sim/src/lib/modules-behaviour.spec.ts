import { DIRECTION_OFFSET, type Vec3 } from '@laracraft/core-model';
import {
  MODULE_CATALOGUE,
  type BehaviourExpectation,
  type ModulePort,
  type PortValue,
  type RedstoneModule,
} from '@laracraft/redstone-modules';
import type { ContainerEntity } from './blocks/containers';
import { JavaSimulation } from './simulation';
import { javaRegistry, makeDoc } from './spec-helpers';

/*
 * Runs the behaviour specs of `@laracraft/redstone-modules` through the simulator.
 *
 * Harness conventions (the spec format leaves them open):
 * - The module is built facing north with its anchor at the anchor's local position, so
 *   world = local coordinates; the default ground (solid, non-conductive) lies below y = 0.
 * - The stored state is loaded as is (plus the simulator's load-time neighbour update);
 *   `initial` is checked right after loading, before any tick.
 * - Input ports: a lever at the port is used (right-clicked) when its state must change;
 *   any other port is driven by a block of redstone placed on the outside of the port side
 *   (`pos + side`) and broken to switch off. Pulses last exactly `ticks` game ticks.
 * - Output ports: dust reports its power level, other blocks their emitted power towards
 *   the port side. `true`/`false` = power > 0.
 * - Items: `sort` = minecraft:iron_ingot, `other` = minecraft:stick, `filler` = a renamed
 *   stick (all stack to 64; the three never stack with each other). Preloaded `filler`
 *   items go one per free slot (the spec's "1 filler in each other slot").
 * - `rebuild`: the module block at each position is broken and placed again (its stored
 *   state) like a player would, before the step's inputs change.
 */

const ITEMS = {
  sort: 'minecraft:iron_ingot',
  other: 'minecraft:stick',
  // A renamed stick: same max stack (64), but does not stack with plain sticks.
  filler: 'minecraft:stick[custom_name="Filler"]',
} as const;

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

class ModuleRun {
  readonly sim: JavaSimulation;
  readonly problems: string[] = [];
  private readonly ports: Map<string, ModulePort>;
  private readonly stored = new Map<string, string>();

  constructor(private readonly module: RedstoneModule) {
    const params = module.behaviour.params;
    const blocks = module.build(params, 'north').map((b) => ({
      pos: add(b.offset, module.anchor),
      state: b.state,
    }));
    this.sim = new JavaSimulation(makeDoc(blocks), javaRegistry(), { edition: 'java' });
    for (const b of blocks) this.stored.set(`${b.pos.x},${b.pos.y},${b.pos.z}`, b.state);
    this.ports = new Map(module.ports.map((p) => [p.name, p]));
    for (const pre of module.behaviour.preload ?? []) {
      const be = this.sim.level.getBlockEntity<ContainerEntity>(pre.pos);
      if (!be || !('slots' in be))
        throw new Error(`preload: no container at ${JSON.stringify(pre.pos)}`);
      const item = ITEMS[pre.item];
      if (pre.item === 'sort') {
        const i = be.slots.findIndex((s) => s === null);
        be.set(i, { item, count: pre.count });
      } else {
        for (let n = 0; n < pre.count; n++)
          be.set(
            be.slots.findIndex((s) => s === null),
            { item, count: 1 },
          );
      }
      be.setChanged(this.sim.level);
    }
  }

  private port(name: string): ModulePort {
    const p = this.ports.get(name);
    if (!p) throw new Error(`${this.module.id}: unknown port ${name}`);
    return p;
  }

  private outside(p: ModulePort): Vec3 {
    return add(p.pos, DIRECTION_OFFSET[p.side]);
  }

  setInput(name: string, value: PortValue): void {
    const p = this.port(name);
    const on = value === true || (typeof value === 'number' && value > 0);
    const state = this.sim.getState(p.pos);
    if (state.startsWith('minecraft:lever')) {
      if (state.includes('powered=true') !== on) this.sim.apply({ kind: 'use', pos: p.pos });
      return;
    }
    const out = this.outside(p);
    if (!this.sim.level.isConductor(p.pos)) {
      // Dust and other non-conductors: a block of redstone next to the port.
      if (on)
        this.sim.apply({ kind: 'place', pos: out, state: 'minecraft:redstone_block' as never });
      else this.sim.apply({ kind: 'break', pos: out });
      return;
    }
    // A conductive port block must be strongly powered (a block of redstone would not do
    // that, https://minecraft.wiki/w/Block_of_Redstone): a lever attached to the port side.
    if (!this.sim.getState(out).startsWith('minecraft:lever')) {
      const face = p.side === 'up' ? 'floor' : p.side === 'down' ? 'ceiling' : 'wall';
      const facing = face === 'wall' ? p.side : 'north';
      this.sim.apply({
        kind: 'place',
        pos: out,
        state: `minecraft:lever[face=${face},facing=${facing},powered=false]` as never,
      });
    }
    if (this.sim.getState(out).includes('powered=true') !== on)
      this.sim.apply({ kind: 'use', pos: out });
  }

  output(name: string): number {
    const p = this.port(name);
    const state = this.sim.getState(p.pos);
    const m = /power=(\d+)/.exec(state);
    if (state.startsWith('minecraft:redstone_wire') && m) return Number(m[1]);
    return this.sim.getEmittedPower(p.pos, p.side);
  }

  items(port: string, item: 'sort' | 'other'): number {
    const c = this.sim.getContainer(this.port(port).pos);
    return (c?.slots ?? []).reduce((n, s) => n + (s && s.item === ITEMS[item] ? s.count : 0), 0);
  }

  check(label: string, e: BehaviourExpectation, samples: Map<string, number[]>): void {
    const bad = (msg: string) => this.problems.push(`${label}: ${msg}`);
    for (const [name, want] of Object.entries(e.outputs ?? {})) {
      const got = this.output(name);
      const ok = typeof want === 'number' ? got === want : got > 0 === want;
      if (!ok) bad(`output ${name} expected ${String(want)}, got ${got}`);
    }
    for (const c of e.cells ?? []) {
      const filled = this.sim.getState(c.pos) !== 'minecraft:air';
      if (filled !== c.filled)
        bad(`cell ${JSON.stringify(c.pos)} filled=${filled} (${this.sim.getState(c.pos)})`);
    }
    for (const pe of e.properties ?? []) {
      const st = this.sim.getState(pe.pos);
      if (!st.includes(`${pe.property}=${pe.value}`))
        bad(`property ${pe.property}=${pe.value} at ${JSON.stringify(pe.pos)}: ${st}`);
    }
    for (const ic of e.items ?? []) {
      const got = this.items(ic.port, ic.item);
      if (got !== ic.count) bad(`items ${ic.port}/${ic.item} expected ${ic.count}, got ${got}`);
    }
    if (e.oscillation) {
      const o = e.oscillation;
      const trace = (samples.get(o.port) ?? []).map((x) => (x > 0 ? 1 : 0));
      // Steady state: the cycle up to the second rising edge may be a start-up transient.
      const rises = trace
        .flatMap((x, i) => (i > 0 && x === 1 && trace[i - 1] === 0 ? [i] : []))
        .slice(1);
      const periods = rises.slice(1).map((r, i) => r - (rises[i] as number));
      const onRuns = rises
        .map((r) => {
          let n = 0;
          while (r + n < trace.length && trace[r + n] === 1) n++;
          return r + n < trace.length ? n : -1;
        })
        .filter((n) => n >= 0);
      if (
        periods.length < 1 ||
        periods.some((p) => p !== o.periodTicks) ||
        onRuns.some((n) => n !== o.onTicks)
      ) {
        bad(
          `oscillation ${o.port} expected period ${o.periodTicks}/on ${o.onTicks}, got periods [${periods.join(',')}] on [${onRuns.join(',')}] trace ${trace.join('')}`,
        );
      }
    }
    if (e.pulse) {
      const pu = e.pulse;
      const trace = (samples.get(pu.port) ?? []).map((x) => (x > 0 ? 1 : 0));
      const start = trace.indexOf(1);
      let len = 0;
      while (start >= 0 && start + len < trace.length && trace[start + len] === 1) len++;
      if (start + 1 !== pu.delayTicks || len !== pu.lengthTicks) {
        bad(
          `pulse ${pu.port} expected delay ${pu.delayTicks}/length ${pu.lengthTicks}, got delay ${start + 1}/length ${len}`,
        );
      }
    }
  }

  run(): string[] {
    const b = this.module.behaviour;
    this.check('initial', b.initial, new Map());
    b.steps.forEach((step, i) => {
      for (const pos of step.rebuild ?? []) {
        const state = this.stored.get(`${pos.x},${pos.y},${pos.z}`);
        if (!state) throw new Error(`rebuild: no module block at ${JSON.stringify(pos)}`);
        this.sim.apply({ kind: 'break', pos });
        this.sim.apply({ kind: 'place', pos, state: state as never });
      }
      for (const [name, value] of Object.entries(step.set ?? {})) this.setInput(name, value);
      if (step.pulse) this.setInput(step.pulse.port, true);
      for (const ins of step.insertItems ?? []) {
        this.sim.apply({
          kind: 'insert-items',
          pos: this.port(ins.port).pos,
          item: ITEMS[ins.item],
          count: ins.count,
        });
      }
      const watched = [step.expect.oscillation?.port, step.expect.pulse?.port].filter(
        (x): x is string => !!x,
      );
      const samples = new Map<string, number[]>(watched.map((w) => [w, []]));
      for (let t = 1; t <= step.waitTicks; t++) {
        this.sim.step();
        for (const w of watched) samples.get(w)?.push(this.output(w));
        if (step.pulse && t === step.pulse.ticks) this.setInput(step.pulse.port, false);
      }
      this.check(`step ${i + 1} (${step.description})`, step.expect, samples);
    });
    return this.problems;
  }
}

describe('redstone-modules behaviour specs (Java)', () => {
  for (const module of MODULE_CATALOGUE.all()) {
    it(module.id, () => {
      const problems = new ModuleRun(module).run();
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }
});
