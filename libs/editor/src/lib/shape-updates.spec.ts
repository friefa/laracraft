import {
  AIR,
  type BlockStateString,
  type HorizontalDirection,
  type Vec3,
  WORLD_LIMIT,
  parseBlockState,
} from '@laracraft/core-model';
import { newDoc, newSession, registry, st } from '../testing/fixtures';
import { createSelectionOps } from './selection-ops';
import { updateNeighbourShapes, withShapeUpdates } from './shape-updates';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const DIRS: readonly HorizontalDirection[] = ['north', 'east', 'south', 'west'];
const OFFSET: Record<HorizontalDirection, Vec3> = {
  north: v(0, 0, -1),
  south: v(0, 0, 1),
  east: v(1, 0, 0),
  west: v(-1, 0, 0),
};
const CW: Record<HorizontalDirection, HorizontalDirection> = {
  north: 'east',
  east: 'south',
  south: 'west',
  west: 'north',
};
const CCW: Record<HorizontalDirection, HorizontalDirection> = {
  north: 'west',
  west: 'south',
  south: 'east',
  east: 'north',
};
const add = (a: Vec3, b: Vec3): Vec3 => v(a.x + b.x, a.y + b.y, a.z + b.z);
const neg = (a: Vec3): Vec3 => v(-a.x, -a.y, -a.z);

/** Session with a stone floor at y = 0 for x, z in [-3, 3]. */
function floorSession(activeState = 'minecraft:stone') {
  const s = newSession(activeState);
  const changes = [];
  for (let x = -3; x <= 3; x++) {
    for (let z = -3; z <= 3; z++) {
      changes.push({ pos: v(x, 0, z), before: AIR, after: st('minecraft:stone') });
    }
  }
  s.commit({ changes, origin: 'system' });
  s.undoStack.clear();
  return s;
}

/** Places `state` on top of the floor/block below `pos` with the place tool. */
function placeAt(
  s: ReturnType<typeof newSession>,
  pos: Vec3,
  state: string,
  look?: HorizontalDirection,
): void {
  s.setTool('place');
  s.setActiveState(state);
  s.setLookHorizontal(look);
  s.tap({ pos: add(pos, v(0, -1, 0)), face: 'up' });
}

const at = (s: { doc: { getBlock(x: number, y: number, z: number): BlockStateString } }, p: Vec3) =>
  s.doc.getBlock(p.x, p.y, p.z);
type Props = Partial<
  Record<
    'north' | 'east' | 'south' | 'west' | 'up' | 'shape' | 'type' | 'facing' | 'in_wall',
    string
  >
>;
const props = (state: BlockStateString): Props => parseBlockState(state).properties;

/** Writes raw states without shape updates (simulates imported/legacy content). */
function raw(s: ReturnType<typeof newSession>, entries: [Vec3, string][]): void {
  s.commit({
    changes: entries.map(([pos, state]) => ({ pos, before: at(s, pos), after: st(state) })),
    origin: 'system',
  });
  s.undoStack.clear();
}

