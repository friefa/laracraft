import type { ChatMessage, LaraErrorCode, Usage } from '@laracraft/lara-agent';

/** DSL operations with their own chip label (`lara.op.<name>`); others use `lara.op.other`. */
const KNOWN_OPS = new Set([
  'fill',
  'hollowBox',
  'line',
  'wall',
  'floor',
  'roof',
  'placeBlock',
  'replace',
  'clear',
  'mirror',
  'rotate',
  'copy',
  'insertModule',
]);

export function opLabelKey(op: string): string {
  return `lara.op.${KNOWN_OPS.has(op) ? op : 'other'}`;
}

export function blocksKey(count: number): string {
  return count === 1 ? 'lara.chip.block' : 'lara.chip.blocks';
}

/** Translation key for an agent error (`lara.error.*`). */
export function errorKey(code: LaraErrorCode): string {
  return `lara.error.${code === 'not-configured' ? 'notConfigured' : code === 'rate-limit' ? 'rateLimit' : code}`;
}

/** Errors the user fixes in the settings (show a settings button instead of only retry). */
export function needsSettings(code: LaraErrorCode): boolean {
  return code === 'auth' || code === 'not-configured' || code === 'limit';
}

export function totalTokens(usage: Usage): number {
  return usage.inputTokens + usage.outputTokens;
}

/** Conversation for a new agent session: failed turns are left out. */
export function historyForSession(messages: readonly ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === 'lara' && m.error) {
      // Drop the error and the user message it answered.
      if (out.at(-1)?.role === 'user') out.pop();
      continue;
    }
    out.push(m);
  }
  return out;
}

/** The text of the user message a failed Lara turn answered (for "retry"). */
export function retryText(messages: readonly ChatMessage[], errorId: string): string | null {
  const i = messages.findIndex((m) => m.id === errorId);
  const prev = i > 0 ? messages[i - 1] : undefined;
  return prev?.role === 'user' ? prev.text : null;
}

export function newMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
