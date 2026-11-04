import {
  AIR,
  type BlockStateString,
  type Box3,
  type BuildDocument,
  type Vec3,
} from '@laracraft/core-model';
import { newDoc, registry, st } from '../testing/fixtures';
import { MAX_EDIT_VOLUME } from './api';
import { boxCells } from './box';
import { EditVolumeError, rotatedBox, selectionOps as ops } from './selection-ops';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const STONE = st('minecraft:stone');
const DIRT = st('minecraft:dirt');

function put(doc: BuildDocument, blocks: [Vec3, BlockStateString][]) {
  doc.apply({
    changes: blocks.map(([pos, after]) => ({ pos, before: AIR, after })),
    origin: 'system',
  });
}

/** All non-air blocks as "x,y,z=state". */
function dump(doc: BuildDocument, box: Box3): string[] {
  const out: string[] = [];
  for (const p of boxCells(box)) {
    const s = doc.getBlock(p.x, p.y, p.z);
    if (s !== AIR) out.push(`${p.x},${p.y},${p.z}=${s}`);
  }
  return out.sort();
}

const BOX: Box3 = { min: v(0, 0, 0), max: v(2, 1, 1) };
const AROUND: Box3 = { min: v(-4, -1, -4), max: v(6, 3, 6) };

/** Asymmetric 3×2×2 structure: stone (NW), stairs at the east end, a door at the south. */
function structure(): BuildDocument {
  const doc = newDoc();
  put(doc, [
    [v(0, 0, 0), STONE],
    [v(2, 0, 0), st('minecraft:oak_stairs[facing=east,shape=outer_left]')],
    [v(1, 0, 1), st('minecraft:oak_door[facing=north,half=lower,hinge=left]')],
    [v(1, 1, 1), st('minecraft:oak_door[facing=north,half=upper,hinge=left]')],
  ]);
  return doc;
}

describe('fill / replace', () => {
  it('fill only lists real changes', () => {
    const doc = newDoc();
    put(doc, [[v(0, 0, 0), DIRT]]);
    const cs = ops.fill(doc, { min: v(1, 0, 0), max: v(0, 0, 1) }, DIRT);
    expect(cs.changes).toHaveLength(3);
    expect(cs.label).toBe('editor.action.fill');
  });

  it('replace only touches matching cells', () => {
    const doc = newDoc();
    put(doc, [
      [v(0, 0, 0), DIRT],
      [v(1, 0, 0), STONE],
    ]);
    const cs = ops.replace(doc, { min: v(0, 0, 0), max: v(3, 0, 0) }, DIRT, STONE);
    expect(cs.changes).toEqual([{ pos: v(0, 0, 0), before: DIRT, after: STONE }]);
    expect(ops.replace(doc, BOX, DIRT, DIRT).changes).toEqual([]);
    // Replacing air works too.
    expect(ops.replace(doc, { min: v(0, 0, 0), max: v(3, 0, 0) }, AIR, DIRT).changes).toHaveLength(
      2,
    );
  });
});

describe('rotate', () => {
  it('rotates positions and blockstates of an asymmetric structure (90° clockwise)', () => {
    const doc = structure();
    doc.apply(ops.rotate(doc, registry, BOX, 1));
    expect(rotatedBox(BOX, 1)).toEqual({ min: v(0, 0, 0), max: v(1, 1, 2) });
    expect(dump(doc, AROUND)).toEqual(
      [
        `1,0,0=${STONE}`,
        `1,0,2=${st('minecraft:oak_stairs[facing=south,shape=outer_left]')}`,
        `0,0,1=${st('minecraft:oak_door[facing=east,half=lower,hinge=left]')}`,
        `0,1,1=${st('minecraft:oak_door[facing=east,half=upper,hinge=left]')}`,
      ].sort(),
    );
  });

  it('four quarter turns (following the box) restore the original', () => {
    const doc = structure();
    const original = dump(doc, AROUND);
    let box = BOX;
    for (let i = 0; i < 4; i++) {
      doc.apply(ops.rotate(doc, registry, box, 1));
      box = rotatedBox(box, 1);
    }
    expect(box).toEqual(BOX);
    expect(dump(doc, AROUND)).toEqual(original);
  });

  it('180° equals mirror x then mirror z', () => {
    const a = structure();
    a.apply(ops.rotate(a, registry, BOX, 2));
    const b = structure();
    b.apply(ops.mirror(b, registry, BOX, 'x'));
    b.apply(ops.mirror(b, registry, BOX, 'z'));
    expect(dump(a, AROUND)).toEqual(dump(b, AROUND));
  });
});