describe('fences', () => {
  it('connect to fences, sturdy faces and spanning gates; T-junction', () => {
    const s = floorSession();
    for (const p of [v(0, 1, 0), v(1, 1, 0), v(2, 1, 0), v(1, 1, 1)]) {
      placeAt(s, p, 'minecraft:oak_fence');
    }
    expect(props(at(s, v(1, 1, 0)))).toMatchObject({
      north: 'false',
      east: 'true',
      south: 'true',
      west: 'true',
    });
    expect(props(at(s, v(0, 1, 0)))).toMatchObject({ east: 'true', west: 'false' });
    expect(props(at(s, v(1, 1, 1)))).toMatchObject({ north: 'true', south: 'false' });
    // Different wood types connect too.
    placeAt(s, v(-1, 1, 0), 'minecraft:spruce_fence');
    expect(props(at(s, v(0, 1, 0))).west).toBe('true');
    expect(props(at(s, v(-1, 1, 0))).east).toBe('true');
  });

  it('connect to a full block but not to panes, walls or stairs', () => {
    const s = floorSession();
    placeAt(s, v(0, 1, 0), 'minecraft:oak_fence');
    placeAt(s, v(1, 1, 0), 'minecraft:stone');
    placeAt(s, v(-1, 1, 0), 'minecraft:glass_pane');
    placeAt(s, v(0, 1, 1), 'minecraft:cobblestone_wall');
    placeAt(s, v(0, 1, -1), 'minecraft:oak_stairs', 'north');
    expect(props(at(s, v(0, 1, 0)))).toMatchObject({
      east: 'true',
      west: 'false',
      south: 'false',
      north: 'false',
    });
  });

  it('connect to a fence gate only across the gate', () => {
    const s = floorSession();
    placeAt(s, v(0, 1, 0), 'minecraft:oak_fence');
    placeAt(s, v(1, 1, 0), 'minecraft:oak_fence_gate', 'north'); // spans east-west
    placeAt(s, v(-1, 1, 0), 'minecraft:oak_fence_gate', 'east'); // spans north-south
    expect(props(at(s, v(0, 1, 0)))).toMatchObject({ east: 'true', west: 'false' });
  });

  it('removing a fence disconnects its neighbours in the same undo step', () => {
    const s = floorSession();
    placeAt(s, v(0, 1, 0), 'minecraft:oak_fence');
    placeAt(s, v(1, 1, 0), 'minecraft:oak_fence');
    s.setTool('remove');
    s.tap({ pos: v(1, 1, 0), face: 'up' });
    expect(props(at(s, v(0, 1, 0))).east).toBe('false');
    s.undo();
    expect(props(at(s, v(0, 1, 0))).east).toBe('true');
    expect(props(at(s, v(1, 1, 0))).west).toBe('true');
  });
});

describe('panes and iron bars', () => {
  it('connect to panes, bars, walls and full blocks, not to fences', () => {
    const s = floorSession();
    placeAt(s, v(0, 1, 0), 'minecraft:glass_pane');
    placeAt(s, v(1, 1, 0), 'minecraft:iron_bars');
    placeAt(s, v(-1, 1, 0), 'minecraft:cobblestone_wall');
    placeAt(s, v(0, 1, 1), 'minecraft:glass');
    placeAt(s, v(0, 1, -1), 'minecraft:oak_fence');
    expect(props(at(s, v(0, 1, 0)))).toMatchObject({
      east: 'true',
      west: 'true',
      south: 'true',
      north: 'false',
    });
    expect(props(at(s, v(1, 1, 0))).west).toBe('true');
    expect(props(at(s, v(-1, 1, 0))).east).toBe('low');
  });
});

