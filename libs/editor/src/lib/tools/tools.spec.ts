import { BuildDocument as HoverDoc, createJavaBlockRegistry } from '@laracraft/core-model';
import { EditorSession } from '../editor-session';
import { AIR, type Vec3 } from '@laracraft/core-model';
import { newSession, st } from '../../testing/fixtures';
import type { Pick, PointerModifiers } from '../api';
import { EditVolumeError } from '../selection-ops';

const STONE = st('minecraft:stone');
const DIRT = st('minecraft:dirt');
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const pick = (x: number, y: number, z: number, face: Pick['face'] = 'up'): Pick => ({
  pos: v(x, y, z),
  face,
});
const SHIFT: PointerModifiers = { shift: true, alt: false, primary: false };

function sessionWithFloor() {
  const s = newSession();
  s.commit({
    changes: [0, 1, 2].map((x) => ({ pos: v(x, 0, 0), before: AIR, after: STONE })),
    origin: 'system',
  });
  s.undoStack.clear();
  return s;
}

describe('place tool', () => {
  it('places at pick + face offset with an i18n label', () => {
    const s = sessionWithFloor();
    s.setActiveState('minecraft:dirt');
    s.tap(pick(0, 0, 0, 'up'));
    s.tap(pick(0, 0, 0, 'east')); // (1,0,0) is occupied → no-op
    s.tap(pick(2, 0, 0, 'east'));
    expect(s.doc.getBlock(0, 1, 0)).toBe(DIRT);
    expect(s.doc.getBlock(3, 0, 0)).toBe(DIRT);
    expect(s.doc.getBlock(1, 0, 0)).toBe(STONE);
    expect(s.history).toEqual([
      { label: 'editor.action.place', origin: 'user' },
      { label: 'editor.action.place', origin: 'user' },
    ]);
  });

  it('places nothing on empty space or into occupied cells', () => {
    const s = sessionWithFloor();
    s.tap(null);
    s.tap(pick(0, 0, 0, 'east'));
    expect(s.canUndo).toBe(false);
  });

  it('orients by clicked face and camera direction', () => {
    const s = sessionWithFloor();
    s.setActiveState('minecraft:oak_log');
    s.tap(pick(2, 0, 0, 'east'));
    expect(s.doc.getBlock(3, 0, 0)).toBe(st('minecraft:oak_log[axis=x]'));
    s.setActiveState('minecraft:oak_stairs');
    s.setLookHorizontal('west');
    s.tap(pick(0, 0, 0, 'up'));
    expect(s.doc.getBlock(0, 1, 0)).toBe(st('minecraft:oak_stairs[facing=west,half=bottom]'));
    s.tap(pick(0, 1, 0, 'down')); // underside is occupied → no-op
    s.tap(pick(2, 0, 0, 'down'));
    expect(s.doc.getBlock(2, -1, 0)).toBe(st('minecraft:oak_stairs[facing=west,half=top]'));
  });

  it('places both door halves and needs room for both', () => {
    const s = sessionWithFloor();
    s.setActiveState('minecraft:oak_door[half=upper]');
    s.setLookHorizontal('north');
    s.tap(pick(1, 0, 0, 'up'));
    expect(s.doc.getBlock(1, 1, 0)).toBe(st('minecraft:oak_door[facing=north,half=lower]'));
    expect(s.doc.getBlock(1, 2, 0)).toBe(st('minecraft:oak_door[facing=north,half=upper]'));
    s.tap(pick(2, 0, 0, 'east'));
    expect(s.history).toHaveLength(2);

    // Blocked upper cell → no-op.
    s.setTool('place');
    s.setActiveState('minecraft:stone');
    s.tap(pick(0, 0, 0, 'up'));
    s.tap(pick(0, 1, 0, 'up'));
    s.setActiveState('minecraft:oak_door');
    const before = s.history.length;
    s.tap(pick(0, 0, 0, 'south')); // (0,0,1) free, (0,1,1) free → ok
    expect(s.history.length).toBe(before + 1);
    s.tap(pick(0, -1, 0, 'up')); // would go into (0,0,0) occupied
    expect(s.history.length).toBe(before + 1);
  });
});

