import { type HorizontalDirection, parseBlockState } from '@laracraft/core-model';
import { dump, key, newDoc, registry, resultCells, s } from '../../testing/helpers';
import type { Pos, RoofOp, RoofType } from '../types';
import { applyOperations } from './interpreter';
import { javaStairShape } from './roof';

const P = (x: number, y: number, z: number): Pos => ({ x, y, z });

function roof(op: Omit<RoofOp, 'op' | 'stairs' | 'block'>) {
  const doc = newDoc();
  const r = applyOperations(doc, registry, [
    { op: 'roof', stairs: 'oak_stairs', block: 'oak_planks', ...op },
  ]);
  expect(r.errors).toEqual([]);
  return resultCells(doc, r.changeSet);
}

const ST = (facing: HorizontalDirection, shape = 'straight') =>
  s(`oak_stairs[facing=${facing},half=bottom,shape=${shape}]`);
const PL = s('oak_planks');

function expectRoof(cells: Map<string, string>, expected: [Pos, string][]): void {
  expect(dump(cells)).toEqual(expected.map(([p, st]) => `${key(p)}=${st}`).sort());
}

describe('roof: exact small builds', () => {
  const box3 = { from: P(0, 0, 0), to: P(2, 0, 2) };

  it('gable, pitch 1, ridge x, odd span: stairs face the ridge, ridge row and gable ends are blocks', () => {
    expectRoof(roof({ region: box3, type: 'gable', pitch: 1, ridgeAxis: 'x' }), [
      ...[0, 1, 2].map((x): [Pos, string] => [P(x, 1, 0), ST('south')]),
      ...[0, 1, 2].map((x): [Pos, string] => [P(x, 2, 1), PL]),
      ...[0, 1, 2].map((x): [Pos, string] => [P(x, 1, 2), ST('north')]),
      [P(0, 1, 1), PL],
      [P(2, 1, 1), PL],
    ]);
  });

  it('gable, pitch 2: a full block under every stair, ridge two blocks high', () => {
    expectRoof(roof({ region: box3, type: 'gable', pitch: 2, ridgeAxis: 'x' }), [
      ...[0, 1, 2].flatMap((x): [Pos, string][] => [
        [P(x, 1, 0), PL],
        [P(x, 2, 0), ST('south')],
        [P(x, 3, 1), PL],
        [P(x, 4, 1), PL],
        [P(x, 1, 2), PL],
        [P(x, 2, 2), ST('north')],
      ]),
      [P(0, 1, 1), PL],
      [P(0, 2, 1), PL],
      [P(2, 1, 1), PL],
      [P(2, 2, 1), PL],
    ]);
  });

  it('gable, ridge z, even span: the two top rows of stairs meet', () => {
    const region = { from: P(0, 0, 0), to: P(3, 0, 1) };
    expectRoof(roof({ region, type: 'gable', pitch: 1, ridgeAxis: 'z' }), [
      ...[0, 1].flatMap((z): [Pos, string][] => [
        [P(0, 1, z), ST('east')],
        [P(1, 2, z), ST('east')],
        [P(2, 2, z), ST('west')],
        [P(3, 1, z), ST('west')],
        [P(1, 1, z), PL],
        [P(2, 1, z), PL],
      ]),
    ]);
  });

  it('gable with overhang: eaves extend, gable ends stay on the walls', () => {
    const cells = roof({ region: box3, type: 'gable', pitch: 1, ridgeAxis: 'x', overhang: 1 });
    // Ridge row (z = 1) at y = 3 from x = -1 to 3.
    for (let x = -1; x <= 3; x++) expect(cells.get(key(P(x, 3, 1)))).toBe(PL);
    expect(cells.get(key(P(-1, 1, -1)))).toBe(ST('south'));
    expect(cells.get(key(P(3, 1, 3)))).toBe(ST('north'));
    // Gable end at x = 0: under the slope within the wall's span only.
    expect(cells.get(key(P(0, 1, 0)))).toBe(PL);
    expect(cells.get(key(P(0, 2, 1)))).toBe(PL);
    expect(cells.get(key(P(-1, 1, 1)))).toBeUndefined();
    expect(cells.size).toBe(25 + 2 * 4);
  });

  it('hip 3×3, pitch 1: ring of stairs with pinwheel outer corners and a peak block', () => {
    expectRoof(roof({ region: box3, type: 'hip', pitch: 1 }), [
      [P(0, 1, 0), ST('east', 'outer_right')],
      [P(1, 1, 0), ST('south')],
      [P(2, 1, 0), ST('south', 'outer_right')],
      [P(2, 1, 1), ST('west')],
      [P(2, 1, 2), ST('west', 'outer_right')],
      [P(1, 1, 2), ST('north')],
      [P(0, 1, 2), ST('north', 'outer_right')],
      [P(0, 1, 1), ST('east')],
      [P(1, 2, 1), PL],
    ]);
  });

  it('hip 4×4: the 2×2 top is four outer corners', () => {
    const cells = roof({ region: { from: P(0, 0, 0), to: P(3, 0, 3) }, type: 'hip', pitch: 1 });
    expect(cells.get(key(P(1, 2, 1)))).toBe(ST('east', 'outer_right'));
    expect(cells.get(key(P(2, 2, 1)))).toBe(ST('south', 'outer_right'));
    expect(cells.get(key(P(2, 2, 2)))).toBe(ST('west', 'outer_right'));
    expect(cells.get(key(P(1, 2, 2)))).toBe(ST('north', 'outer_right'));
    expect(cells.size).toBe(16);
  });

  it('shed, ridge x: one slope rising to the north, closed sides and tall wall', () => {
    const region = { from: P(0, 0, 0), to: P(1, 0, 2) };
    expectRoof(roof({ region, type: 'shed', pitch: 1, ridgeAxis: 'x' }), [
      ...[0, 1].flatMap((x): [Pos, string][] => [
        [P(x, 1, 2), ST('north')],
        [P(x, 2, 1), ST('north')],
        [P(x, 3, 0), ST('north')],
        [P(x, 1, 1), PL],
        [P(x, 1, 0), PL],
        [P(x, 2, 0), PL],
      ]),
    ]);
  });

  it('shed, ridge z rises to the west', () => {
    const cells = roof({
      region: { from: P(0, 0, 0), to: P(1, 0, 0) },
      type: 'shed',
      pitch: 1,
      ridgeAxis: 'z',
    });
    expect(cells.get(key(P(1, 1, 0)))).toBe(ST('west'));
    expect(cells.get(key(P(0, 2, 0)))).toBe(ST('west'));
    expect(cells.get(key(P(0, 1, 0)))).toBe(PL);
  });

  it('flat: one layer of block over footprint + overhang', () => {
    const cells = roof({
      region: { from: P(0, 0, 0), to: P(0, 3, 0) },
      type: 'flat',
      pitch: 1,
      overhang: 1,
    });
    expect(dump(cells)).toEqual(
      [-1, 0, 1].flatMap((x) => [-1, 0, 1].map((z) => `${x},4,${z}=${PL}`)).sort(),
    );
  });

  it('default ridge axis follows the longer side', () => {
    const along = roof({ region: { from: P(0, 0, 0), to: P(4, 0, 2) }, type: 'gable', pitch: 1 });
    expect(along.get(key(P(4, 2, 1)))).toBe(PL); // ridge along x at z = 1
    const across = roof({ region: { from: P(0, 0, 0), to: P(2, 0, 4) }, type: 'gable', pitch: 1 });
    expect(across.get(key(P(1, 2, 4)))).toBe(PL); // ridge along z at x = 1
  });

  it('keeps extra stair properties (waterlogged) and overrides orientation', () => {
    const doc = newDoc();
    const r = applyOperations(doc, registry, [
      {
        op: 'roof',
        region: box3,
        type: 'gable',
        pitch: 1,
        ridgeAxis: 'x',
        stairs: 'oak_stairs[facing=west,half=top,waterlogged=true]',
        block: 'oak_planks',
      },
    ]);
    expect(resultCells(doc, r.changeSet).get(key(P(0, 1, 0)))).toBe(
      s('oak_stairs[facing=south,half=bottom,waterlogged=true]'),
    );
  });
});