describe('walls', () => {
  it('isolated wall is a post without sides', () => {
    const s = floorSession();
    placeAt(s, v(0, 1, 0), 'minecraft:cobblestone_wall');
    expect(props(at(s, v(0, 1, 0)))).toMatchObject({
      north: 'none',
      east: 'none',
      south: 'none',
      west: 'none',
      up: 'true',
    });
  });

  it('straight runs drop the post, ends and corners keep it', () => {
    const s = floorSession();
    for (const x of [0, 1, 2]) placeAt(s, v(x, 1, 0), 'minecraft:cobblestone_wall');
    expect(props(at(s, v(1, 1, 0)))).toMatchObject({ east: 'low', west: 'low', up: 'false' });
    expect(props(at(s, v(0, 1, 0)))).toMatchObject({ east: 'low', west: 'none', up: 'true' });
    placeAt(s, v(2, 1, 1), 'minecraft:stone_brick_wall');
    expect(props(at(s, v(2, 1, 0)))).toMatchObject({ west: 'low', south: 'low', up: 'true' });
  });

  it('a full block above makes connected sides tall; a torch above forces the post', () => {
    const s = floorSession();
    for (const x of [0, 1, 2]) placeAt(s, v(x, 1, 0), 'minecraft:cobblestone_wall');
    placeAt(s, v(1, 2, 0), 'minecraft:torch');
    expect(props(at(s, v(1, 1, 0)))).toMatchObject({ east: 'low', up: 'true' });
    s.setTool('remove');
    s.tap({ pos: v(1, 2, 0), face: 'up' });
    placeAt(s, v(1, 2, 0), 'minecraft:stone');
    expect(props(at(s, v(1, 1, 0)))).toMatchObject({
      east: 'tall',
      west: 'tall',
      north: 'none',
      up: 'false',
    });
  });

  it('a wall above connected on the same side makes that side tall', () => {
    const s = floorSession();
    for (const x of [0, 1]) placeAt(s, v(x, 1, 0), 'minecraft:cobblestone_wall');
    placeAt(s, v(0, 2, 0), 'minecraft:cobblestone_wall');
    expect(props(at(s, v(0, 1, 0))).east).toBe('low');
    placeAt(s, v(1, 2, 0), 'minecraft:cobblestone_wall');
    expect(props(at(s, v(1, 1, 0))).west).toBe('tall');
    // The lower wall at x=0 is not a neighbour of the last edit; updates do not cascade.
  });

  it('fence gates between walls are in_wall', () => {
    const s = floorSession();
    placeAt(s, v(0, 1, 0), 'minecraft:oak_fence_gate', 'north');
    expect(props(at(s, v(0, 1, 0))).in_wall).toBe('false');
    placeAt(s, v(1, 1, 0), 'minecraft:cobblestone_wall');
    expect(props(at(s, v(0, 1, 0))).in_wall).toBe('true');
    expect(props(at(s, v(1, 1, 0))).west).toBe('low');
  });
});

describe('redstone wire', () => {
  const wire = (s: ReturnType<typeof newSession>, p: Vec3) => {
    const pr = props(at(s, p));
    return [pr.north, pr.east, pr.south, pr.west].join(',');
  };

  it('isolated wire is a cross, two wires form a line, three a T', () => {
    const s = floorSession();
    placeAt(s, v(0, 1, 0), 'minecraft:redstone_wire');
    expect(wire(s, v(0, 1, 0))).toBe('side,side,side,side');
    placeAt(s, v(1, 1, 0), 'minecraft:redstone_wire');
    expect(wire(s, v(0, 1, 0))).toBe('none,side,none,side');
    expect(wire(s, v(1, 1, 0))).toBe('none,side,none,side');
    placeAt(s, v(1, 1, 1), 'minecraft:redstone_wire');
    expect(wire(s, v(1, 1, 0))).toBe('none,none,side,side');
    expect(wire(s, v(1, 1, 1))).toBe('side,none,side,none');
  });

  it('keeps an explicit dot while isolated, joins when a neighbour connects', () => {
    const s = floorSession();
    raw(s, [[v(0, 1, 0), 'minecraft:redstone_wire']]); // all none = dot
    placeAt(s, v(0, 2, 0), 'minecraft:glass'); // neighbour edit, nothing to connect to
    expect(wire(s, v(0, 1, 0))).toBe('none,none,none,none');
    placeAt(s, v(1, 1, 0), 'minecraft:redstone_wire');
    expect(wire(s, v(0, 1, 0))).toBe('none,side,none,side');
  });

  it('places a dot palette state as a cross', () => {
    const s = floorSession();
    placeAt(s, v(0, 1, 0), 'minecraft:redstone_wire[east=none,north=none,south=none,west=none]');
    expect(wire(s, v(0, 1, 0))).toBe('side,side,side,side');
  });

  it('climbs onto a full block (up) and descends (side); a conductor above cuts it', () => {
    const s = floorSession();
    placeAt(s, v(1, 1, 0), 'minecraft:stone');
    placeAt(s, v(0, 1, 0), 'minecraft:redstone_wire');
    placeAt(s, v(1, 2, 0), 'minecraft:redstone_wire'); // diagonal to the lower wire
    expect(props(at(s, v(0, 1, 0))).east).toBe('up');
    expect(wire(s, v(0, 1, 0))).toBe('none,up,none,side');
    expect(wire(s, v(1, 2, 0))).toBe('none,side,none,side');
    placeAt(s, v(0, 2, 0), 'minecraft:stone');
    // Both wires lose their connection and fall back to crosses (Java default).
    expect(wire(s, v(0, 1, 0))).toBe('side,side,side,side');
    expect(wire(s, v(1, 2, 0))).toBe('side,side,side,side');
  });

  it('removing the upper wire updates the diagonal lower wire', () => {
    const s = floorSession();
    placeAt(s, v(1, 1, 0), 'minecraft:stone');
    placeAt(s, v(0, 1, 0), 'minecraft:redstone_wire');
    placeAt(s, v(1, 2, 0), 'minecraft:redstone_wire');
    s.setTool('remove');
    s.tap({ pos: v(1, 2, 0), face: 'up' });
    expect(wire(s, v(0, 1, 0))).toBe('side,side,side,side');
    s.undo();
    expect(props(at(s, v(0, 1, 0))).east).toBe('up');
  });

  it('connects to components: lever, repeater along its axis, observer back', () => {
    const s = floorSession();
    placeAt(s, v(0, 1, 0), 'minecraft:redstone_wire');
    placeAt(s, v(0, 1, -1), 'minecraft:lever');
    expect(wire(s, v(0, 1, 0))).toBe('side,none,side,none');
    placeAt(s, v(1, 1, 0), 'minecraft:repeater', 'north'); // facing south: across the wire
    expect(props(at(s, v(0, 1, 0))).east).toBe('none');
    const s2 = floorSession();
    placeAt(s2, v(0, 1, 0), 'minecraft:redstone_wire');
    placeAt(s2, v(1, 1, 0), 'minecraft:repeater', 'west'); // facing east: in line
    expect(wire(s2, v(0, 1, 0))).toBe('none,side,none,side');
    const s3 = floorSession();
    placeAt(s3, v(0, 1, 0), 'minecraft:redstone_wire');
    placeAt(s3, v(1, 1, 0), 'minecraft:observer', 'east'); // facing east, back towards the wire
    expect(wire(s3, v(0, 1, 0))).toBe('none,side,none,side');
    const s4 = floorSession();
    placeAt(s4, v(0, 1, 0), 'minecraft:redstone_wire');
    placeAt(s4, v(1, 1, 0), 'minecraft:observer', 'west');
    expect(wire(s4, v(0, 1, 0))).toBe('side,side,side,side');
  });
});

