import { blockIdOf } from './block-tile';
import { HINT_STYLE, PHASE_TONE, lessonProgress } from './lesson-style';

describe('lesson style', () => {
  it('colours the phases as in docs/DESIGN.md', () => {
    expect(PHASE_TONE).toEqual({
      structure: 'green',
      redstone: 'orange',
      power: 'yellow',
      fluids: 'blue',
      cleanup: 'grey',
    });
  });

  it('shows circuit hints orange and fluid hints blue', () => {
    expect(HINT_STYLE['keep-circuit-open'].tone).toBe('orange');
    expect(HINT_STYLE['fluids-last']).toEqual({ tone: 'blue', icon: 'drop' });
  });

  it('computes the lesson progress as current step / total', () => {
    expect(lessonProgress(0, 4)).toBe(0.25);
    expect(lessonProgress(3, 4)).toBe(1);
    expect(lessonProgress(1, 4, true)).toBe(1);
    expect(lessonProgress(9, 4)).toBe(1);
    expect(lessonProgress(0, 0)).toBe(0);
  });

  it('derives block ids for the material tiles', () => {
    expect(blockIdOf('minecraft:oak_stairs[facing=north]')).toBe('minecraft:oak_stairs');
    expect(blockIdOf('stone')).toBe('minecraft:stone');
  });
});
