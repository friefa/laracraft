import { BuildDocument, createJavaBlockRegistry } from '@laracraft/core-model';
import type { LaraContext, LaraEvent, ProviderConfig } from '../api';

/**
 * Test-only helpers: recorded-style SSE streams for both providers and a fake `fetch`.
 * No network is ever used.
 */

export const registry = createJavaBlockRegistry();

export function newContext(overrides: Partial<LaraContext> = {}): LaraContext {
  const doc = new BuildDocument({
    name: 'test',
    dataVersion: 4189,
    edition: 'java',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  });
  return { doc, registry, edition: 'java', language: 'de', ...overrides };
}

export const ANTHROPIC: ProviderConfig = {
  kind: 'anthropic',
  model: 'claude-opus-5-5',
  apiKey: 'sk-ant-test',
};

export const OPENAI: ProviderConfig = {
  kind: 'openai-compatible',
  model: 'gpt-test',
  apiKey: 'sk-test',
  baseUrl: 'https://llm.example.com/v1',
};

// --- Anthropic SSE ------------------------------------------------------------------

export type AnthropicBlock =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'tool_use';
      readonly id: string;
      readonly name: string;
      /** Arguments; serialised and streamed in two fragments unless `json` is given. */
      readonly input?: unknown;
      readonly json?: string;
    }
  | { readonly type: 'thinking' }
  | { readonly type: 'fallback'; readonly from: string; readonly to: string };

export interface AnthropicStreamOptions {
  readonly stopReason?: string;
  readonly stopDetails?: unknown;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cacheRead?: number;
}

const sse = (event: string, data: unknown): string =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

function splitInTwo(s: string): string[] {
  const mid = Math.floor(s.length / 2);
  return [s.slice(0, mid), s.slice(mid)].filter((p) => p.length > 0);
}

/** A Messages API stream as the API sends it (message_start … message_stop). */
export function anthropicStream(
  blocks: readonly AnthropicBlock[],
  opts: AnthropicStreamOptions = {},
): string {
  const hasTool = blocks.some((b) => b.type === 'tool_use');
  const stopReason = opts.stopReason ?? (hasTool ? 'tool_use' : 'end_turn');
  let out = sse('message_start', {
    type: 'message_start',
    message: {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      stop_details: null,
      usage: {
        input_tokens: opts.inputTokens ?? 100,
        output_tokens: 1,
        cache_read_input_tokens: opts.cacheRead ?? 0,
        cache_creation_input_tokens: 0,
      },
    },
  });
  out += 'event: ping\ndata: {"type": "ping"}\n\n';
  blocks.forEach((b, index) => {
    if (b.type === 'text') {
      out += sse('content_block_start', {
        type: 'content_block_start',
        index,
        content_block: { type: 'text', text: '' },
      });
      for (const part of splitInTwo(b.text)) {
        out += sse('content_block_delta', {
          type: 'content_block_delta',
          index,
          delta: { type: 'text_delta', text: part },
        });
      }
    } else if (b.type === 'tool_use') {
      out += sse('content_block_start', {
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} },
      });
      for (const part of splitInTwo(b.json ?? JSON.stringify(b.input ?? {}))) {
        out += sse('content_block_delta', {
          type: 'content_block_delta',
          index,
          delta: { type: 'input_json_delta', partial_json: part },
        });
      }
    } else if (b.type === 'thinking') {
      out += sse('content_block_start', {
        type: 'content_block_start',
        index,
        content_block: { type: 'thinking', thinking: '', signature: '' },
      });
      out += sse('content_block_delta', {
        type: 'content_block_delta',
        index,
        delta: { type: 'signature_delta', signature: 'sig-test' },
      });
    } else {
      out += sse('content_block_start', {
        type: 'content_block_start',
        index,
        content_block: { type: 'fallback', from: { model: b.from }, to: { model: b.to } },
      });
    }
    out += sse('content_block_stop', { type: 'content_block_stop', index });
  });
  out += sse('message_delta', {
    type: 'message_delta',
    delta: {
      stop_reason: stopReason,
      stop_sequence: null,
      stop_details: opts.stopDetails ?? null,
    },
    usage: { output_tokens: opts.outputTokens ?? 50 },
  });
  out += sse('message_stop', { type: 'message_stop' });
  return out;
}

// --- OpenAI SSE ---------------------------------------------------------------------

export type OpenAiDelta = Readonly<Record<string, unknown>>;

/** Chat Completions stream from raw chunk deltas (+ optional finish reason and usage). */
export function openAiStream(
  deltas: readonly OpenAiDelta[],
  finishReason: string,
  usage: { prompt: number; completion: number; cached?: number } | null = {
    prompt: 120,
    completion: 30,
  },
): string {
  const chunk = (delta: unknown, finish: string | null): string =>
    `data: ${JSON.stringify({
      id: 'chatcmpl-test',
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;
  let out = chunk({ role: 'assistant', content: '' }, null);
  for (const d of deltas) out += chunk(d, null);
  out += chunk({}, finishReason);
  if (usage) {
    out += `data: ${JSON.stringify({
      id: 'chatcmpl-test',
      object: 'chat.completion.chunk',
      choices: [],
      usage: {
        prompt_tokens: usage.prompt,
        completion_tokens: usage.completion,
        ...(usage.cached ? { prompt_tokens_details: { cached_tokens: usage.cached } } : {}),
      },
    })}\n\n`;
  }
  return `${out}data: [DONE]\n\n`;
}

// --- Fake fetch ---------------------------------------------------------------------

export type FakeReply =
  | string // SSE body (200)
  | { readonly status: number; readonly json: unknown }
  | { readonly throws: Error }
  /** A stream that sends `prefix` and then hangs until the request is aborted. */
  | { readonly hang: string };

export interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown> | undefined;
}

export interface FakeFetch {
  readonly fetch: typeof fetch;
  readonly requests: RecordedRequest[];
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(init?.headers).forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

export function fakeFetch(replies: readonly FakeReply[]): FakeFetch {
  const queue = [...replies];
  const requests: RecordedRequest[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined;
    requests.push({ url, method: init?.method ?? 'GET', headers: headersOf(init), body });
    const reply = queue.shift();
    if (reply === undefined) throw new Error(`unexpected request #${requests.length} to ${url}`);
    if (typeof reply === 'string') {
      return new Response(reply, {
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'request-id': 'req_test' },
      });
    }
    if ('throws' in reply) throw reply.throws;
    if ('hang' in reply) {
      const signal = init?.signal;
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(reply.hang));
          const fail = (): void => {
            const e = new Error('The operation was aborted.');
            e.name = 'AbortError';
            try {
              controller.error(e);
            } catch {
              // already closed
            }
          };
          if (signal?.aborted) fail();
          signal?.addEventListener('abort', fail, { once: true });
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }
    return new Response(JSON.stringify(reply.json), {
      status: reply.status,
      headers: { 'content-type': 'application/json', 'request-id': 'req_test' },
    });
  };
  return { fetch: impl as typeof fetch, requests };
}

/** Collects session events. */
export function collector(): { events: LaraEvent[]; on: (e: LaraEvent) => void } {
  const events: LaraEvent[] = [];
  return { events, on: (e) => events.push(e) };
}

export const types = (events: readonly LaraEvent[]): string[] => events.map((e) => e.type);

let counter = 0;
export const testIds = (): (() => string) => {
  counter = 0;
  return () => `id-${++counter}`;
};

export const FIXED_NOW = (): Date => new Date('2026-11-04T10:00:00Z');
