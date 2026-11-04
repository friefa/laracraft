import { canonicalBlockState } from '@laracraft/core-model';
import { MODULE_CATALOGUE, modulesForEdition } from '@laracraft/redstone-modules';
import { buildContextText, CONTEXT_LIMITS } from './build-context';
import { parseSse } from './providers/sse';
import { stripNulls, toOpenAiStrictSchema } from './providers/openai-compatible';
import { supportsEffort } from './providers/anthropic';
import { testProvider } from './session';
import { buildSystemPrompt } from './system-prompt';
import { ANTHROPIC, fakeFetch, newContext, OPENAI } from './testing/fixtures';

describe('build context', () => {
  it('describes an empty build', () => {
    const text = buildContextText(newContext());
    expect(text).toContain('The build is empty');
    expect(text).toContain('App language: de (German)');
  });

  it('stays small for a 50k-block build', () => {
    const context = newContext({
      selection: { min: { x: 10, y: 0, z: 10 }, max: { x: 19, y: 9, z: 19 } },
    });
    const states = ['stone', 'oak_planks', 'glass', 'oak_log[axis=y]', 'spruce_stairs', 'bricks']
      .concat(Array.from({ length: 40 }, (_, i) => (i % 2 ? 'white_wool' : 'red_wool')))
      .map((s) => canonicalBlockState(`minecraft:${s}`));
    const changes = [];
    // A 200×5×50 base plus 100 towers with varying heights: 50 000 + blocks.
    for (let x = 0; x < 200; x++)
      for (let z = 0; z < 50; z++)
        for (let y = 0; y < 5; y++)
          changes.push({
            pos: { x, y, z },
            before: canonicalBlockState('minecraft:air'),
            after: states[(x + z + y) % states.length] ?? states[0],
          });
    for (let t = 0; t < 100; t++)
      for (let y = 5; y < 5 + (t % 60); y++)
        changes.push({
          pos: { x: (t * 7) % 200, y, z: (t * 13) % 50 },
          before: canonicalBlockState('minecraft:air'),
          after: canonicalBlockState('minecraft:stone_bricks'),
        });
    context.doc.apply({ changes: changes as never, origin: 'system' });
    expect(context.doc.volume.blockCount).toBeGreaterThanOrEqual(50_000);

    const t0 = performance.now();
    const text = buildContextText(context);
    const ms = performance.now() - t0;
    expect(text.length).toBeLessThanOrEqual(CONTEXT_LIMITS.maxChars);
    expect(text).not.toContain('(truncated)');
    // ≈ 4 characters per token → well below 4k tokens.
    expect(text.length / 4).toBeLessThan(3000);
    expect(text).toContain('Bounds: x 0..199, y 0..63, z 0..49');
    expect(text).toMatch(
      /Selection: x 10\.\.19, y 0\.\.9, z 10\.\.19 \(size 10×10×10\), \d+ blocks/,
    );
    expect(text.split('\n').filter((l) => l.startsWith('y ')).length).toBeLessThanOrEqual(40);
    expect(ms).toBeLessThan(2000);
  });
});

describe('system prompt', () => {
  it('is deterministic per edition and lists the edition modules', () => {
    const java = buildSystemPrompt('java', modulesForEdition('java'));
    expect(buildSystemPrompt('java', modulesForEdition('java'))).toBe(java);
    for (const m of modulesForEdition('java')) expect(java).toContain(`- ${m.id} [`);
    expect(java).toContain('Minecraft Java Edition');
    expect(java).toContain('insert_module');
    expect(java).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('only lists modules tested for Bedrock in a Bedrock build', () => {
    const bedrock = buildSystemPrompt('bedrock', modulesForEdition('bedrock'));
    expect(bedrock).toContain('Bedrock Edition');
    for (const m of MODULE_CATALOGUE.all()) {
      if (m.editions.bedrock !== 'tested') expect(bedrock).not.toContain(`- ${m.id} [`);
    }
  });
});

describe('SSE parser', () => {
  it('handles CRLF, multi-line data, comments and chunk boundaries', async () => {
    const raw = ': hello\r\nevent: a\r\ndata: one\r\ndata: two\r\n\r\ndata: {"x":1}\n\ndata: tail';
    const enc = new TextEncoder().encode(raw);
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < enc.length; i += 3) c.enqueue(enc.slice(i, i + 3));
        c.close();
      },
    });
    const events = [];
    for await (const e of parseSse(body)) events.push(e);
    expect(events).toEqual([
      { event: 'a', data: 'one\ntwo' },
      { data: '{"x":1}' },
      { data: 'tail' },
    ]);
  });
});

