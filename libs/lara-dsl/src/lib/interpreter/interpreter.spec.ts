import { AIR, invertChangeSet } from '@laracraft/core-model';
import { dump, newDoc, registry, resultCells, s, testModules } from '../../testing/helpers';
import { DEFAULT_DSL_LIMITS, type Operation, type Pos } from '../types';
import { applyOperation, applyOperations, createLaraTurn } from './interpreter';

const P = (x: number, y: number, z: number): Pos => ({ x, y, z });
const R = (a: Pos, b: Pos) => ({ from: a, to: b });

type Cell = { pos: Pos; state: string };

function run(ops: Operation[], initial: Cell[] = []) {
  const doc = newDoc(initial);
  const result = applyOperations(doc, registry, ops, { modules: testModules });
  expect(result.errors).toEqual([]);
  return { doc, result, cells: resultCells(doc, result.changeSet) };
}

const expectCells = (cells: Map<string, string>, expected: [Pos, string][]) => {
  expect(dump(cells)).toEqual(expected.map(([p, st]) => `${p.x},${p.y},${p.z}=${s(st)}`).sort());
};

describe('fill', () => {
  it('fills the region (corners in any order)', () => {
    const { cells, result } = run([
      { op: 'fill', region: R(P(1, 0, 1), P(0, 0, 0)), block: 'stone' },
    ]);
    expectCells(cells, [
      [P(0, 0, 0), 'stone'],
      [P(1, 0, 0), 'stone'],
      [P(0, 0, 1), 'stone'],
      [P(1, 0, 1), 'stone'],
    ]);
    expect(result.changeSet.origin).toBe('lara');
    expect(result.reports).toEqual([
      { op: 'fill', changed: 4, blocks: [{ state: s('stone'), count: 4 }] },
    ]);
  });

  it('respects onlyReplace (bare id matches all states, air allowed)', () => {
    const { cells } = run(
      [
        {
          op: 'fill',
          region: R(P(0, 0, 0), P(2, 0, 0)),
          block: 'glass',
          onlyReplace: ['minecraft:oak_stairs', 'air'],
        },
      ],
      [
        { pos: P(0, 0, 0), state: 'oak_stairs[facing=west]' },
        { pos: P(1, 0, 0), state: 'stone' },
      ],
    );
    expectCells(cells, [
      [P(0, 0, 0), 'glass'],
      [P(1, 0, 0), 'stone'],
      [P(2, 0, 0), 'glass'],
    ]);
  });
});

describe('hollowBox', () => {
  const region = R(P(0, 0, 0), P(2, 2, 2));
  const shell = (): [Pos, string][] => {
    const out: [Pos, string][] = [];
    for (let y = 0; y < 3; y++)
      for (let z = 0; z < 3; z++)
        for (let x = 0; x < 3; x++)
          if (!(x === 1 && y === 1 && z === 1)) out.push([P(x, y, z), 'oak_planks']);
    return out;
  };

  it('builds the shell and clears the interior', () => {
    const { cells } = run(
      [{ op: 'hollowBox', region, block: 'oak_planks' }],
      [{ pos: P(1, 1, 1), state: 'stone' }],
    );
    expectCells(cells, shell());
  });

  it('keeps the interior with keepInterior', () => {
    const { cells } = run(
      [{ op: 'hollowBox', region, block: 'oak_planks', keepInterior: true }],
      [{ pos: P(1, 1, 1), state: 'stone' }],
    );
    expectCells(cells, [...shell(), [P(1, 1, 1), 'stone']]);
  });
});

