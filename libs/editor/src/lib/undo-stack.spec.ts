import {
  AIR,
  type BlockStateString,
  BuildDocument,
  type ChangeSet,
  type Vec3,
} from '@laracraft/core-model';
import { ChangeSetUndoStack } from './undo-stack';

const META = {
  name: 'test',
  dataVersion: 4189,
  edition: 'java' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};
const STONE = 'minecraft:stone' as BlockStateString;
const DIRT = 'minecraft:dirt' as BlockStateString;
const GLASS = 'minecraft:glass' as BlockStateString;
const p = (x: number, y = 0, z = 0): Vec3 => ({ x, y, z });

function edit(
  doc: BuildDocument,
  stack: ChangeSetUndoStack,
  blocks: [Vec3, BlockStateString][],
  label?: string,
) {
  const cs: ChangeSet = {
    changes: blocks.map(([pos, after]) => ({ pos, before: AIR, after })),
    origin: 'user',
    ...(label ? { label } : {}),
  };
  stack.push(doc.apply(cs));
}

const snapshot = (doc: BuildDocument, n = 5) =>
  Array.from({ length: n }, (_, x) => doc.getBlock(x, 0, 0));

describe('ChangeSetUndoStack', () => {
  let doc: BuildDocument;
  let stack: ChangeSetUndoStack;
  beforeEach(() => {
    doc = new BuildDocument({ ...META });
    stack = new ChangeSetUndoStack();
  });

  it('undoes and redoes', () => {
    expect(stack.canUndo).toBe(false);
    edit(doc, stack, [[p(0), STONE]], 'editor.action.place');
    expect(stack.canUndo).toBe(true);
    expect(stack.undo(doc)?.label).toBe('editor.action.place');
    expect(doc.getBlock(0, 0, 0)).toBe(AIR);
    expect(stack.canRedo).toBe(true);
    expect(stack.redo(doc)?.label).toBe('editor.action.place');
    expect(doc.getBlock(0, 0, 0)).toBe(STONE);
    expect(stack.undo(doc)).toBeDefined();
    expect(stack.undo(doc)).toBeUndefined();
    expect(stack.redo(doc)).toBeDefined();
    expect(stack.redo(doc)).toBeUndefined();
  });

  it('restores overlapping edits step by step', () => {
    const states: BlockStateString[][] = [snapshot(doc)];
    edit(doc, stack, [
      [p(0), STONE],
      [p(1), STONE],
    ]);
    states.push(snapshot(doc));
    edit(doc, stack, [
      [p(1), DIRT],
      [p(2), DIRT],
    ]);
    states.push(snapshot(doc));
    // Same cell twice within one change set: undo must restore the very first state.
    edit(doc, stack, [
      [p(2), GLASS],
      [p(2), STONE],
      [p(0), GLASS],
    ]);
    states.push(snapshot(doc));
    expect(snapshot(doc)).toEqual([GLASS, DIRT, STONE, AIR, AIR]);

    for (let i = states.length - 2; i >= 0; i--) {
      stack.undo(doc);
      expect(snapshot(doc)).toEqual(states[i]);
    }
    for (let i = 1; i < states.length; i++) {
      stack.redo(doc);
      expect(snapshot(doc)).toEqual(states[i]);
    }
  });

  it('drops the redo branch on push and ignores empty change sets', () => {
    edit(doc, stack, [[p(0), STONE]]);
    stack.undo(doc);
    stack.push({ changes: [], origin: 'user' });
    expect(stack.canRedo).toBe(true);
    edit(doc, stack, [[p(1), DIRT]]);
    expect(stack.canRedo).toBe(false);
    expect(stack.history).toHaveLength(1);
  });

  it('enforces the depth limit by dropping the oldest steps', () => {
    stack = new ChangeSetUndoStack(3);
    for (let x = 0; x < 5; x++) edit(doc, stack, [[p(x), STONE]], `step${x}`);
    expect(stack.history.map((h) => h.label)).toEqual(['step2', 'step3', 'step4']);
    expect(stack.undo(doc)).toBeDefined();
    expect(stack.undo(doc)).toBeDefined();
    expect(stack.undo(doc)).toBeDefined();
    expect(stack.canUndo).toBe(false);
    // The two oldest edits are no longer undoable.
    expect(snapshot(doc)).toEqual([STONE, STONE, AIR, AIR, AIR]);
    expect(() => new ChangeSetUndoStack(0)).toThrow(RangeError);
  });

  it('keeps history labels and origins, newest last; clear empties both stacks', () => {
    edit(doc, stack, [[p(0), STONE]], 'a');
    stack.push(doc.apply({ changes: [{ pos: p(1), before: AIR, after: DIRT }], origin: 'lara' }));
    expect(stack.history).toEqual([{ label: 'a', origin: 'user' }, { origin: 'lara' }]);
    stack.undo(doc);
    expect(stack.history).toEqual([{ label: 'a', origin: 'user' }]);
    stack.clear();
    expect(stack.canUndo || stack.canRedo).toBe(false);
  });
});
