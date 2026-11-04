import {
  type BlockStateString,
  parseBlockState,
  stringifyBlockState,
} from '../blockstate/blockstate';
import { createJavaBlockRegistry } from '../registry/java-registry';
import { createBlockRegistry, resolveBlockState } from '../registry/registry';
import type { BlockDefinition } from '../registry/types';
import {
  mirrorDirection,
  mirrorState,
  normalizeTurns,
  rotateDirectionY,
  rotateStateY,
} from './blockstate-transform';

const registry = createJavaBlockRegistry();
const s = (v: string) => v as BlockStateString;

/** Properties whose values a rotation or mirror can change. */
const ORIENTATION_KEYS = new Set([
  'facing',
  'axis',
  'rotation',
  'shape',
  'hinge',
  'type',
  'north',
  'east',
  'south',
  'west',
]);
const MAX_COMBINATIONS = 4096;

/** All states of a block over its orientation-relevant properties (others default). */
function orientationStates(def: BlockDefinition): BlockStateString[] {
  const keys = Object.keys(def.properties).filter((k) => ORIENTATION_KEYS.has(k));
  let combos: Record<string, string>[] = [{}];
  for (const key of keys) {
    const values = def.properties[key]?.values ?? [];
    combos = combos.flatMap((c) => values.map((v) => ({ ...c, [key]: v })));
    if (combos.length > MAX_COMBINATIONS) throw new Error(`${def.id}: too many combinations`);
  }
  return combos.map((props) => {
    const r = resolveBlockState(registry, { id: def.id, properties: props });
    if (!r.ok) throw new Error(r.error);
    return r.state;
  });
}

const valid = (state: BlockStateString): boolean => {
  const r = resolveBlockState(registry, state);
  return r.ok && r.state === state;
};

describe('direction helpers', () => {
  it('rotates clockwise seen from above', () => {
    expect(rotateDirectionY('north', 1)).toBe('east');
    expect(rotateDirectionY('east', 1)).toBe('south');
    expect(rotateDirectionY('north', -1)).toBe('west');
    expect(rotateDirectionY('up', 3)).toBe('up');
  });
  it('mirrors', () => {
    expect(mirrorDirection('east', 'x')).toBe('west');
    expect(mirrorDirection('north', 'x')).toBe('north');
    expect(mirrorDirection('north', 'z')).toBe('south');
    expect(mirrorDirection('down', 'z')).toBe('down');
  });
  it('normalizes turns', () => {
    expect(normalizeTurns(-1)).toBe(3);
    expect(normalizeTurns(9)).toBe(1);
    expect(() => normalizeTurns(0.5)).toThrow(RangeError);
  });
});