describe('line', () => {
  it('draws a 3D Bresenham line including both ends', () => {
    const { cells } = run([{ op: 'line', from: P(0, 0, 0), to: P(3, 1, 0), block: 'cobblestone' }]);
    expectCells(cells, [
      [P(0, 0, 0), 'cobblestone'],
      [P(1, 0, 0), 'cobblestone'],
      [P(2, 1, 0), 'cobblestone'],
      [P(3, 1, 0), 'cobblestone'],
    ]);
  });

  it('handles a single cell and negative directions', () => {
    expectCells(run([{ op: 'line', from: P(1, 1, 1), to: P(1, 1, 1), block: 'stone' }]).cells, [
      [P(1, 1, 1), 'stone'],
    ]);
    expectCells(run([{ op: 'line', from: P(0, 2, 0), to: P(0, 0, -2), block: 'stone' }]).cells, [
      [P(0, 2, 0), 'stone'],
      [P(0, 1, -1), 'stone'],
      [P(0, 0, -2), 'stone'],
    ]);
  });
});

describe('wall', () => {
  it('builds height layers along the base line', () => {
    const { cells } = run([
      { op: 'wall', from: P(0, 1, 0), to: P(2, 1, 0), height: 2, block: 'bricks' },
    ]);
    expectCells(
      cells,
      [0, 1, 2].flatMap((x) => [1, 2].map((y): [Pos, string] => [P(x, y, 0), 'bricks'])),
    );
  });

  it('supports diagonal walls', () => {
    const { cells } = run([
      { op: 'wall', from: P(0, 0, 0), to: P(2, 0, 2), height: 1, block: 'bricks' },
    ]);
    expectCells(cells, [
      [P(0, 0, 0), 'bricks'],
      [P(1, 0, 1), 'bricks'],
      [P(2, 0, 2), 'bricks'],
    ]);
  });
});

describe('floor, placeBlock, clear', () => {
  it('floor uses the X/Z footprint at y', () => {
    const { cells } = run([
      { op: 'floor', region: R(P(0, 50, 0), P(1, -3, 0)), y: 4, block: 'spruce_planks' },
    ]);
    expectCells(cells, [
      [P(0, 4, 0), 'spruce_planks'],
      [P(1, 4, 0), 'spruce_planks'],
    ]);
  });

  it('placeBlock places one canonical state', () => {
    const { cells } = run([
      { op: 'placeBlock', pos: P(-5, 2, 7), block: 'oak_door[half=lower,facing=south]' },
    ]);
    expectCells(cells, [[P(-5, 2, 7), 'oak_door[facing=south,half=lower]']]);
  });

  it('clear sets air', () => {
    const { cells, result } = run(
      [{ op: 'clear', region: R(P(0, 0, 0), P(1, 0, 0)) }],
      [
        { pos: P(0, 0, 0), state: 'stone' },
        { pos: P(2, 0, 0), state: 'stone' },
      ],
    );
    expectCells(cells, [[P(2, 0, 0), 'stone']]);
    expect(result.reports[0]).toEqual({
      op: 'clear',
      changed: 1,
      blocks: [{ state: AIR, count: 1 }],
    });
  });
});

describe('replace', () => {
  const initial: Cell[] = [
    { pos: P(0, 0, 0), state: 'oak_stairs[facing=east,half=top]' },
    { pos: P(1, 0, 0), state: 'oak_stairs[facing=west]' },
    { pos: P(2, 0, 0), state: 'oak_planks' },
  ];

  it('bare pattern matches all states and keeps compatible properties', () => {
    const { cells } = run(
      [
        {
          op: 'replace',
          region: R(P(0, 0, 0), P(2, 0, 0)),
          from: 'oak_stairs',
          to: 'spruce_stairs',
        },
      ],
      initial,
    );
    expectCells(cells, [
      [P(0, 0, 0), 'spruce_stairs[facing=east,half=top]'],
      [P(1, 0, 0), 'spruce_stairs[facing=west]'],
      [P(2, 0, 0), 'oak_planks'],
    ]);
  });

  it('pattern properties must match; explicit target properties win', () => {
    const { cells } = run(
      [
        {
          op: 'replace',
          region: R(P(0, 0, 0), P(2, 0, 0)),
          from: 'oak_stairs[half=top]',
          to: 'stone_brick_stairs[half=bottom]',
        },
      ],
      initial,
    );
    expectCells(cells, [
      [P(0, 0, 0), 'stone_brick_stairs[facing=east,half=bottom]'],
      [P(1, 0, 0), 'oak_stairs[facing=west]'],
      [P(2, 0, 0), 'oak_planks'],
    ]);
  });

  it('drops properties the target does not have', () => {
    const { cells } = run(
      [{ op: 'replace', region: R(P(0, 0, 0), P(2, 0, 0)), from: 'oak_stairs', to: 'glass' }],
      initial,
    );
    expectCells(cells, [
      [P(0, 0, 0), 'glass'],
      [P(1, 0, 0), 'glass'],
      [P(2, 0, 0), 'oak_planks'],
    ]);
  });
});

