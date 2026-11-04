import { AIR } from '@laracraft/core-model';
import { DIRT, FIXTURE_METADATA, FIXTURE_PLAN, SAND, STAIRS, STONE } from './fixture-plan.testing';
import { StepDocument, stepChangeSet } from './step-document';

describe('StepDocument', () => {
  const at = (s: StepDocument, x: number, y: number, z: number) => s.doc.getBlock(x, y, z);

  it('starts empty and does not touch the build metadata object', () => {
    const s = new StepDocument(FIXTURE_PLAN, FIXTURE_METADATA);
    expect(s.current).toBe(-1);
    expect(s.doc.volume.blockCount).toBe(0);
    expect(s.doc.metadata).not.toBe(FIXTURE_METADATA);
  });

  it('applies steps forward incl. temporary blocks and removals', () => {
    const s = new StepDocument(FIXTURE_PLAN, FIXTURE_METADATA);
    s.goTo(0);
    expect(at(s, 0, 0, 0)).toBe(STONE);
    expect(at(s, 2, 0, 0)).toBe(DIRT);
    expect(at(s, 2, 1, 0)).toBe(AIR);
    expect(s.doc.volume.blockCount).toBe(3);

    s.goTo(1);
    expect(at(s, 2, 1, 0)).toBe(SAND);
    expect(at(s, 0, 1, 0)).toBe(STAIRS);
    expect(s.doc.volume.blockCount).toBe(7);

    s.goTo(2);
    expect(at(s, 2, 0, 0)).toBe(AIR);
    expect(at(s, 2, 1, 0)).toBe(SAND);
    expect(s.doc.volume.blockCount).toBe(6);
    expect(s.current).toBe(2);
  });

  it('steps backward and restores removed temporary blocks', () => {
    const s = new StepDocument(FIXTURE_PLAN, FIXTURE_METADATA);
    s.goTo(2);
    s.goTo(1);
    expect(at(s, 2, 0, 0)).toBe(DIRT);
    expect(at(s, 2, 1, 0)).toBe(SAND);
    s.goTo(0);
    expect(at(s, 2, 1, 0)).toBe(AIR);
    expect(at(s, 0, 1, 0)).toBe(AIR);
    expect(at(s, 2, 0, 0)).toBe(DIRT);
    expect(s.doc.volume.blockCount).toBe(3);
    s.goTo(-1);
    expect(s.doc.volume.blockCount).toBe(0);
  });

  it('jumps across several steps and clamps out-of-range targets', () => {
    const s = new StepDocument(FIXTURE_PLAN, FIXTURE_METADATA);
    s.goTo(99);
    expect(s.current).toBe(2);
    expect(s.doc.volume.blockCount).toBe(6);
    s.goTo(0);
    expect(s.doc.volume.blockCount).toBe(3);
    s.goTo(-5);
    expect(s.current).toBe(-1);
  });

  it('marks changed chunks dirty so the renderer can remesh', () => {
    const s = new StepDocument(FIXTURE_PLAN, FIXTURE_METADATA);
    s.goTo(0);
    s.doc.volume.takeDirtyChunks();
    s.goTo(1);
    expect([...s.doc.volume.takeDirtyChunks()].length).toBeGreaterThan(0);
  });

  it('builds a forward change set from the step actions', () => {
    const cs = stepChangeSet(FIXTURE_PLAN.steps[2] as (typeof FIXTURE_PLAN.steps)[number]);
    expect(cs.changes).toEqual([{ pos: { x: 2, y: 0, z: 0 }, before: AIR, after: AIR }]);
  });
});
