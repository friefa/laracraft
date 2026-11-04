import { groupActions } from './action-groups';
import { DIRT, FIXTURE_PLAN, SAND, STONE } from './fixture-plan.testing';
import { GUIDE_COLORS, stepVisuals } from './step-visuals';

const opts = { showNext: false, layerOnly: false };

describe('stepVisuals', () => {
  it('fills the current step placements', () => {
    const v = stepVisuals(FIXTURE_PLAN, 0, opts);
    expect(v.highlights).toEqual([
      {
        id: 'current',
        positions: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 2, y: 0, z: 0 },
        ],
        color: GUIDE_COLORS.current,
        style: 'fill',
      },
    ]);
    expect(v.ghosts).toEqual([]);
    expect(v.layerLimit).toBeNull();
  });

  it('shows the next step as ghosts when enabled', () => {
    const v = stepVisuals(FIXTURE_PLAN, 0, { ...opts, showNext: true });
    expect(v.ghosts).toHaveLength(4);
    expect(v.ghosts[0]).toEqual({ pos: { x: 2, y: 1, z: 0 }, state: SAND });
  });

  it('marks removals red and keeps a ghost of the removed block', () => {
    const v = stepVisuals(FIXTURE_PLAN, 2, { ...opts, showNext: true });
    const removal = v.highlights.find((h) => h.id === 'removal');
    expect(removal?.color).toBe(GUIDE_COLORS.removal);
    expect(removal?.positions).toEqual([{ x: 2, y: 0, z: 0 }]);
    expect(v.ghosts).toEqual([{ pos: { x: 2, y: 0, z: 0 }, state: DIRT }]);
  });

  it('limits the layer to the step maximum Y', () => {
    expect(stepVisuals(FIXTURE_PLAN, 1, { ...opts, layerOnly: true }).layerLimit).toBe(2);
  });

  it('adds markers for the selected action, its stand position and clicked block', () => {
    const action = FIXTURE_PLAN.steps[0]?.actions[1];
    const v = stepVisuals(FIXTURE_PLAN, 0, { ...opts, selected: action });
    const ids = v.highlights.map((h) => h.id);
    expect(ids).toEqual(['current', 'selected', 'stand', 'click-target']);
    expect(v.highlights[2]?.positions).toEqual([
      { x: 1, y: 0, z: 2 },
      { x: 1, y: 1, z: 2 },
    ]);
    expect(v.highlights[3]?.positions).toEqual([{ x: 1, y: -1, z: 0 }]);
  });

  it('highlights hint positions and handles out-of-range steps', () => {
    const v = stepVisuals(FIXTURE_PLAN, 1, { ...opts, hintPositions: [{ x: 1, y: 1, z: 0 }] });
    expect(v.highlights.at(-1)?.id).toBe('hint');
    expect(stepVisuals(FIXTURE_PLAN, 9, opts)).toEqual({
      highlights: [],
      ghosts: [],
      layerLimit: null,
    });
  });
});

describe('groupActions', () => {
  it('groups consecutive actions with the same state', () => {
    const groups = groupActions(FIXTURE_PLAN.steps[0]?.actions ?? []);
    expect(groups.map((g) => [g.state, g.indices, g.temporary])).toEqual([
      [STONE, [0, 1], false],
      [DIRT, [2], true],
    ]);
  });
});