describe('roof: all types × pitch × ridge axis × overhang × sizes', () => {
  const types: RoofType[] = ['gable', 'hip', 'shed', 'flat'];
  const sizes: [number, number][] = [
    [1, 1],
    [1, 4],
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 3],
    [4, 7],
    [6, 6],
  ];
  const UP: Record<HorizontalDirection, { x: number; z: number }> = {
    north: { x: 0, z: -1 },
    south: { x: 0, z: 1 },
    east: { x: 1, z: 0 },
    west: { x: -1, z: 0 },
  };

  for (const type of types)
    for (const pitch of [1, 2] as const)
      for (const ridgeAxis of ['x', 'z'] as const)
        for (const overhang of [0, 2])
          it(`${type} pitch ${pitch} ridge ${ridgeAxis} overhang ${overhang}`, () => {
            for (const [w, d] of sizes) {
              const region = { from: P(10, 5, -3), to: P(10 + w - 1, 7, -3 + d - 1) };
              const cells = roof({ region, type, pitch, ridgeAxis, overhang });
              const stairs = new Map<
                string,
                { pos: Pos; facing: HorizontalDirection; shape: string }
              >();
              const heightAt = new Map<string, number>(); // top y per column
              for (const [k, st] of cells) {
                const [x, y, z] = k.split(',').map(Number) as [number, number, number];
                // Inside footprint + overhang, above the region.
                expect(x).toBeGreaterThanOrEqual(10 - overhang);
                expect(x).toBeLessThanOrEqual(10 + w - 1 + overhang);
                expect(z).toBeGreaterThanOrEqual(-3 - overhang);
                expect(z).toBeLessThanOrEqual(-3 + d - 1 + overhang);
                expect(y).toBeGreaterThanOrEqual(8);
                const col = `${x},${z}`;
                heightAt.set(col, Math.max(heightAt.get(col) ?? -Infinity, y));
                const parsed = parseBlockState(st);
                if (parsed.id === 'minecraft:oak_stairs') {
                  expect(parsed.properties['half']).toBe('bottom');
                  stairs.set(k, {
                    pos: { x, y, z },
                    facing: parsed.properties['facing'] as HorizontalDirection,
                    shape: parsed.properties['shape'] as string,
                  });
                } else expect(st).toBe(PL);
              }
              // Every footprint column is covered.
              expect(heightAt.size).toBe((w + 2 * overhang) * (d + 2 * overhang));
              if (type === 'flat') expect(stairs.size).toBe(0);
              for (const st of stairs.values()) {
                // Java neighbour updates would not change any stair shape.
                const shape = javaStairShape(
                  st.pos,
                  st.facing,
                  (x, y, z) => stairs.get(`${x},${y},${z}`)?.facing,
                );
                expect(shape).toBe(st.shape);
                // Stairs face up-slope: the column in front is not lower than the stair's column.
                const front = `${st.pos.x + UP[st.facing].x},${st.pos.z + UP[st.facing].z}`;
                const own = heightAt.get(`${st.pos.x},${st.pos.z}`) as number;
                if (heightAt.has(front)) expect(heightAt.get(front)).toBeGreaterThanOrEqual(own);
                // The cell behind (down-slope) at the same layer is never a roof cell above it.
                expect(cells.has(`${st.pos.x},${st.pos.y + 1},${st.pos.z}`)).toBe(false);
                if (type === 'gable') {
                  expect(['x', 'z']).toContain(ridgeAxis);
                  expect(ridgeAxis === 'x' ? ['north', 'south'] : ['east', 'west']).toContain(
                    st.facing,
                  );
                }
                if (type === 'shed') expect(st.facing).toBe(ridgeAxis === 'x' ? 'north' : 'west');
                if (type !== 'hip') expect(st.shape).toBe('straight');
              }
              if (type === 'hip' || type === 'gable') {
                // Symmetric profile: heights mirror across the footprint centre.
                const xs = [10 - overhang, 10 + w - 1 + overhang];
                const zs = [-3 - overhang, -3 + d - 1 + overhang];
                for (let x = xs[0] as number; x <= (xs[1] as number); x++)
                  for (let z = zs[0] as number; z <= (zs[1] as number); z++) {
                    const mx = (xs[0] as number) + (xs[1] as number) - x;
                    const mz = (zs[0] as number) + (zs[1] as number) - z;
                    expect(heightAt.get(`${mx},${mz}`)).toBe(heightAt.get(`${x},${z}`));
                  }
              }
            }
          });
});