describe('mirror and rotate', () => {
  it('mirror x flips positions and blockstates', () => {
    const { cells } = run(
      [{ op: 'mirror', region: R(P(0, 0, 0), P(2, 0, 0)), axis: 'x' }],
      [
        { pos: P(0, 0, 0), state: 'oak_stairs[facing=east,shape=outer_left]' },
        { pos: P(1, 0, 0), state: 'stone' },
      ],
    );
    expectCells(cells, [
      [P(2, 0, 0), 'oak_stairs[facing=west,shape=outer_right]'],
      [P(1, 0, 0), 'stone'],
    ]);
  });

  it('mirror z flips north/south', () => {
    const { cells } = run(
      [{ op: 'mirror', region: R(P(0, 0, 0), P(0, 0, 3)), axis: 'z' }],
      [{ pos: P(0, 0, 0), state: 'oak_stairs[facing=north]' }],
    );
    expectCells(cells, [[P(0, 0, 3), 'oak_stairs[facing=south]']]);
  });

  it('rotate 1 turn anchors at the min corner and swaps X/Z sizes', () => {
    const { cells } = run(
      [{ op: 'rotate', region: R(P(0, 0, 0), P(1, 0, 0)), turns: 1 }],
      [
        { pos: P(0, 0, 0), state: 'stone' },
        { pos: P(1, 0, 0), state: 'oak_stairs[facing=east]' },
      ],
    );
    // Clockwise: the east end moves to the south.
    expectCells(cells, [
      [P(0, 0, 0), 'stone'],
      [P(0, 0, 1), 'oak_stairs[facing=south]'],
    ]);
  });

  it('rotate 2 turns stays in the box', () => {
    const { cells } = run(
      [{ op: 'rotate', region: R(P(0, 0, 0), P(2, 0, 1)), turns: 2 }],
      [
        { pos: P(0, 0, 0), state: 'oak_log[axis=x]' },
        { pos: P(2, 0, 0), state: 'furnace[facing=north]' },
      ],
    );
    expectCells(cells, [
      [P(2, 0, 1), 'oak_log[axis=x]'],
      [P(0, 0, 1), 'furnace[facing=south]'],
    ]);
  });

  it('rotate 3 turns (counter-clockwise) moves east to north', () => {
    const { cells } = run(
      [{ op: 'rotate', region: R(P(0, 0, 0), P(1, 0, 0)), turns: 3 }],
      [{ pos: P(1, 0, 0), state: 'oak_log[axis=x]' }],
    );
    expectCells(cells, [[P(0, 0, 0), 'oak_log[axis=z]']]);
  });
});

