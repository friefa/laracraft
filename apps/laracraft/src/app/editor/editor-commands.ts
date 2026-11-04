/** Every user action of the editor screen (buttons and keyboard shortcuts). */
export type EditorCommand =
  | { readonly kind: 'tool'; readonly tool: 'place' | 'remove' | 'pick-block' | 'select' }
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' }
  | { readonly kind: 'fill' }
  | { readonly kind: 'replace' }
  | { readonly kind: 'rotate'; readonly turns: 1 | 3 }
  | { readonly kind: 'mirror'; readonly axis: 'x' | 'z' }
  | { readonly kind: 'copy' }
  | { readonly kind: 'cut' }
  | { readonly kind: 'delete' }
  | { readonly kind: 'paste' }
  | { readonly kind: 'confirmPaste' }
  | { readonly kind: 'frame' }
  | { readonly kind: 'cancel' };

/** The parts of a `KeyboardEvent` the shortcuts look at. */
export interface KeyInput {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

const TOOL_KEYS = {
  '1': 'place',
  '2': 'remove',
  '3': 'pick-block',
  '4': 'select',
} as const;

/**
 * Desktop shortcuts: 1–4 tools, Ctrl/Cmd+Z undo, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z
 * redo, Ctrl/Cmd+C/X/V copy/cut/paste, Delete/Backspace delete selection,
 * R/Shift+R rotate ±90°, M/Shift+M mirror X/Z, F frame, Enter confirm paste,
 * Esc cancel. Returns null for any other key.
 */
export function shortcutFor(e: KeyInput): EditorCommand | null {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.altKey) return null;
  if (e.ctrlKey || e.metaKey) {
    switch (key) {
      case 'z':
        return { kind: e.shiftKey ? 'redo' : 'undo' };
      case 'y':
        return { kind: 'redo' };
      case 'c':
        return { kind: 'copy' };
      case 'x':
        return { kind: 'cut' };
      case 'v':
        return { kind: 'paste' };
      default:
        return null;
    }
  }
  if (key in TOOL_KEYS && !e.shiftKey) {
    return { kind: 'tool', tool: TOOL_KEYS[key as keyof typeof TOOL_KEYS] };
  }
  switch (key) {
    case 'Delete':
    case 'Backspace':
      return { kind: 'delete' };
    case 'r':
      return { kind: 'rotate', turns: e.shiftKey ? 3 : 1 };
    case 'm':
      return { kind: 'mirror', axis: e.shiftKey ? 'z' : 'x' };
    case 'f':
      return e.shiftKey ? null : { kind: 'frame' };
    case 'Enter':
      return { kind: 'confirmPaste' };
    case 'Escape':
      return { kind: 'cancel' };
    default:
      return null;
  }
}

/** True when keystrokes belong to a form control rather than to the editor. */
export function isTextInput(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).tagName !== 'string') return false;
  const el = target as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select' || el.isContentEditable) return true;
  if (tag !== 'input') return false;
  const type = (el as HTMLInputElement).type;
  return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset'].includes(type);
}