describe('OpenAI strict helpers', () => {
  it('makes optional properties required and nullable, and strips nulls again', () => {
    const s = toOpenAiStrictSchema({
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'integer' } },
      required: ['a'],
      additionalProperties: false,
    });
    expect(s).toEqual({
      type: 'object',
      properties: { a: { type: 'string' }, b: { anyOf: [{ type: 'integer' }, { type: 'null' }] } },
      required: ['a', 'b'],
      additionalProperties: false,
    });
    expect(stripNulls({ a: 'x', b: null, c: [{ d: null, e: 1 }] })).toEqual({
      a: 'x',
      c: [{ e: 1 }],
    });
  });
});

describe('effort support', () => {
  it.each([
    ['claude-opus-5-5', true],
    ['claude-sonnet-5-5', true],
    ['claude-opus-4-6', true],
    ['claude-opus-4-5', true],
    ['claude-haiku-4-5', false],
    ['claude-sonnet-4-5', false],
    ['claude-sonnet-4-20250514', false],
    ['claude-3-7-sonnet-latest', false],
  ])('%s → %s', (model, expected) => expect(supportsEffort(model)).toBe(expected));
});

describe('testProvider', () => {
  it('checks an Anthropic key and model with free token counting (CORS-enabled)', async () => {
    const f = fakeFetch([{ status: 200, json: { input_tokens: 8 } }]);
    const r = await testProvider(ANTHROPIC, undefined, { fetch: f.fetch, maxRetries: 0 });
    expect(r).toEqual({ ok: true, model: 'claude-opus-5-5' });
    expect(f.requests[0]?.url).toBe('https://api.anthropic.com/v1/messages/count_tokens');
    expect(f.requests[0]?.body).toMatchObject({ model: 'claude-opus-5-5' });
  });

  it('reports an unknown Anthropic model as a provider error', async () => {
    const f = fakeFetch([
      {
        status: 404,
        json: { type: 'error', error: { type: 'not_found_error', message: 'model: nope' } },
      },
    ]);
    const r = await testProvider(ANTHROPIC, undefined, { fetch: f.fetch, maxRetries: 0 });
    expect(r).toMatchObject({ ok: false });
  });

  it('reports an invalid Anthropic key as auth', async () => {
    const f = fakeFetch([
      {
        status: 401,
        json: { type: 'error', error: { type: 'authentication_error', message: 'invalid' } },
      },
    ]);
    const r = await testProvider(ANTHROPIC, undefined, { fetch: f.fetch, maxRetries: 0 });
    expect(r).toMatchObject({ ok: false, error: { code: 'auth' } });
  });

  it('checks an OpenAI-compatible endpoint with a tiny completion', async () => {
    const f = fakeFetch([{ status: 200, json: { model: 'gpt-test-2026', choices: [] } }]);
    const r = await testProvider(OPENAI, undefined, { fetch: f.fetch });
    expect(r).toEqual({ ok: true, model: 'gpt-test-2026' });
    expect(f.requests[0]?.body).toMatchObject({ max_tokens: 16 });
  });

  it('reports missing configuration', async () => {
    expect(await testProvider({ ...OPENAI, baseUrl: '' })).toMatchObject({
      ok: false,
      error: { code: 'not-configured' },
    });
  });
});
