import type { LaraEvent } from './api';
import { createLaraSession, type LaraAgentOptions, type UsageStore } from './session';
import {
  ANTHROPIC,
  anthropicStream,
  collector,
  fakeFetch,
  type FakeReply,
  FIXED_NOW,
  newContext,
  testIds,
  types,
} from './testing/fixtures';

const FILL = {
  region: { from: { x: 0, y: 0, z: 0 }, to: { x: 2, y: 0, z: 2 } },
  block: 'minecraft:stone_bricks',
};

function setup(replies: FakeReply[], options: LaraAgentOptions = {}) {
  const f = fakeFetch(replies);
  const context = newContext();
  const session = createLaraSession(ANTHROPIC, context, [], {
    fetch: f.fetch,
    maxRetries: 0,
    newId: testIds(),
    now: FIXED_NOW,
    ...options,
  });
  return { f, context, session, ...collector() };
}

type Msg = { role: string; content: { type: string; [k: string]: unknown }[] };
const messagesOf = (body: Record<string, unknown> | undefined): Msg[] =>
  (body?.['messages'] ?? []) as Msg[];

describe('Lara session with Anthropic (fake fetch)', () => {
  it('streams a text-only reply and builds a cache-friendly request', async () => {
    const { f, session, events, on } = setup([
      anthropicStream([{ type: 'text', text: 'Hallo! Was möchtest du bauen?' }]),
    ]);
    await session.send('Hallo Lara', on);

    expect(types(events)).toEqual(['turn-start', 'text-delta', 'text-delta', 'usage', 'turn-end']);
    const end = events.at(-1) as Extract<LaraEvent, { type: 'turn-end' }>;
    expect(end.message).toMatchObject({ role: 'lara', text: 'Hallo! Was möchtest du bauen?' });
    expect(end.changeSet.changes).toHaveLength(0);
    expect(session.history.map((m) => m.role)).toEqual(['user', 'lara']);

    const req = f.requests[0];
    expect(req?.url).toBe('https://api.anthropic.com/v1/messages');
    // SDK 1.x sends the key as a bearer token; browser mode adds the direct-access header.
    expect(req?.headers['authorization']).toBe('Bearer sk-ant-test');
    expect(req?.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(req?.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    const body = req?.body as Record<string, unknown>;
    expect(body['model']).toBe('claude-opus-5-5');
    expect(body['stream']).toBe(true);
    expect(body['max_tokens']).toBe(16000);
    expect(body['tool_choice']).toEqual({ type: 'auto' });
    expect(body['output_config']).toEqual({ effort: 'medium' });
    expect(body['fallbacks']).toBe('default');
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
    expect(body).not.toHaveProperty('thinking');
    const tools = body['tools'] as Record<string, unknown>[];
    expect(tools).toHaveLength(13);
    for (const t of tools) {
      expect(t['strict']).toBe(true);
      expect(t['eager_input_streaming']).toBe(true);
    }
    const system = body['system'] as { text: string; cache_control?: unknown }[];
    expect(system[0]?.cache_control).toEqual({ type: 'ephemeral' });
    expect(system[0]?.text).not.toContain('<build_context>');
    // The volatile build context is in the user message, after the cached prefix.
    const user = messagesOf(body)[0];
    expect(user?.content[0]).toMatchObject({ type: 'text', text: 'Hallo Lara' });
    expect(String(user?.content[1]?.['text'])).toContain('<build_context>');
  });

  it('applies a valid tool call to the document and reports one merged change set', async () => {
    const { f, context, session, events, on } = setup([
      anthropicStream([
        { type: 'thinking' },
        { type: 'text', text: 'Ich lege ein Fundament.' },
        { type: 'tool_use', id: 'toolu_1', name: 'fill', input: FILL },
      ]),
      anthropicStream([{ type: 'text', text: 'Fertig: ein 3×3 Fundament.' }]),
    ]);
    await session.send('Bau ein Fundament', on);

    expect(context.doc.getBlock(1, 0, 1)).toBe('minecraft:stone_bricks');
    const op = events.find((e) => e.type === 'operation') as Extract<
      LaraEvent,
      { type: 'operation' }
    >;
    expect(op).toMatchObject({ op: 'fill', changed: 9 });
    expect(op.changeSet.changes).toHaveLength(9);
    const end = events.at(-1) as Extract<LaraEvent, { type: 'turn-end' }>;
    expect(end.changeSet).toMatchObject({ origin: 'lara' });
    expect(end.changeSet.changes).toHaveLength(9);
    expect(end.message).toMatchObject({
      text: 'Ich lege ein Fundament.\n\nFertig: ein 3×3 Fundament.',
      operations: [{ op: 'fill', changed: 9 }],
    });

    // Second request: assistant content echoed (thinking block included), tool result after it.
    const msgs = messagesOf(f.requests[1]?.body);
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(msgs[1]?.content.map((b) => b.type)).toEqual(['thinking', 'text', 'tool_use']);
    expect(msgs[1]?.content[0]).toMatchObject({ signature: 'sig-test' });
    const result = msgs[2]?.content[0];
    expect(result).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_1' });
    expect(result).not.toHaveProperty('is_error');
    expect(String(result?.['content'])).toMatch(/^ok: fill changed 9 blocks/);
    // Moving cache breakpoint on the last block.
    expect(result?.['cache_control']).toEqual({ type: 'ephemeral' });
  });

  it('returns validator errors as tool errors and applies the corrected call', async () => {
    const { f, context, session, events, on } = setup([
      anthropicStream([
        {
          type: 'tool_use',
          id: 'toolu_bad',
          name: 'fill',
          input: { ...FILL, block: 'minecraft:stone_brickz' },
        },
      ]),
      anthropicStream([{ type: 'tool_use', id: 'toolu_good', name: 'fill', input: FILL }]),
      anthropicStream([{ type: 'text', text: 'Korrigiert.' }]),
    ]);
    await session.send('Fundament', on);

    const rejected = events.find((e) => e.type === 'operation-rejected');
    expect(rejected).toMatchObject({ op: 'fill' });
    const second = messagesOf(f.requests[1]?.body);
    const errResult = second[2]?.content[0];
    expect(errResult).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'toolu_bad',
      is_error: true,
    });
    expect(String(errResult?.['content'])).toContain('/block');
    expect(context.doc.getBlock(0, 0, 0)).toBe('minecraft:stone_bricks');
    expect(types(events).filter((t) => t === 'operation')).toHaveLength(1);
    expect(events.at(-1)?.type).toBe('turn-end');
  });

  it('runs several tool calls of one response and answers them in one message', async () => {
    const { f, context, session, events, on } = setup([
      anthropicStream([
        {
          type: 'tool_use',
          id: 't1',
          name: 'hollow_box',
          input: {
            region: { from: { x: 0, y: 1, z: 0 }, to: { x: 4, y: 4, z: 4 } },
            block: 'minecraft:oak_planks',
          },
        },
        {
          type: 'tool_use',
          id: 't2',
          name: 'place_block',
          input: { pos: { x: 2, y: 2, z: 0 }, block: 'minecraft:glass' },
        },
      ]),
      anthropicStream([{ type: 'text', text: 'Ein kleines Haus mit Fenster.' }]),
    ]);
    await session.send('Haus', on);

    expect(context.doc.getBlock(2, 2, 0)).toBe('minecraft:glass');
    expect(context.doc.getBlock(0, 1, 0)).toBe('minecraft:oak_planks');
    expect(context.doc.getBlock(2, 2, 2)).toBe('minecraft:air');
    const results = messagesOf(f.requests[1]?.body)[2]?.content ?? [];
    expect(results.map((r) => r['tool_use_id'])).toEqual(['t1', 't2']);
    const end = events.at(-1) as Extract<LaraEvent, { type: 'turn-end' }>;
    expect(end.message.role === 'lara' && end.message.operations.map((o) => o.op)).toEqual([
      'hollowBox',
      'placeBlock',
    ]);
  });

  it('inserts a redstone module from the edition catalogue', async () => {
    const { context, session, events, on } = setup([
      anthropicStream([
        {
          type: 'tool_use',
          id: 't1',
          name: 'insert_module',
          input: { moduleId: 'piston_door_2x2', pos: { x: 10, y: 1, z: 10 }, facing: 'north' },
        },
      ]),
      anthropicStream([{ type: 'text', text: 'Tür eingebaut.' }]),
    ]);
    await session.send('Baue eine Kolbentür', on);
    const op = events.find((e) => e.type === 'operation');
    expect(op).toMatchObject({ op: 'insertModule' });
    expect(context.doc.volume.blockCount).toBeGreaterThan(10);
  });

  it('answers truncated JSON from eager input streaming with an INVALID_JSON tool error', async () => {
    const { f, context, session, events, on } = setup([
      anthropicStream([
        { type: 'tool_use', id: 't1', name: 'fill', json: '{"region": {"from": {"x": 0, "y": 0' },
      ]),
      anthropicStream([{ type: 'text', text: 'Entschuldigung.' }]),
    ]);
    await session.send('x', on);
    const result = messagesOf(f.requests[1]?.body)[2]?.content[0];
    expect(result).toMatchObject({ is_error: true });
    expect(String(result?.['content'])).toContain('INVALID_JSON');
    expect(context.doc.volume.blockCount).toBe(0);
    expect(events.at(-1)?.type).toBe('turn-end');
  });

  it('does not execute tool calls cut off by max_tokens', async () => {
    const { f, context, session, on } = setup([
      anthropicStream([{ type: 'tool_use', id: 't1', name: 'fill', input: FILL }], {
        stopReason: 'max_tokens',
      }),
      anthropicStream([{ type: 'text', text: 'Ok.' }]),
    ]);
    await session.send('x', on);
    expect(context.doc.volume.blockCount).toBe(0);
    const result = messagesOf(f.requests[1]?.body)[2]?.content[0];
    expect(result).toMatchObject({ is_error: true });
  });

  it('maps a refusal to an error and reverts changes of the turn', async () => {
    const { context, session, events, on } = setup([
      anthropicStream([{ type: 'tool_use', id: 't1', name: 'fill', input: FILL }]),
      anthropicStream([], {
        stopReason: 'refusal',
        stopDetails: { type: 'refusal', category: 'general_harms', explanation: 'declined' },
      }),
    ]);
    await session.send('x', on);
    expect(events.at(-1)).toMatchObject({ type: 'error', error: { code: 'refusal' } });
    expect(context.doc.volume.blockCount).toBe(0);
    const last = session.history.at(-1);
    expect(last).toMatchObject({ role: 'lara', error: { code: 'refusal' } });
  });

  it('only runs tool calls after a mid-stream fallback boundary', async () => {
    const { f, context, session, on } = setup([
      anthropicStream([
        { type: 'text', text: 'Ich ' },
        { type: 'tool_use', id: 'cut', name: 'fill', input: FILL },
        { type: 'fallback', from: 'claude-opus-5-5', to: 'claude-opus-5' },
        {
          type: 'tool_use',
          id: 't2',
          name: 'place_block',
          input: { pos: { x: 5, y: 0, z: 5 }, block: 'minecraft:stone' },
        },
      ]),
      anthropicStream([{ type: 'text', text: 'baue.' }]),
    ]);
    await session.send('x', on);
    expect(context.doc.volume.blockCount).toBe(1);
    const echoed = messagesOf(f.requests[1]?.body)[1]?.content.map((b) => b.type);
    expect(echoed).toEqual(['text', 'tool_use']);
  });

  it.each([
    [
      {
        status: 401,
        json: {
          type: 'error',
          error: { type: 'authentication_error', message: 'invalid x-api-key' },
        },
      },
      'auth',
    ],
    [
      {
        status: 429,
        json: { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } },
      },
      'rate-limit',
    ],
    [
      { status: 500, json: { type: 'error', error: { type: 'api_error', message: 'boom' } } },
      'provider',
    ],
    [{ throws: new TypeError('Failed to fetch') }, 'network'],
  ] as const)('maps provider failures to error codes (%#)', async (reply, code) => {
    const { session, events, on } = setup([reply as FakeReply]);
    await session.send('x', on);
    expect(types(events)).toEqual(['turn-start', 'error']);
    expect(events.at(-1)).toMatchObject({ error: { code } });
  });

  it('reverts the document when the turn is cancelled mid-turn', async () => {
    const controller = new AbortController();
    let previewCount = -1;
    const { context, session, events } = setup([
      anthropicStream([{ type: 'tool_use', id: 't1', name: 'fill', input: FILL }]),
      { hang: 'event: ping\ndata: {"type":"ping"}\n\n' },
    ]);
    await session.send(
      'x',
      (e) => {
        events.push(e);
        if (e.type === 'operation') {
          previewCount = context.doc.volume.blockCount;
          setTimeout(() => controller.abort(), 10);
        }
      },
      { signal: controller.signal },
    );
    expect(previewCount).toBe(9); // live preview while the turn was running
    expect(events.at(-1)).toMatchObject({ type: 'error', error: { code: 'cancelled' } });
    expect(context.doc.volume.blockCount).toBe(0);
  });

  it('stops at the iteration cap and keeps what was built', async () => {
    const loop = (i: number) =>
      anthropicStream([
        {
          type: 'tool_use',
          id: `t${i}`,
          name: 'place_block',
          input: { pos: { x: i, y: 0, z: 0 }, block: 'minecraft:stone' },
        },
      ]);
    const { f, context, session, events, on } = setup([loop(0), loop(1), loop(2)], {
      maxIterations: 3,
    });
    await session.send('x', on);
    expect(f.requests).toHaveLength(3);
    const end = events.at(-1) as Extract<LaraEvent, { type: 'turn-end' }>;
    expect(end.type).toBe('turn-end');
    expect(end.message).toMatchObject({ error: { code: 'limit' } });
    expect(end.changeSet.changes).toHaveLength(3);
    expect(context.doc.volume.blockCount).toBe(3);
  });

  it('reports usage per request, sums it on the message and feeds the usage store', async () => {
    const added: number[] = [];
    const store: UsageStore = {
      usedToday: () => 0,
      add: (n) => void added.push(n),
      dailyLimit: () => 100_000,
    };
    const { session, events, on } = setup(
      [
        anthropicStream([{ type: 'tool_use', id: 't1', name: 'fill', input: FILL }], {
          inputTokens: 10,
          cacheRead: 1000,
          outputTokens: 40,
        }),
        anthropicStream([{ type: 'text', text: 'Ok.' }], {
          inputTokens: 20,
          cacheRead: 1000,
          outputTokens: 5,
        }),
      ],
      { usageStore: store },
    );
    await session.send('x', on);
    const usages = events.filter((e) => e.type === 'usage');
    expect(usages).toEqual([
      { type: 'usage', usage: { inputTokens: 1010, outputTokens: 40, cachedInputTokens: 1000 } },
      { type: 'usage', usage: { inputTokens: 1020, outputTokens: 5, cachedInputTokens: 1000 } },
    ]);
    expect(added).toEqual([1050, 1025]);
    const end = events.at(-1) as Extract<LaraEvent, { type: 'turn-end' }>;
    expect(end.message.role === 'lara' && end.message.usage).toEqual({
      inputTokens: 2030,
      outputTokens: 45,
      cachedInputTokens: 2000,
    });
  });

  it('refuses to call the provider when the local daily limit is reached', async () => {
    const { f, session, events, on } = setup([], {
      usageStore: { usedToday: () => 5000, add: () => undefined, dailyLimit: () => 5000 },
    });
    await session.send('x', on);
    expect(f.requests).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ type: 'error', error: { code: 'limit' } });
  });

  it('reports not-configured without an API key', async () => {
    const context = newContext();
    const session = createLaraSession({ ...ANTHROPIC, apiKey: '' }, context);
    const { events, on } = collector();
    await session.send('x', on);
    expect(events.at(-1)).toMatchObject({ type: 'error', error: { code: 'not-configured' } });
  });

  it('explains a guide step as text only and keeps earlier history', async () => {
    const { f, session, events, on } = setup([
      anthropicStream([{ type: 'text', text: 'Hallo!' }]),
      anthropicStream([{ type: 'text', text: 'In diesem Schritt legst du die Wände.' }]),
    ]);
    await session.send('Hallo', () => undefined);
    await session.explainStep('Schritt 3: Wände aus Eichenbrettern, 12 Blöcke', on);
    expect(events.at(-1)).toMatchObject({ type: 'turn-end', changeSet: { changes: [] } });
    const body = f.requests[1]?.body as Record<string, unknown>;
    expect(body['tool_choice']).toEqual({ type: 'none' });
    expect(messagesOf(body).map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(session.history.map((m) => m.role)).toEqual(['user', 'lara', 'lara']);
  });

  it('sends earlier turns as text with a note of the applied operations', async () => {
    const { f, session } = setup([
      anthropicStream([{ type: 'tool_use', id: 't1', name: 'fill', input: FILL }]),
      anthropicStream([{ type: 'text', text: 'Fundament steht.' }]),
      anthropicStream([{ type: 'text', text: 'Gern.' }]),
    ]);
    await session.send('Fundament', () => undefined);
    await session.send('Danke', () => undefined);
    const msgs = messagesOf(f.requests[2]?.body);
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(msgs[1]?.content[0]?.['text']).toBe(
      'Fundament steht.\n\n<applied_operations>fill: 9 blocks</applied_operations>',
    );
    // Only the latest user message carries the build context.
    expect(msgs[0]?.content).toHaveLength(1);
    expect(msgs[2]?.content).toHaveLength(2);
  });
});