describe('roof: rotation equivariance', () => {
  for (const type of ['gable', 'hip'] as const)
    for (const pitch of [1, 2] as const)
      it(`${type} pitch ${pitch}: rotating the roof = roof on the rotated footprint`, () => {
        const region = { from: P(0, 0, 0), to: P(5, 0, 2) };
        const doc = newDoc();
        const ops = [
          {
            op: 'roof',
            region,
            type,
            pitch,
            ridgeAxis: 'x',
            stairs: 'oak_stairs',
            block: 'oak_planks',
            overhang: 1,
          },
          { op: 'rotate', region: { from: P(-1, 1, -1), to: P(6, 10, 3) }, turns: 1 },
        ];
        const rotated = applyOperations(doc, registry, ops);
        expect(rotated.errors).toEqual([]);
        // The 8 (X) × 5 (Z) footprint at (-1, -1) becomes 5 × 8 at the same corner.
        const direct = applyOperations(newDoc(), registry, [
          {
            op: 'roof',
            region: { from: P(0, 0, 0), to: P(2, 0, 5) },
            type,
            pitch,
            ridgeAxis: 'z',
            stairs: 'oak_stairs',
            block: 'oak_planks',
            overhang: 1,
          },
        ]);
        expect(dump(resultCells(newDoc(), rotated.changeSet))).toEqual(
          dump(resultCells(newDoc(), direct.changeSet)),
        );
      });
});