describe('mirror', () => {
  it('mirrors along x: positions flip east/west, stairs shape and door hinge swap', () => {
    const doc = structure();
    doc.apply(ops.mirror(doc, registry, BOX, 'x'));
    expect(dump(doc, AROUND)).toEqual(
      [
        `2,0,0=${STONE}`,
        `0,0,0=${st('minecraft:oak_stairs[facing=west,shape=outer_right]')}`,
        `1,0,1=${st('minecraft:oak_door[facing=north,half=lower,hinge=right]')}`,
        `1,1,1=${st('minecraft:oak_door[facing=north,half=upper,hinge=right]')}`,
      ].sort(),
    );
  });

  it('mirrors along z and is an involution', () => {
    const doc = structure();
    const original = dump(doc, AROUND);
    doc.apply(ops.mirror(doc, registry, BOX, 'z'));
    expect(doc.getBlock(0, 0, 1)).toBe(STONE);
    expect(doc.getBlock(1, 0, 0)).toBe(
      st('minecraft:oak_door[facing=south,half=lower,hinge=right]'),
    );
    doc.apply(ops.mirror(doc, registry, BOX, 'z'));
    expect(dump(doc, AROUND)).toEqual(original);
  });
});

describe('copy / paste', () => {
  it('copies relative to the min corner, excluding air, and pastes without clearing', () => {
    const doc = structure();
    const clip = ops.copy(doc, { min: v(2, 1, 1), max: v(0, 0, 0) });
    expect(clip.size).toEqual(v(3, 2, 2));
    expect(clip.blocks).toHaveLength(4);
    put(doc, [[v(11, 0, 0), DIRT]]);
    const cs = ops.paste(doc, clip, v(10, 0, 0));
    expect(cs.label).toBe('editor.action.paste');
    doc.apply(cs);
    expect(doc.getBlock(10, 0, 0)).toBe(STONE);
    expect(doc.getBlock(11, 0, 0)).toBe(DIRT); // air in the clipboard does not clear
    expect(doc.getBlock(11, 1, 1)).toBe(st('minecraft:oak_door[half=upper]'));
    expect(ops.paste(doc, clip, v(10, 0, 0)).changes).toEqual([]);
  });
});

describe('volume limit', () => {
  const big: Box3 = { min: v(0, 0, 0), max: v(63, 63, 64) };
  it('applies to every op', () => {
    const doc = newDoc();
    expect(64 * 64 * 65).toBeGreaterThan(MAX_EDIT_VOLUME);
    expect(() => ops.fill(doc, big, STONE)).toThrow(EditVolumeError);
    expect(() => ops.replace(doc, big, AIR, STONE)).toThrow(EditVolumeError);
    expect(() => ops.rotate(doc, registry, big, 1)).toThrow(EditVolumeError);
    expect(() => ops.mirror(doc, registry, big, 'x')).toThrow(EditVolumeError);
    expect(() => ops.copy(doc, big)).toThrow(EditVolumeError);
    expect(() => ops.paste(doc, { size: v(64, 64, 65), blocks: [] }, v(0, 0, 0))).toThrow(
      EditVolumeError,
    );
    try {
      ops.fill(doc, big, STONE);
    } catch (e) {
      expect(e).toMatchObject({ volume: 64 * 64 * 65, limit: MAX_EDIT_VOLUME });
    }
  });

  it('allows exactly the limit', () => {
    const doc = newDoc();
    expect(ops.fill(doc, { min: v(0, 0, 0), max: v(63, 63, 63) }, STONE).changes).toHaveLength(
      MAX_EDIT_VOLUME,
    );
  });
});