describe('place tool: Java-like placement', () => {
  it('places torches on walls, on floors, never on ceilings', () => {
    const s = sessionWithFloor();
    s.setActiveState('minecraft:torch');
    s.tap(pick(2, 0, 0, 'east'));
    expect(s.doc.getBlock(3, 0, 0)).toBe(st('minecraft:wall_torch[facing=east]'));
    s.tap(pick(0, 0, 0, 'north'));
    expect(s.doc.getBlock(0, 0, -1)).toBe(st('minecraft:wall_torch[facing=north]'));
    s.tap(pick(1, 0, 0, 'up'));
    expect(s.doc.getBlock(1, 1, 0)).toBe(st('minecraft:torch'));
    s.tap(pick(0, 0, 0, 'down'));
    expect(s.doc.getBlock(0, -1, 0)).toBe(AIR);
    expect(s.history).toHaveLength(3);
  });

  it('uses the hit point for the half and the pitch for 3D blocks', () => {
    const s = sessionWithFloor();
    const events: string[] = [];
    s.subscribe((e) => events.push(e.kind));
    s.setActiveState('minecraft:oak_stairs');
    s.setLookHorizontal('west');
    s.tap({ pos: v(2, 0, 0), face: 'east', hit: { x: 1, y: 0.75, z: 0.5 } });
    expect(s.doc.getBlock(3, 0, 0)).toBe(st('minecraft:oak_stairs[facing=west,half=top]'));
    s.setLookVertical('down');
    s.setLookVertical('down');
    expect(s.lookVertical).toBe('down');
    expect(events.filter((k) => k === 'look')).toHaveLength(2);
    s.setActiveState('minecraft:piston');
    s.tap(pick(0, 0, 0, 'up'));
    expect(s.doc.getBlock(0, 1, 0)).toBe(st('minecraft:piston[facing=up]'));
    s.setActiveState('minecraft:observer');
    s.tap(pick(1, 0, 0, 'up'));
    expect(s.doc.getBlock(1, 1, 0)).toBe(st('minecraft:observer[facing=down]'));
    s.setLookVertical('level');
    s.tap(pick(2, 0, 0, 'up'));
    expect(s.doc.getBlock(2, 1, 0)).toBe(st('minecraft:observer[facing=west]'));
  });

  it('one undo step reverts the placed block and its neighbour updates', () => {
    const s = sessionWithFloor();
    s.setActiveState('minecraft:oak_fence');
    s.tap(pick(0, 0, 0, 'up'));
    s.tap(pick(1, 0, 0, 'up'));
    expect(s.doc.getBlock(0, 1, 0)).toBe(st('minecraft:oak_fence[east=true]'));
    expect(s.history).toHaveLength(2);
    s.undo();
    expect(s.doc.getBlock(0, 1, 0)).toBe(st('minecraft:oak_fence'));
    expect(s.doc.getBlock(1, 1, 0)).toBe(AIR);
    s.redo();
    expect(s.doc.getBlock(0, 1, 0)).toBe(st('minecraft:oak_fence[east=true]'));
  });
});

describe('remove tool', () => {
  it('keeps attachments when their support is removed (creative-like)', () => {
    const s = sessionWithFloor();
    s.setActiveState('minecraft:torch');
    s.tap(pick(2, 0, 0, 'east'));
    s.tap(pick(1, 0, 0, 'up'));
    s.setTool('remove');
    s.tap(pick(2, 0, 0));
    s.tap(pick(1, 0, 0));
    expect(s.doc.getBlock(3, 0, 0)).toBe(st('minecraft:wall_torch[facing=east]'));
    expect(s.doc.getBlock(1, 1, 0)).toBe(st('minecraft:torch'));
  });

  it('removes the picked block, ignores air and empty space', () => {
    const s = sessionWithFloor();
    s.setTool('remove');
    s.tap(pick(1, 0, 0));
    s.tap(pick(1, 0, 0));
    s.tap(null);
    expect(s.doc.getBlock(1, 0, 0)).toBe(AIR);
    expect(s.history).toEqual([{ label: 'editor.action.remove', origin: 'user' }]);
    s.undo();
    expect(s.doc.getBlock(1, 0, 0)).toBe(STONE);
  });

  it('removes both halves of a door', () => {
    const s = sessionWithFloor();
    s.setActiveState('minecraft:oak_door');
    s.tap(pick(0, 0, 0, 'up'));
    s.setTool('remove');
    s.tap(pick(0, 2, 0));
    expect(s.doc.getBlock(0, 1, 0)).toBe(AIR);
    expect(s.doc.getBlock(0, 2, 0)).toBe(AIR);
  });
});

describe('pick-block tool', () => {
  it('sets the active state from the picked block, ignoring air', () => {
    const s = sessionWithFloor();
    s.setActiveState('minecraft:dirt');
    s.setTool('pick-block');
    s.tap(pick(5, 5, 5));
    s.tap(null);
    expect(s.activeState).toBe(DIRT);
    s.tap(pick(0, 0, 0));
    expect(s.activeState).toBe(STONE);
    expect(s.canUndo).toBe(false);
  });
});

describe('select tool', () => {
  it('sets corner A, then B; next tap starts over; shift extends; empty tap clears', () => {
    const s = newSession();
    s.setTool('select');
    s.tap(pick(3, 0, 3));
    expect(s.selection).toEqual({ min: v(3, 0, 3), max: v(3, 0, 3) });
    s.tap(pick(1, 2, 5));
    expect(s.selection).toEqual({ min: v(1, 0, 3), max: v(3, 2, 5) });
    s.tap(pick(0, 4, 0), SHIFT);
    expect(s.selection).toEqual({ min: v(0, 0, 0), max: v(3, 4, 5) });
    s.tap(pick(9, 9, 9));
    expect(s.selection).toEqual({ min: v(9, 9, 9), max: v(9, 9, 9) });
    s.tap(null, SHIFT);
    expect(s.selection).not.toBeNull();
    s.tap(null);
    expect(s.selection).toBeNull();
  });
});