describe('copy', () => {
  it('copies including air and repeats along the default step (size X)', () => {
    const { cells } = run(
      [{ op: 'copy', region: R(P(0, 0, 0), P(1, 0, 0)), to: P(0, 0, 2), repeat: 2 }],
      [
        { pos: P(0, 0, 0), state: 'stone' },
        { pos: P(1, 0, 2), state: 'glass' }, // overwritten by copied air
      ],
    );
    expectCells(cells, [
      [P(0, 0, 0), 'stone'],
      [P(0, 0, 2), 'stone'],
      [P(2, 0, 2), 'stone'],
    ]);
  });

  it('reads the source before writing (overlapping copies)', () => {
    const { cells } = run(
      [
        {
          op: 'copy',
          region: R(P(0, 0, 0), P(1, 0, 0)),
          to: P(1, 0, 0),
          repeat: 3,
          step: P(1, 0, 0),
        },
      ],
      [
        { pos: P(0, 0, 0), state: 'stone' },
        { pos: P(1, 0, 0), state: 'glass' },
      ],
    );
    expectCells(cells, [
      [P(0, 0, 0), 'stone'],
      [P(1, 0, 0), 'stone'],
      [P(2, 0, 0), 'stone'],
      [P(3, 0, 0), 'stone'],
      [P(4, 0, 0), 'glass'],
    ]);
  });
});

describe('insertModule', () => {
  it('builds the module oriented by facing, relative to pos', () => {
    const { cells } = run([
      {
        op: 'insertModule',
        moduleId: 'piston_door_2x2',
        pos: P(10, 0, 0),
        facing: 'east',
        params: { sticky: true },
      },
    ]);
    expectCells(cells, [
      [P(10, 0, 0), 'sticky_piston[facing=east]'],
      [P(10, 0, 1), 'observer[facing=east]'],
      [P(9, 1, 0), 'oak_stairs[facing=east]'],
    ]);
  });
});

