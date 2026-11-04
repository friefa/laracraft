import type { LaraEvent } from './api';
import { createLaraSession, type LaraAgentOptions } from './session';
import {
  collector,
  fakeFetch,
  type FakeReply,
  FIXED_NOW,
  newContext,
  OPENAI,
  openAiStream,
  testIds,
  types,
} from './testing/fixtures';

function setup(replies: FakeReply[], options: LaraAgentOptions = {}) {
  const f = fakeFetch(replies);
  const context = newContext({ language: 'en' });
  const session = createLaraSession(OPENAI, context, [], {
    fetch: f.fetch,
    newId: testIds(),
    now: FIXED_NOW,
    ...options,
  });
  return { f, context, session, ...collector() };
}

type OaMsg = Record<string, unknown> & { role: string };
const messagesOf = (body: Record<string, unknown> | undefined): OaMsg[] =>
  (body?.['messages'] ?? []) as OaMsg[];

describe('Lara session with an OpenAI-compatible endpoint (fake fetch)', () => {
  it('streams a text reply with usage and posts a Chat Completions request', async () => {
    const { f, session, events, on } = setup([
      openAiStream([{ content: 'Hi! ' }, { content: 'What shall we build?' }], 'stop', {
        prompt: 900,
        completion: 12,
        cached: 800,
      }),
    ]);
    await session.send('Hello', on);
    expect(types(events)).toEqual(['turn-start', 'text-delta', 'text-delta', 'usage', 'turn-end']);
    expect(events[3]).toEqual({
      type: 'usage',
      usage: { inputTokens: 900, outputTokens: 12, cachedInputTokens: 800 },
    });
    const req = f.requests[0];
    expect(req?.url).toBe('https://llm.example.com/v1/chat/completions');
    expect(req?.headers['authorization']).toBe('Bearer sk-test');
    const body = req?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'gpt-test',
      stream: true,
      tool_choice: 'auto',
      max_tokens: 16000,
    });
    const tools = body['tools'] as { type: string; function: Record<string, unknown> }[];
    expect(tools).toHaveLength(13);
    expect(tools[0]?.function).not.toHaveProperty('strict');
    const msgs = messagesOf(body);
    expect(msgs[0]?.role).toBe('system');
    expect(String(msgs[1]?.['content'])).toMatch(/^Hello\n\n<build_context>/);
  });

  it('assembles interleaved streaming tool-call deltas and returns tool messages', async () => {
    const fillArgs = JSON.stringify({
      region: { from: { x: 0, y: 0, z: 0 }, to: { x: 1, y: 0, z: 1 } },
      block: 'minecraft:cobblestone',
    });
    const placeArgs = JSON.stringify({ pos: { x: 5, y: 0, z: 5 }, block: 'minecraft:torch' });
    const { f, context, session, events, on } = setup([
      openAiStream(
        [
          { content: 'Building.' },
          {
            tool_calls: [
              { index: 0, id: 'call_a', type: 'function', function: { name: 'fi', arguments: '' } },
            ],
          },
          {
            tool_calls: [{ index: 0, function: { name: 'll', arguments: fillArgs.slice(0, 20) } }],
          },
          {
            tool_calls: [
              {
                index: 1,
                id: 'call_b',
                type: 'function',
                function: { name: 'place_block', arguments: placeArgs.slice(0, 7) },
              },
            ],
          },
          { tool_calls: [{ index: 0, function: { arguments: fillArgs.slice(20) } }] },
          { tool_calls: [{ index: 1, function: { arguments: placeArgs.slice(7) } }] },
        ],
        'tool_calls',
      ),
      openAiStream([{ content: 'Done.' }], 'stop'),
    ]);
    await session.send('Build', on);

    expect(context.doc.getBlock(1, 0, 1)).toBe('minecraft:cobblestone');
    expect(context.doc.getBlock(5, 0, 5)).toBe('minecraft:torch');
    expect(
      events.filter((e) => e.type === 'operation').map((e) => (e as { op: string }).op),
    ).toEqual(['fill', 'placeBlock']);
    const msgs = messagesOf(f.requests[1]?.body);
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'tool', 'tool']);
    expect(msgs[2]?.['tool_calls']).toEqual([
      { id: 'call_a', type: 'function', function: { name: 'fill', arguments: fillArgs } },
      { id: 'call_b', type: 'function', function: { name: 'place_block', arguments: placeArgs } },
    ]);
    expect(msgs[3]).toMatchObject({ tool_call_id: 'call_a' });
    expect(String(msgs[3]?.['content'])).toMatch(/^ok: fill changed 4 blocks/);
    const end = events.at(-1) as Extract<LaraEvent, { type: 'turn-end' }>;
    expect(end.message.text).toBe('Building.\n\nDone.');
    expect(end.changeSet.changes).toHaveLength(5);
  });

  it('returns schema errors as tool messages and continues', async () => {
    const { f, context, session, events, on } = setup([
      openAiStream(
        [
          {
            tool_calls: [
              {
                index: 0,
                id: 'c1',
                function: { name: 'fill', arguments: '{"block":"minecraft:stone"}' },
              },
            ],
          },
        ],
        'tool_calls',
      ),
      openAiStream(
        [
          {
            tool_calls: [
              {
                index: 0,
                id: 'c2',
                function: {
                  name: 'fill',
                  arguments: JSON.stringify({
                    region: { from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 } },
                    block: 'minecraft:stone',
                  }),
                },
              },
            ],
          },
        ],
        'tool_calls',
      ),
      openAiStream([{ content: 'Fixed.' }], 'stop'),
    ]);
    await session.send('x', on);
    expect(types(events)).toContain('operation-rejected');
    const tool = messagesOf(f.requests[1]?.body).find((m) => m.role === 'tool');
    expect(String(tool?.['content'])).toMatch(/^ERROR: .*region/s);
    expect(context.doc.getBlock(0, 0, 0)).toBe('minecraft:stone');
  });

  it('sends strict schemas with nullable optional fields when enabled and drops the nulls', async () => {
    const args = JSON.stringify({
      region: { from: { x: 0, y: 0, z: 0 }, to: { x: 1, y: 0, z: 0 } },
      block: 'minecraft:stone',
      onlyReplace: null,
    });
    const { f, context, session, on } = setup(
      [
        openAiStream(
          [{ tool_calls: [{ index: 0, id: 'c1', function: { name: 'fill', arguments: args } }] }],
          'tool_calls',
        ),
        openAiStream([{ content: 'Ok' }], 'stop'),
      ],
      { openAiStrictTools: true },
    );
    await session.send('x', on);
    const fill = (f.requests[0]?.body?.['tools'] as { function: Record<string, unknown> }[])[0]
      ?.function as {
      strict: boolean;
      parameters: { required: string[]; properties: Record<string, unknown> };
    };
    expect(fill.strict).toBe(true);
    expect(fill.parameters.required).toEqual(['region', 'block', 'onlyReplace']);
    expect(fill.parameters.properties['onlyReplace']).toMatchObject({
      anyOf: [{ type: 'array' }, { type: 'null' }],
    });
    expect(context.doc.volume.blockCount).toBe(2);
  });

  it('maps a 401 to auth and content_filter to refusal', async () => {
    const a = setup([{ status: 401, json: { error: { message: 'Incorrect API key' } } }]);
    await a.session.send('x', a.on);
    expect(a.events.at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'auth', message: '401: Incorrect API key' },
    });

    const b = setup([openAiStream([], 'content_filter')]);
    await b.session.send('x', b.on);
    expect(b.events.at(-1)).toMatchObject({ type: 'error', error: { code: 'refusal' } });
  });

  it('maps a fetch failure (offline, CORS) to network', async () => {
    const { session, events, on } = setup([{ throws: new TypeError('Failed to fetch') }]);
    await session.send('x', on);
    expect(events.at(-1)).toMatchObject({ type: 'error', error: { code: 'network' } });
  });

  it('cancels a hanging stream and reverts the operations of the turn', async () => {
    const controller = new AbortController();
    const args = JSON.stringify({ pos: { x: 0, y: 0, z: 0 }, block: 'minecraft:stone' });
    const { context, session, events } = setup([
      openAiStream(
        [
          {
            tool_calls: [
              { index: 0, id: 'c1', function: { name: 'place_block', arguments: args } },
            ],
          },
        ],
        'tool_calls',
      ),
      {
        hang: `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'Wor' } }] })}\n\n`,
      },
    ]);
    await session.send(
      'x',
      (e) => {
        events.push(e);
        if (e.type === 'text-delta') controller.abort();
      },
      { signal: controller.signal },
    );
    expect(events.at(-1)).toMatchObject({ type: 'error', error: { code: 'cancelled' } });
    expect(context.doc.volume.blockCount).toBe(0);
  });

  it('uses max_completion_tokens for api.openai.com', async () => {
    const f = fakeFetch([openAiStream([{ content: 'ok' }], 'stop')]);
    const session = createLaraSession(
      { ...OPENAI, baseUrl: 'https://api.openai.com/v1/' },
      newContext(),
      [],
      { fetch: f.fetch },
    );
    await session.send('x', () => undefined);
    expect(f.requests[0]?.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(f.requests[0]?.body).toHaveProperty('max_completion_tokens', 16000);
    expect(f.requests[0]?.body).not.toHaveProperty('max_tokens');
  });
});