describe('fill and replace tools', () => {
  it('fill applies the active block to the selection; no selection = no-op', () => {
    const s = newSession('minecraft:dirt');
    s.setTool('fill');
    s.tap(null);
    expect(s.canUndo).toBe(false);
    s.setSelection({ min: v(0, 0, 0), max: v(1, 1, 1) });
    s.tap(null);
    expect(s.history).toEqual([{ label: 'editor.action.fill', origin: 'user' }]);
    expect(s.doc.getBlock(1, 1, 1)).toBe(DIRT);
  });

  it('replace swaps the tapped state inside the selection only', () => {
    const s = sessionWithFloor();
    s.setActiveState('minecraft:dirt');
    s.setSelection({ min: v(1, 0, 0), max: v(5, 0, 0) });
    s.setTool('replace');
    s.tap(pick(0, 0, 0));
    expect(s.doc.getBlock(0, 0, 0)).toBe(STONE);
    expect(s.doc.getBlock(1, 0, 0)).toBe(DIRT);
    expect(s.doc.getBlock(2, 0, 0)).toBe(DIRT);
    expect(s.doc.getBlock(3, 0, 0)).toBe(AIR);
    expect(s.history.at(-1)?.label).toBe('editor.action.replace');
  });

  it('throws a typed error above the volume limit and leaves the document untouched', () => {
    const s = newSession();
    s.setSelection({ min: v(0, 0, 0), max: v(64, 64, 64) });
    s.setTool('fill');
    expect(() => s.tap(null)).toThrow(EditVolumeError);
    expect(s.canUndo).toBe(false);
    expect(s.doc.getBlock(0, 0, 0)).toBe(AIR);
  });
});

describe('paste tool', () => {
  it('previews on tap, moves with further taps, commits on repeated tap', () => {
    const s = sessionWithFloor();
    s.setSelection({ min: v(0, 0, 0), max: v(1, 0, 0) });
    s.copySelection();
    s.setTool('paste');
    s.tap(pick(0, 0, 0, 'up'));
    expect(s.preview).toEqual([
      { pos: v(0, 1, 0), state: STONE },
      { pos: v(1, 1, 0), state: STONE },
    ]);
    expect(s.pastePosition).toEqual(v(0, 1, 0));
    s.tap(pick(0, 0, 0, 'south'));
    expect(s.preview[0]?.pos).toEqual(v(0, 0, 1));
    expect(s.canUndo).toBe(false);
    s.tap(pick(0, 0, 0, 'south'));
    expect(s.preview).toEqual([]);
    expect(s.doc.getBlock(1, 0, 1)).toBe(STONE);
    expect(s.history).toEqual([{ label: 'editor.action.paste', origin: 'user' }]);
  });

  it('confirmPaste commits; switching tool cancels the preview', () => {
    const s = sessionWithFloor();
    s.setSelection({ min: v(0, 0, 0), max: v(0, 0, 0) });
    s.copySelection();
    s.setTool('paste');
    expect(s.confirmPaste()).toBe(false);
    s.tap(pick(0, 0, 0, 'up'));
    expect(s.confirmPaste()).toBe(true);
    expect(s.doc.getBlock(0, 1, 0)).toBe(STONE);
    s.tap(pick(0, 1, 0, 'up'));
    expect(s.preview).toHaveLength(1);
    s.setTool('place');
    expect(s.preview).toEqual([]);
    expect(s.pastePosition).toBeNull();
  });

  it('does nothing without a clipboard', () => {
    const s = sessionWithFloor();
    s.setTool('paste');
    s.tap(pick(0, 0, 0));
    expect(s.preview).toEqual([]);
  });
});

describe('hover preview', () => {
  it('previews exactly what a place tap commits, and the target for remove', () => {
    const registry = createJavaBlockRegistry();
    const doc = new HoverDoc({
      name: 't',
      edition: 'java',
      dataVersion: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    doc.setBlock({ x: 0, y: 0, z: 0 }, 'minecraft:stone' as never);
    const session = new EditorSession({
      doc,
      registry,
      activeState: 'minecraft:oak_stairs',
    });
    session.setLookHorizontal('east');
    const pick = { pos: { x: 0, y: 0, z: 0 }, face: 'up' as const };
    const preview = session.hoverPreview(pick);
    expect(preview?.kind).toBe('place');
    expect(doc.volume.blockCount).toBe(1); // preview never mutates
    session.tap(pick);
    const placed = doc.getBlock(0, 1, 0);
    expect(preview && preview.kind === 'place' ? preview.blocks[0]?.state : null).toBe(placed);
    expect(session.hoverPreview(pick)).toBeNull(); // target cell now occupied
    expect(session.hoverPreview(null)).toBeNull();
    session.setTool('remove');
    expect(session.hoverPreview(pick)).toEqual({
      kind: 'remove',
      positions: [{ x: 0, y: 0, z: 0 }],
    });
  });
});
