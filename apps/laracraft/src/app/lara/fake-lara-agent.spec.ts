import { BuildDocument, createJavaBlockRegistry, invertChangeSet } from '@laracraft/core-model';
import type { ChatMessage, LaraEvent, ProviderConfig } from '@laracraft/lara-agent';
import { createFakeLaraAgent } from './fake-lara-agent';
import {
  blocksKey,
  errorKey,
  historyForSession,
  needsSettings,
  opLabelKey,
  retryText,
} from './chat-model';

const registry = createJavaBlockRegistry();
const provider: ProviderConfig = {
  kind: 'anthropic',
  model: 'claude-opus-5-5',
  apiKey: 'sk-test-key',
};

function newDoc() {
  return new BuildDocument({
    name: 'Haus',
    edition: 'java',
    dataVersion: 4189,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  });
}

describe('fake Lara agent', () => {
  it('streams text, applies real operations live and ends with one merged change set', async () => {
    const doc = newDoc();
    const session = createFakeLaraAgent({ delayMs: 0 }).createSession(provider, {
      doc,
      registry,
      edition: 'java',
      language: 'de',
    });
    const events: LaraEvent[] = [];
    await session.send('Bau eine Mauer', (e) => events.push(e));
    const ops = events.filter((e) => e.type === 'operation');
    expect(ops.map((e) => e.type === 'operation' && [e.op, e.changed])).toEqual([
      ['wall', 48],
      ['line', 12],
    ]);
    expect(doc.volume.blockCount).toBe(60);
    const end = events.at(-1);
    expect(end?.type).toBe('turn-end');
    if (end?.type !== 'turn-end') return;
    expect(end.changeSet.changes).toHaveLength(60);
    expect(end.message.text).toContain('**Mauer**');
    expect(session.history).toHaveLength(2);
    // Undoing the merged change set restores the original document.
    doc.apply(invertChangeSet(end.changeSet));
    expect(doc.volume.blockCount).toBe(0);
  });

  it('reverts partial changes when cancelled or failing', async () => {
    const doc = newDoc();
    const agent = createFakeLaraAgent({ delayMs: 1 });
    const session = agent.createSession(provider, {
      doc,
      registry,
      edition: 'java',
      language: 'en',
    });
    const abort = new AbortController();
    const events: LaraEvent[] = [];
    await session.send(
      'wall',
      (e) => {
        events.push(e);
        if (e.type === 'operation') abort.abort();
      },
      { signal: abort.signal },
    );
    expect(events.at(-1)).toMatchObject({ type: 'error', error: { code: 'cancelled' } });
    expect(doc.volume.blockCount).toBe(0);

    const failed: LaraEvent[] = [];
    await session.send('/error please', (e) => failed.push(e));
    expect(failed.at(-1)).toMatchObject({ type: 'error', error: { code: 'network' } });
    expect(doc.volume.blockCount).toBe(0);
  });

  it('checks the key in testProvider and honours the daily limit', async () => {
    const usageStore = { usedToday: () => 5000, add: vi.fn(), dailyLimit: () => 1000 };
    const agent = createFakeLaraAgent({ delayMs: 0, usageStore });
    expect(await agent.testProvider(provider)).toEqual({ ok: true, model: 'claude-opus-5-5' });
    expect(await agent.testProvider({ ...provider, apiKey: 'invalid' })).toMatchObject({
      ok: false,
      error: { code: 'auth' },
    });
    const events: LaraEvent[] = [];
    await agent
      .createSession(provider, { doc: newDoc(), registry, edition: 'java', language: 'de' })
      .send('hi', (e) => events.push(e));
    expect(events.at(-1)).toMatchObject({ type: 'error', error: { code: 'limit' } });
  });
});

describe('chat model helpers', () => {
  const u = (id: string, text = 'hi'): ChatMessage => ({ role: 'user', id, text, at: '' });
  const l = (id: string, error = false): ChatMessage => ({
    role: 'lara',
    id,
    text: '',
    at: '',
    operations: [],
    ...(error ? { error: { code: 'network' as const, message: 'x' } } : {}),
  });

  it('maps keys', () => {
    expect(opLabelKey('wall')).toBe('lara.op.wall');
    expect(opLabelKey('teleport')).toBe('lara.op.other');
    expect(blocksKey(1)).toBe('lara.chip.block');
    expect(blocksKey(48)).toBe('lara.chip.blocks');
    expect(errorKey('rate-limit')).toBe('lara.errors.rateLimit');
    expect(errorKey('not-configured')).toBe('lara.errors.notConfigured');
    expect(errorKey('turn-limit')).toBe('lara.errors.turnLimit');
    expect(needsSettings('auth')).toBe(true);
    expect(needsSettings('network')).toBe(false);
  });

  it('drops failed exchanges from the session history and finds retry text', () => {
    const msgs = [u('1'), l('2'), u('3', 'again'), l('4', true)];
    expect(historyForSession(msgs).map((m) => m.id)).toEqual(['1', '2']);
    expect(retryText(msgs, '4')).toBe('again');
    expect(retryText(msgs, '2')).toBe('hi');
    expect(retryText(msgs, 'x')).toBeNull();
  });
});
