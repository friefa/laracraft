import { type KeyInput, isTextInput, shortcutFor } from './editor-commands';

const k = (key: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('shortcutFor', () => {
  it('maps 1–4 to the tools', () => {
    expect(shortcutFor(k('1'))).toEqual({ kind: 'tool', tool: 'place' });
    expect(shortcutFor(k('2'))).toEqual({ kind: 'tool', tool: 'remove' });
    expect(shortcutFor(k('3'))).toEqual({ kind: 'tool', tool: 'pick-block' });
    expect(shortcutFor(k('4'))).toEqual({ kind: 'tool', tool: 'select' });
    expect(shortcutFor(k('5'))).toBeNull();
  });

  it('maps undo/redo for Ctrl and Cmd', () => {
    expect(shortcutFor(k('z', { ctrlKey: true }))).toEqual({ kind: 'undo' });
    expect(shortcutFor(k('Z', { metaKey: true, shiftKey: true }))).toEqual({ kind: 'redo' });
    expect(shortcutFor(k('y', { ctrlKey: true }))).toEqual({ kind: 'redo' });
    expect(shortcutFor(k('z'))).toBeNull();
  });

  it('maps clipboard and selection keys', () => {
    expect(shortcutFor(k('c', { ctrlKey: true }))).toEqual({ kind: 'copy' });
    expect(shortcutFor(k('x', { metaKey: true }))).toEqual({ kind: 'cut' });
    expect(shortcutFor(k('v', { ctrlKey: true }))).toEqual({ kind: 'paste' });
    expect(shortcutFor(k('Delete'))).toEqual({ kind: 'delete' });
    expect(shortcutFor(k('Backspace'))).toEqual({ kind: 'delete' });
    expect(shortcutFor(k('r'))).toEqual({ kind: 'rotate', turns: 1 });
    expect(shortcutFor(k('R', { shiftKey: true }))).toEqual({ kind: 'rotate', turns: 3 });
    expect(shortcutFor(k('m'))).toEqual({ kind: 'mirror', axis: 'x' });
    expect(shortcutFor(k('M', { shiftKey: true }))).toEqual({ kind: 'mirror', axis: 'z' });
  });

  it('maps camera, confirm and cancel', () => {
    expect(shortcutFor(k('f'))).toEqual({ kind: 'frame' });
    expect(shortcutFor(k('Enter'))).toEqual({ kind: 'confirmPaste' });
    expect(shortcutFor(k('Escape'))).toEqual({ kind: 'cancel' });
  });

  it('leaves browser shortcuts and Alt combinations alone', () => {
    expect(shortcutFor(k('r', { ctrlKey: true }))).toBeNull();
    expect(shortcutFor(k('1', { altKey: true }))).toBeNull();
  });
});

describe('isTextInput', () => {
  it('detects text fields but not buttons or sliders', () => {
    const make = (html: string) => {
      const div = document.createElement('div');
      div.innerHTML = html;
      return div.firstElementChild;
    };
    expect(isTextInput(make('<input type="search">'))).toBe(true);
    expect(isTextInput(make('<textarea></textarea>'))).toBe(true);
    expect(isTextInput(make('<input type="range">'))).toBe(false);
    expect(isTextInput(make('<button></button>'))).toBe(false);
    expect(isTextInput(null)).toBe(false);
  });
});