describe('exhaustive over the Java registry', () => {
  let checked = 0;
  for (const def of registry.all()) {
    it(`${def.id}`, () => {
      for (const state of orientationStates(def)) {
        checked++;
        let r = state;
        for (let i = 0; i < 4; i++) {
          r = rotateStateY(registry, r, 1);
          expect(valid(r), `${state} rotated ${i + 1}× → ${r}`).toBe(true);
        }
        expect(r, `rotate 4× ${state}`).toBe(state);
        expect(rotateStateY(registry, state, 4)).toBe(state);
        expect(rotateStateY(registry, rotateStateY(registry, state, 3), 1)).toBe(state);

        for (const axis of ['x', 'z'] as const) {
          const m = mirrorState(registry, state, axis);
          expect(valid(m), `${state} mirror ${axis} → ${m}`).toBe(true);
          expect(mirrorState(registry, m, axis), `mirror ${axis} 2× ${state}`).toBe(state);
        }
        const mxz = mirrorState(registry, mirrorState(registry, state, 'z'), 'x');
        expect(rotateStateY(registry, state, 2), `rotate 2 vs mirror x∘z of ${state}`).toBe(mxz);
        // Mirror then rotate equals rotate^-1 then mirror (dihedral group relation).
        expect(rotateStateY(registry, mirrorState(registry, state, 'x'), 1)).toBe(
          mirrorState(registry, rotateStateY(registry, state, 3), 'x'),
        );
      }
    });
  }
  afterAll(() => {
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('Java semantics', () => {
  const rot = (state: string, turns: number) => rotateStateY(registry, s(state), turns);
  const mir = (state: string, axis: 'x' | 'z') => mirrorState(registry, s(state), axis);
  const props = (state: string) => parseBlockState(state).properties;

  it('rotates horizontal and 6-way facing, keeps up/down', () => {
    expect(props(rot('minecraft:furnace[facing=north,lit=false]', 1)).facing).toBe('east');
    expect(props(rot('minecraft:piston[extended=false,facing=up]', 1)).facing).toBe('up');
    expect(props(rot('minecraft:piston[extended=false,facing=west]', 1)).facing).toBe('north');
    expect(props(rot('minecraft:hopper[enabled=true,facing=down]', 1)).facing).toBe('down');
  });

  it('swaps axis x/z on odd turns only', () => {
    expect(props(rot('minecraft:oak_log[axis=x]', 1)).axis).toBe('z');
    expect(props(rot('minecraft:oak_log[axis=x]', 2)).axis).toBe('x');
    expect(props(rot('minecraft:oak_log[axis=y]', 1)).axis).toBe('y');
    expect(props(mir('minecraft:oak_log[axis=x]', 'x')).axis).toBe('x');
  });

  it('stairs: rotation keeps shape, mirror swaps left/right', () => {
    const st = 'minecraft:oak_stairs[facing=east,half=top,shape=outer_left,waterlogged=false]';
    expect(props(rot(st, 1))).toMatchObject({ facing: 'south', half: 'top', shape: 'outer_left' });
    expect(props(mir(st, 'x'))).toMatchObject({ facing: 'west', shape: 'outer_right' });
    expect(props(mir(st, 'z'))).toMatchObject({ facing: 'east', shape: 'outer_right' });
    const inner =
      'minecraft:oak_stairs[facing=north,half=bottom,shape=inner_right,waterlogged=false]';
    expect(props(mir(inner, 'z'))).toMatchObject({ facing: 'south', shape: 'inner_left' });
  });

  it('doors: hinge swaps on mirror, facing mirrors, half unchanged', () => {
    const door = 'minecraft:oak_door[facing=north,half=upper,hinge=left,open=false,powered=false]';
    expect(props(mir(door, 'x'))).toMatchObject({ facing: 'north', hinge: 'right', half: 'upper' });
    expect(props(mir(door, 'z'))).toMatchObject({ facing: 'south', hinge: 'right' });
    expect(props(rot(door, 3))).toMatchObject({ facing: 'west', hinge: 'left' });
  });

  it('chest: type left/right swaps on mirror, single unchanged', () => {
    expect(props(mir('minecraft:chest[facing=north,type=left,waterlogged=false]', 'x')).type).toBe(
      'right',
    );
    expect(props(rot('minecraft:chest[facing=north,type=left,waterlogged=false]', 1)).type).toBe(
      'left',
    );
    expect(
      props(mir('minecraft:chest[facing=north,type=single,waterlogged=false]', 'z')).type,
    ).toBe('single');
  });

  it('slab type is not touched', () => {
    expect(props(mir('minecraft:stone_slab[type=top,waterlogged=false]', 'x')).type).toBe('top');
  });

  it('rails: all 10 shapes like Java RailBlock', () => {
    const rail = (shape: string) => `minecraft:rail[shape=${shape},waterlogged=false]`;
    const cw: Record<string, string> = {
      north_south: 'east_west',
      east_west: 'north_south',
      ascending_east: 'ascending_south',
      ascending_west: 'ascending_north',
      ascending_north: 'ascending_east',
      ascending_south: 'ascending_west',
      south_east: 'south_west',
      south_west: 'north_west',
      north_west: 'north_east',
      north_east: 'south_east',
    };
    for (const [from, to] of Object.entries(cw)) expect(props(rot(rail(from), 1)).shape).toBe(to);
    // Mirror.LEFT_RIGHT (z) and Mirror.FRONT_BACK (x).
    const mz: Record<string, string> = {
      ascending_north: 'ascending_south',
      south_east: 'north_east',
      south_west: 'north_west',
      north_south: 'north_south',
      ascending_east: 'ascending_east',
    };
    for (const [from, to] of Object.entries(mz)) expect(props(mir(rail(from), 'z')).shape).toBe(to);
    const mx: Record<string, string> = {
      ascending_east: 'ascending_west',
      south_east: 'south_west',
      north_west: 'north_east',
      east_west: 'east_west',
      ascending_north: 'ascending_north',
    };
    for (const [from, to] of Object.entries(mx)) expect(props(mir(rail(from), 'x')).shape).toBe(to);
  });

  it('side connections move with their side', () => {
    const wire = 'minecraft:redstone_wire[east=side,north=up,power=5,south=none,west=none]';
    expect(props(rot(wire, 1))).toMatchObject({
      north: 'none',
      east: 'up',
      south: 'side',
      west: 'none',
      power: '5',
    });
    expect(props(mir(wire, 'x'))).toMatchObject({ east: 'none', west: 'side', north: 'up' });
    const wall =
      'minecraft:cobblestone_wall[east=tall,north=low,south=none,up=true,waterlogged=false,west=none]';
    expect(props(mir(wall, 'z'))).toMatchObject({ north: 'none', south: 'low', east: 'tall' });
  });

  it('face (lever/button) is unchanged', () => {
    const lever = 'minecraft:lever[face=ceiling,facing=north,powered=false]';
    expect(props(rot(lever, 1))).toMatchObject({ face: 'ceiling', facing: 'east' });
  });

  it('result is canonical even for non-canonical input', () => {
    expect(rot('minecraft:oak_log[axis=y]', 0)).toBe('minecraft:oak_log[axis=y]');
    expect(rot('oak_log[axis=x]', 1)).toBe('minecraft:oak_log[axis=z]');
  });

  it('rotation (0..15) property like signs', () => {
    const sign: BlockDefinition = {
      id: 'test:sign',
      nameKey: 'block.test_sign',
      category: 'decoration',
      properties: {
        rotation: {
          values: Array.from({ length: 16 }, (_, i) => String(i)),
          default: '0',
        },
        unknown: { values: ['a', 'b'], default: 'a' },
      },
      render: { shape: 'model', layer: 'cutout' },
      solid: false,
      physics: { support: { kind: 'below' } },
    };
    const reg = createBlockRegistry('test', [sign]);
    const st = (r: number) =>
      stringifyBlockState({ id: 'test:sign', properties: { rotation: String(r), unknown: 'b' } });
    // 0 = south; clockwise → 4 = west.
    expect(rotateStateY(reg, st(0), 1)).toBe(st(4));
    expect(rotateStateY(reg, st(14), 1)).toBe(st(2));
    // Mirror z: south (0) ↔ north (8); west (4) stays.
    expect(mirrorState(reg, st(0), 'z')).toBe(st(8));
    expect(mirrorState(reg, st(4), 'z')).toBe(st(4));
    // Mirror x: west (4) ↔ east (12); south stays.
    expect(mirrorState(reg, st(4), 'x')).toBe(st(12));
    expect(mirrorState(reg, st(0), 'x')).toBe(st(0));
    for (let r = 0; r < 16; r++) {
      expect(rotateStateY(reg, st(r), 2)).toBe(mirrorState(reg, mirrorState(reg, st(r), 'x'), 'z'));
    }
  });

  it('powered rails stay within their allowed shapes', () => {
    const pr = 'minecraft:powered_rail[powered=false,shape=ascending_north,waterlogged=false]';
    expect(props(rot(pr, 1)).shape).toBe('ascending_east');
    expect(valid(rot(pr, 1))).toBe(true);
  });
});