describe('Lara turns', () => {
  it('later operations see earlier ones and one change set covers the turn', () => {
    const doc = newDoc([{ pos: P(0, 0, 0), state: 'dirt' }]);
    const { changeSet, reports, errors } = applyOperations(doc, registry, [
      { op: 'fill', region: R(P(0, 0, 0), P(2, 0, 0)), block: 'stone' },
      { op: 'replace', region: R(P(0, 0, 0), P(2, 0, 0)), from: 'stone', to: 'glass' },
      { op: 'placeBlock', pos: P(1, 0, 0), block: 'dirt' },
      { op: 'clear', region: R(P(0, 0, 0), P(0, 0, 0)) },
    ]);
    expect(errors).toEqual([]);
    expect(reports.map((r) => r.changed)).toEqual([3, 3, 1, 1]);
    // Before = document state at turn start; cells reverted to it are not changes.
    expect(
      dump(
        new Map(
          changeSet.changes.map((c) => [
            `${c.pos.x},${c.pos.y},${c.pos.z}`,
            `${c.before}>${c.after}`,
          ]),
        ),
      ),
    ).toEqual([
      `0,0,0=${s('dirt')}>${AIR}`,
      `1,0,0=${AIR}>${s('dirt')}`,
      `2,0,0=${AIR}>${s('glass')}`,
    ]);
    // The document itself is untouched; applying + inverting restores it.
    expect(doc.getBlock(0, 0, 0)).toBe(s('dirt'));
    const applied = doc.apply(changeSet);
    doc.apply(invertChangeSet(applied));
    expect(dump(resultCells(doc, { changes: [], origin: 'lara' }))).toEqual([`0,0,0=${s('dirt')}`]);
  });

  it('is all-or-nothing on errors and reports every failing operation', () => {
    const doc = newDoc();
    const r = applyOperations(doc, registry, [
      { op: 'fill', region: R(P(0, 0, 0), P(1, 0, 0)), block: 'stone' },
      { op: 'placeBlock', pos: P(0, 0, 0), block: 'minecraft:stonee' },
      { op: 'nope' },
    ]);
    expect(r.changeSet.changes).toEqual([]);
    expect(r.reports).toEqual([]);
    expect(r.errors.map((e) => [e.index, e.errors[0]?.code])).toEqual([
      [1, 'unknown-block'],
      [2, 'schema'],
    ]);
  });

  it('enforces maxOpsPerTurn and maxCellsPerTurn', () => {
    const limits = { ...DEFAULT_DSL_LIMITS, maxOpsPerTurn: 2, maxCellsPerTurn: 5 };
    const ops: Operation[] = [0, 1, 2].map((i) => ({
      op: 'placeBlock',
      pos: P(i, 0, 0),
      block: 'stone',
    }));
    expect(applyOperations(newDoc(), registry, ops, { limits }).errors[0]?.errors[0]?.code).toBe(
      'limit',
    );

    const turn = createLaraTurn(newDoc(), registry, { limits });
    expect(turn.apply({ op: 'fill', region: R(P(0, 0, 0), P(3, 0, 0)), block: 'stone' }).ok).toBe(
      true,
    );
    const tooMany = turn.apply({ op: 'fill', region: R(P(0, 1, 0), P(1, 1, 0)), block: 'stone' });
    expect(tooMany).toMatchObject({ ok: false, errors: [{ code: 'limit' }] });
    expect(turn.changedCells).toBe(4);
    // Re-writing cells already changed in this turn does not count again.
    expect(turn.apply({ op: 'fill', region: R(P(0, 0, 0), P(3, 0, 0)), block: 'glass' }).ok).toBe(
      false,
    ); // op limit
    expect(turn.operationCount).toBe(3);
  });

  it('streaming: each step returns its delta; finish merges them into one undo step', () => {
    const doc = newDoc();
    const turn = createLaraTurn(doc, registry, { label: 'Haus' });
    const a = turn.applyToolCall('fill', { region: R(P(0, 0, 0), P(1, 0, 0)), block: 'stone' });
    expect(a.ok && a.changes.length).toBe(2);
    if (a.ok) doc.apply({ changes: a.changes, origin: 'lara' }); // render live
    const b = turn.applyToolCall('place_block', { pos: P(0, 0, 0), block: 'glass' });
    expect(b.ok && b.changes).toEqual([{ pos: P(0, 0, 0), before: s('stone'), after: s('glass') }]);
    if (b.ok) doc.apply({ changes: b.changes, origin: 'lara' });
    const bad = turn.applyToolCall('place_block', { pos: P(0, 0, 0), block: 'glas' });
    expect(bad.ok).toBe(false);
    const merged = turn.finish();
    expect(merged.label).toBe('Haus');
    expect(merged.changes.map((c) => [c.pos.x, c.before, c.after])).toEqual([
      [0, AIR, s('glass')],
      [1, AIR, s('stone')],
    ]);
    expect(turn.reports.map((r) => r.op)).toEqual(['fill', 'placeBlock']);
    // Undo of the merged change set restores the document from before the turn.
    doc.apply(invertChangeSet(merged));
    expect(doc.volume.blockCount).toBe(0);
  });

  it('applyOperation is the single-operation variant', () => {
    const r = applyOperation(newDoc(), registry, {
      op: 'placeBlock',
      pos: P(0, 0, 0),
      block: 'stone',
    });
    expect(r.changeSet.changes).toHaveLength(1);
  });

  it('identical input gives identical output', () => {
    const ops: Operation[] = [
      { op: 'hollowBox', region: R(P(0, 0, 0), P(6, 4, 5)), block: 'oak_planks' },
      {
        op: 'roof',
        region: R(P(0, 0, 0), P(6, 4, 5)),
        type: 'hip',
        pitch: 1,
        stairs: 'oak_stairs',
        block: 'oak_planks',
        overhang: 1,
      },
      { op: 'rotate', region: R(P(0, 0, 0), P(6, 9, 5)), turns: 1 },
    ];
    const a = applyOperations(newDoc(), registry, ops);
    const b = applyOperations(newDoc(), registry, ops);
    expect(a).toEqual(b);
    expect(a.errors).toEqual([]);
  });
});