describe('stairs shapes', () => {
  const cases: {
    readonly name: string;
    readonly other: (f: HorizontalDirection) => { offset: Vec3; facing: HorizontalDirection };
  }[] = [
    { name: 'outer_left', other: (f) => ({ offset: OFFSET[f], facing: CCW[f] }) },
    { name: 'outer_right', other: (f) => ({ offset: OFFSET[f], facing: CW[f] }) },
    { name: 'inner_left', other: (f) => ({ offset: neg(OFFSET[f]), facing: CCW[f] }) },
    { name: 'inner_right', other: (f) => ({ offset: neg(OFFSET[f]), facing: CW[f] }) },
  ];

  for (const half of ['bottom', 'top'] as const) {
    for (const facing of DIRS) {
      for (const c of cases) {
        it(`${half} stairs facing ${facing} become ${c.name}`, () => {
          const doc = newDoc();
          const o = v(0, 5, 0);
          const other = c.other(facing);
          const a = st(`minecraft:oak_stairs[facing=${facing},half=${half}]`);
          const b = st(`minecraft:stone_stairs[facing=${other.facing},half=${half}]`);
          doc.apply({ changes: [{ pos: o, before: AIR, after: a }], origin: 'system' });
          const cs = withShapeUpdates(doc, registry, {
            changes: [{ pos: add(o, other.offset), before: AIR, after: b }],
            origin: 'user',
          });
          doc.apply(cs);
          expect(props(doc.getBlock(o.x, o.y, o.z)).shape).toBe(c.name);
          // The other stairs stay straight (nothing in their front/back).
          const p = add(o, other.offset);
          expect(props(doc.getBlock(p.x, p.y, p.z)).shape).toBe('straight');
        });
      }
    }
  }

  it('stairs with a different half do not form corners', () => {
    const doc = newDoc();
    doc.apply({
      changes: [{ pos: v(0, 0, 0), before: AIR, after: st('minecraft:oak_stairs[facing=north]') }],
      origin: 'system',
    });
    const top = st('minecraft:oak_stairs[facing=west,half=top]');
    doc.apply(
      withShapeUpdates(doc, registry, {
        changes: [{ pos: v(0, 0, -1), before: AIR, after: top }],
        origin: 'user',
      }),
    );
    expect(props(doc.getBlock(0, 0, 0)).shape).toBe('straight');
  });

  it('no corner when the side is blocked by stairs continuing the run', () => {
    const doc = newDoc();
    const put = (p: Vec3, state: string) =>
      doc.apply(
        withShapeUpdates(doc, registry, {
          changes: [{ pos: p, before: doc.getBlock(p.x, p.y, p.z), after: st(state) }],
          origin: 'user',
        }),
      );
    // A faces north with stairs facing west in front: outer_left. Stairs east of A
    // that continue A's run (same facing) block the corner (Java `canTakeShape`).
    put(v(0, 0, 0), 'minecraft:oak_stairs[facing=north]');
    put(v(0, 0, -1), 'minecraft:oak_stairs[facing=west]');
    expect(props(doc.getBlock(0, 0, 0)).shape).toBe('outer_left');
    put(v(1, 0, 0), 'minecraft:oak_stairs[facing=north]');
    expect(props(doc.getBlock(0, 0, 0)).shape).toBe('straight');
    put(v(1, 0, 0), 'minecraft:oak_stairs[facing=south]');
    expect(props(doc.getBlock(0, 0, 0)).shape).toBe('outer_left');
  });
});

