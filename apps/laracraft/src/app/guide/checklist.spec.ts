import { checklistKey, loadChecklist, saveChecklist } from './checklist';

describe('materials checklist persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips the ticked items per build', () => {
    saveChecklist(localStorage, 'b1', new Set(['minecraft:stone', 'minecraft:dirt']));
    saveChecklist(localStorage, 'b2', new Set(['minecraft:sand']));
    expect([...loadChecklist(localStorage, 'b1')].sort()).toEqual([
      'minecraft:dirt',
      'minecraft:stone',
    ]);
    expect([...loadChecklist(localStorage, 'b2')]).toEqual(['minecraft:sand']);
  });

  it('removes the entry when nothing is ticked', () => {
    saveChecklist(localStorage, 'b1', new Set(['minecraft:stone']));
    saveChecklist(localStorage, 'b1', new Set());
    expect(localStorage.getItem(checklistKey('b1'))).toBeNull();
  });

  it('ignores corrupt data and missing storage', () => {
    localStorage.setItem(checklistKey('b1'), '{not json');
    expect(loadChecklist(localStorage, 'b1').size).toBe(0);
    localStorage.setItem(checklistKey('b1'), JSON.stringify(['minecraft:stone', 7, null]));
    expect([...loadChecklist(localStorage, 'b1')]).toEqual(['minecraft:stone']);
    expect(loadChecklist(undefined, 'b1').size).toBe(0);
    expect(() => saveChecklist(undefined, 'b1', new Set(['x']))).not.toThrow();
  });

  it('never throws when the storage does', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    } as unknown as Storage;
    expect(loadChecklist(broken, 'b1').size).toBe(0);
    expect(() => saveChecklist(broken, 'b1', new Set(['x']))).not.toThrow();
    expect(() => saveChecklist(broken, 'b1', new Set())).not.toThrow();
  });
});
