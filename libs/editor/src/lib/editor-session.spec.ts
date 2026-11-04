import { AIR, type Vec3 } from '@laracraft/core-model';
import { newDoc, newSession, registry, st } from '../testing/fixtures';
import { EditorSession, type EditorEvent, InvalidBlockStateError } from './editor-session';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const STONE = st('minecraft:stone');

describe('EditorSession', () => {
  it('validates and canonicalizes the active state', () => {
    const s = newSession('oak_log');
    expect(s.activeState).toBe(st('minecraft:oak_log[axis=y]'));
    expect(() => s.setActiveState('minecraft:nope')).toThrow(InvalidBlockStateError);
    expect(() => new EditorSession({ doc: newDoc(), registry, activeState: 'x:[' })).toThrow(
      InvalidBlockStateError,
    );
  });

  it('commits, undoes and redoes with events', () => {
    const s = newSession();
    const events: EditorEvent[] = [];
    const off = s.subscribe((e) => events.push(e));
    const applied = s.commit({
      changes: [{ pos: v(0, 0, 0), before: AIR, after: STONE }],
      origin: 'lara',
      label: 'Turm',
    });
    expect(applied.changes).toHaveLength(1);
    expect(events.map((e) => e.kind)).toEqual(['document', 'history']);
    expect(s.history).toEqual([{ label: 'Turm', origin: 'lara' }]);

    // No-op commits create no undo step and no events.
    s.commit({ changes: [{ pos: v(0, 0, 0), before: AIR, after: STONE }], origin: 'user' });
    expect(s.history).toHaveLength(1);
    expect(events).toHaveLength(2);

    s.undo();
    expect(s.doc.getBlock(0, 0, 0)).toBe(AIR);
    expect(events.at(-2)).toMatchObject({ kind: 'document', cause: 'undo' });
    s.redo();
    expect(s.doc.getBlock(0, 0, 0)).toBe(STONE);
    expect(events.at(-2)).toMatchObject({ kind: 'document', cause: 'redo' });
    expect(s.undo()).toBeDefined();
    expect(s.undo()).toBeUndefined();

    off();
    s.setSelection({ min: v(0, 0, 0), max: v(0, 0, 0) });
    expect(events.at(-1)?.kind).toBe('history');
  });

  it('respects the configured undo depth', () => {
    const s = new EditorSession({ doc: newDoc(), registry, maxUndoDepth: 2 });
    for (let x = 0; x < 4; x++) {
      s.commit({ changes: [{ pos: v(x, 0, 0), before: AIR, after: STONE }], origin: 'user' });
    }
    expect(s.history).toHaveLength(2);
  });

  it('normalizes selections and runs selection actions', () => {
    const s = newSession();
    expect(s.fillSelection()).toBeUndefined();
    s.setSelection({ min: v(2, 0, 1), max: v(0, 0, 0) });
    expect(s.selection).toEqual({ min: v(0, 0, 0), max: v(2, 0, 1) });
    s.fillSelection();
    expect(s.doc.getBlock(2, 0, 1)).toBe(STONE);

    s.replaceInSelection(STONE, st('minecraft:dirt'));
    expect(s.doc.getBlock(1, 0, 1)).toBe(st('minecraft:dirt'));

    // Rotation of a non-square box: selection follows.
    s.rotateSelection(1);
    expect(s.selection).toEqual({ min: v(0, 0, 0), max: v(1, 0, 2) });
    expect(s.history.at(-1)?.label).toBe('editor.action.rotate');

    // Mirroring uniform content is a no-op (no undo step).
    const steps = s.history.length;
    expect(s.mirrorSelection('x')?.changes).toEqual([]);
    expect(s.history).toHaveLength(steps);
    s.commit({
      changes: [{ pos: v(0, 0, 0), before: st('minecraft:dirt'), after: STONE }],
      origin: 'user',
    });
    s.mirrorSelection('x');
    expect(s.history.at(-1)?.label).toBe('editor.action.mirror');
    expect(s.doc.getBlock(1, 0, 0)).toBe(STONE);

    const clip = s.cutSelection();
    expect(clip?.label).toBe('editor.action.cut');
    expect(s.clipboard?.blocks).toHaveLength(6);
    expect(s.doc.getBlock(0, 0, 0)).toBe(AIR);
    s.undo();
    s.deleteSelection();
    expect(s.history.at(-1)?.label).toBe('editor.action.delete');
  });

  it('undo after rotate restores the original layout', () => {
    const s = newSession();
    s.commit({
      changes: [
        { pos: v(0, 0, 0), before: AIR, after: STONE },
        { pos: v(2, 0, 0), before: AIR, after: st('minecraft:oak_stairs[facing=east]') },
      ],
      origin: 'user',
    });
    s.setSelection({ min: v(0, 0, 0), max: v(2, 0, 0) });
    s.rotateSelection(1);
    expect(s.doc.getBlock(0, 0, 2)).toBe(st('minecraft:oak_stairs[facing=south]'));
    expect(s.doc.getBlock(2, 0, 0)).toBe(AIR);
    s.undo();
    expect(s.doc.getBlock(2, 0, 0)).toBe(st('minecraft:oak_stairs[facing=east]'));
    expect(s.doc.getBlock(0, 0, 2)).toBe(AIR);
  });

  it('cancels the old tool when switching', () => {
    const s = newSession();
    const kinds: string[] = [];
    s.subscribe((e) => kinds.push(e.kind));
    s.setTool('select');
    s.setTool('select');
    expect(kinds).toEqual(['tool']);
    expect(s.toolId).toBe('select');
    expect(s.tool.id).toBe('select');
  });
});
