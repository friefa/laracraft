import {
  type BlockStateString,
  BuildDocument,
  createJavaBlockRegistry,
  resolveBlockState,
} from '@laracraft/core-model';
import { EditorSession } from '../lib/editor-session';

/** Test helpers (not exported from the package). */
export const registry = createJavaBlockRegistry();

export function st(input: string): BlockStateString {
  const r = resolveBlockState(registry, input);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

export function newDoc(): BuildDocument {
  return new BuildDocument({
    name: 'test',
    dataVersion: 4189,
    edition: 'java',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  });
}

export function newSession(activeState = 'minecraft:stone'): EditorSession {
  return new EditorSession({ doc: newDoc(), registry, activeState });
}