describe('chests', () => {
  it('pairs with a single chest beside it and splits on removal', () => {
    const s = floorSession();
    placeAt(s, v(0, 1, 0), 'minecraft:chest', 'north'); // facing south
    placeAt(s, v(1, 1, 0), 'minecraft:chest', 'north');
    const a = props(at(s, v(0, 1, 0)));
    const b = props(at(s, v(1, 1, 0)));
    expect(a.facing).toBe('south');
    // Facing south, the old chest lies clockwise (west) of the new one → new `left`, old `right`.
    expect([a.type, b.type]).toEqual(['right', 'left']);
    placeAt(s, v(2, 1, 0), 'minecraft:chest', 'north'); // third chest stays single
    expect(props(at(s, v(2, 1, 0))).type).toBe('single');
    s.setTool('remove');
    s.tap({ pos: v(0, 1, 0), face: 'up' });
    expect(props(at(s, v(1, 1, 0))).type).toBe('single');
  });

  it('does not pair with chests facing another way', () => {
    const s = floorSession();
    placeAt(s, v(0, 1, 0), 'minecraft:chest', 'north');
    placeAt(s, v(1, 1, 0), 'minecraft:chest', 'east');
    expect(props(at(s, v(0, 1, 0))).type).toBe('single');
    expect(props(at(s, v(1, 1, 0))).type).toBe('single');
  });
});

describe('doors', () => {
  it('the upper half follows the lower half', () => {
    const s = floorSession();
    placeAt(s, v(0, 1, 0), 'minecraft:oak_door', 'north');
    const lower = at(s, v(0, 1, 0));
    const changed = st(
      lower.replace('facing=north', 'facing=east').replace('open=false', 'open=true'),
    );
    s.commit(
      withShapeUpdates(s.doc, registry, {
        changes: [{ pos: v(0, 1, 0), before: lower, after: changed }],
        origin: 'user',
      }),
    );
    expect(props(at(s, v(0, 2, 0)))).toMatchObject({ half: 'upper', facing: 'east', open: 'true' });
  });
});

describe('selection ops and paste', () => {
  it('fill updates the border in one undo step', () => {
    const s = floorSession();
    placeAt(s, v(0, 1, 0), 'minecraft:oak_fence');
    s.setSelection({ min: v(1, 1, 0), max: v(2, 1, 0) });
    s.fillSelection(st('minecraft:oak_fence'));
    expect(props(at(s, v(0, 1, 0))).east).toBe('true');
    expect(props(at(s, v(1, 1, 0)))).toMatchObject({ east: 'true', west: 'true' });
    expect(props(at(s, v(2, 1, 0)))).toMatchObject({ east: 'false', west: 'true' });
    s.undo();
    expect(props(at(s, v(0, 1, 0))).east).toBe('false');
    s.deleteSelection();
    expect(props(at(s, v(0, 1, 0))).east).toBe('false');
  });

  it('paste tool connects pasted fences to existing ones', () => {
    const s = floorSession();
    placeAt(s, v(0, 1, 0), 'minecraft:oak_fence');
    s.setSelection({ min: v(0, 1, 0), max: v(0, 1, 0) });
    s.copySelection();
    s.setTool('paste');
    s.tap({ pos: v(1, 0, 0), face: 'up' });
    s.confirmPaste();
    expect(props(at(s, v(0, 1, 0))).east).toBe('true');
    expect(props(at(s, v(1, 1, 0))).west).toBe('true');
    expect(s.history).toHaveLength(2);
  });

  it('rotate recomputes the neighbours outside the box', () => {
    const s = floorSession();
    placeAt(s, v(0, 1, 0), 'minecraft:oak_fence');
    placeAt(s, v(1, 1, 1), 'minecraft:stone');
    s.setSelection({ min: v(1, 1, 0), max: v(2, 1, 1) }); // stone at (1,1,1) moves to (1,1,0)
    s.rotateSelection(1);
    expect(at(s, v(1, 1, 0))).toBe(st('minecraft:stone'));
    expect(props(at(s, v(0, 1, 0))).east).toBe('true');
    s.undo();
    expect(props(at(s, v(0, 1, 0))).east).toBe('false');
  });

  it('createSelectionOps fill already contains the shape updates', () => {
    const doc = newDoc();
    const ops = createSelectionOps(registry);
    const cs = ops.fill(doc, { min: v(0, 0, 0), max: v(2, 0, 0) }, st('minecraft:glass_pane'));
    expect(cs.changes.map((c) => c.after)).toEqual([
      st('minecraft:glass_pane[east=true]'),
      st('minecraft:glass_pane[east=true,west=true]'),
      st('minecraft:glass_pane[west=true]'),
    ]);
    doc.apply(cs);
    expect(props(doc.getBlock(1, 0, 0))).toMatchObject({ east: 'true', west: 'true' });
  });
});

describe('updateNeighbourShapes', () => {
  it('only touches the given positions and their neighbours', () => {
    const doc = newDoc();
    const fence = st('minecraft:oak_fence');
    doc.apply({
      changes: [0, 1, 2, 3].map((x) => ({ pos: v(x, 0, 0), before: AIR, after: fence })),
      origin: 'system',
    });
    const changes = updateNeighbourShapes(doc, registry, [v(0, 0, 0)]);
    expect(changes.map((c) => c.pos)).toEqual([v(0, 0, 0), v(1, 0, 0)]);
  });

  it('ignores neighbours outside the world', () => {
    const doc = newDoc();
    const edge = v(-WORLD_LIMIT, 0, 0);
    doc.apply({
      changes: [{ pos: edge, before: AIR, after: st('minecraft:oak_fence[west=true]') }],
      origin: 'system',
    });
    expect(updateNeighbourShapes(doc, registry, [edge, v(-WORLD_LIMIT - 1, 0, 0)])).toEqual([
      { pos: edge, before: st('minecraft:oak_fence[west=true]'), after: st('minecraft:oak_fence') },
    ]);
  });

  it('handles a large fill quickly', () => {
    const s = newSession('minecraft:stone');
    s.setSelection({ min: v(0, 0, 0), max: v(63, 31, 63) });
    const t = performance.now();
    s.fillSelection();
    expect(performance.now() - t).toBeLessThan(5000);
    expect(at(s, v(63, 31, 63))).toBe(st('minecraft:stone'));
  });
});
