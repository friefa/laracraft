import type { Usage } from '../api';
import { parseSse } from './sse';
import {
  type AssistantMessage,
  type ChatProvider,
  type ChatRequest,
  type ChatStreamEvent,
  codeForStatus,
  type ConversationMessage,
  isAbortError,
  parseToolArguments,
  ProviderError,
  type StopReason,
  type ToolCall,
} from './types';

export interface OpenAiCompatibleOptions {
  /** e.g. `https://api.openai.com/v1`, `http://localhost:11434/v1`. */
  readonly baseUrl: string;
  readonly model: string;
  /** May be empty for local servers without auth. */
  readonly apiKey: string;
  readonly headers?: Readonly<Record<string, string>>;
  /**
   * Send `strict: true` on function tools (only for endpoints that support it). Optional
   * fields are then sent as required-but-nullable and `null`s are removed again before
   * validation. Default false; our own validation always runs.
   */
  readonly strictTools?: boolean;
  /**
   * Name of the output limit field. Default: `max_completion_tokens` for api.openai.com
   * (required by its reasoning models), `max_tokens` elsewhere (widest support).
   */
  readonly maxTokensField?: 'max_tokens' | 'max_completion_tokens';
  /** Custom fetch (e.g. Capacitor native HTTP to avoid CORS on mobile). */
  readonly fetch?: typeof fetch;
}

interface OpenAiToolCallDelta {
  index?: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAiChunk {
  choices?: {
    index?: number;
    delta?: {
      content?: string | null;
      refusal?: string | null;
      tool_calls?: OpenAiToolCallDelta[];
    };
    finish_reason?: string | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number } | null;
  } | null;
  error?: { message?: string; code?: string | number; type?: string };
}

/**
 * OpenAI-compatible Chat Completions with function tools and streaming, over plain
 * `fetch` + SSE so any base URL works (OpenAI, OpenRouter, Azure, Ollama, LM Studio, vLLM).
 * Tool-call deltas are assembled per `index`; results go back as `tool` role messages.
 */
export function createOpenAiCompatibleProvider(opts: OpenAiCompatibleOptions): ChatProvider {
  const base = opts.baseUrl.replace(/\/+$/, '');
  const doFetch = opts.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const maxField =
    opts.maxTokensField ??
    (/^https:\/\/api\.openai\.com\//.test(`${base}/`) ? 'max_completion_tokens' : 'max_tokens');

  const headers = (): Record<string, string> => ({
    'content-type': 'application/json',
    ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
    ...opts.headers,
  });

  async function post(body: unknown, signal?: AbortSignal): Promise<Response> {
    let res: Response;
    try {
      res = await doFetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
    } catch (e) {
      if (isAbortError(e, signal)) throw new ProviderError('cancelled', 'cancelled');
      throw new ProviderError('network', e instanceof Error ? e.message : String(e));
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ProviderError(codeForStatus(res.status), errorMessage(res.status, text));
    }
    return res;
  }

  async function* stream(request: ChatRequest): AsyncIterable<ChatStreamEvent> {
    const strict = opts.strictTools === true;
    const body = {
      model: opts.model,
      stream: true,
      stream_options: { include_usage: true },
      [maxField]: request.maxOutputTokens,
      messages: toOpenAiMessages(request.system, request.messages),
      tools: request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: strict ? toOpenAiStrictSchema(t.inputSchema) : t.inputSchema,
          ...(strict ? { strict: true } : {}),
        },
      })),
      tool_choice: request.toolChoice,
    };
    const res = await post(body, request.signal);
    if (!res.body) throw new ProviderError('provider', 'empty response body');

    let text = '';
    let refusal = '';
    let finish: string | null = null;
    let usage: Usage | undefined;
    const calls = new Map<number, { id: string; name: string; args: string }>();

    try {
      for await (const ev of parseSse(res.body, request.signal)) {
        if (ev.data === '[DONE]') break;
        let chunk: OpenAiChunk;
        try {
          chunk = JSON.parse(ev.data) as OpenAiChunk;
        } catch {
          continue; // keep-alive or vendor noise
        }
        if (chunk.error) {
          throw new ProviderError('provider', chunk.error.message ?? 'provider error in stream');
        }
        if (chunk.usage) usage = toUsage(chunk.usage);
        for (const choice of chunk.choices ?? []) {
          if ((choice.index ?? 0) !== 0) continue;
          const d = choice.delta;
          if (d?.content) {
            text += d.content;
            yield { type: 'text-delta', text: d.content };
          }
          if (d?.refusal) refusal += d.refusal;
          for (const tc of d?.tool_calls ?? []) {
            const i = tc.index ?? calls.size;
            const entry = calls.get(i) ?? { id: '', name: '', args: '' };
            if (tc.id) entry.id = tc.id;
            if (tc.function?.name) entry.name += tc.function.name;
            if (tc.function?.arguments) entry.args += tc.function.arguments;
            calls.set(i, entry);
          }
          if (choice.finish_reason) finish = choice.finish_reason;
        }
      }
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      if (isAbortError(e, request.signal)) throw new ProviderError('cancelled', 'cancelled');
      throw new ProviderError('network', e instanceof Error ? e.message : String(e));
    }

    if (usage) yield { type: 'usage', usage };
    const toolCalls: ToolCall[] = [...calls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([i, c]) => {
        const parsed = parseToolArguments(c.args);
        return {
          id: c.id || `call_${i}`,
          name: c.name,
          rawArguments: c.args,
          ...parsed,
          arguments:
            strict && parsed.arguments !== undefined
              ? stripNulls(parsed.arguments)
              : parsed.arguments,
        };
      });
    const message: AssistantMessage = { role: 'assistant', text, toolCalls };
    let reason: StopReason;
    if (refusal) reason = 'refusal';
    else if (finish === 'tool_calls' || finish === 'function_call') reason = 'tool_use';
    else if (finish === 'length') reason = 'max_tokens';
    else if (finish === 'content_filter') reason = 'refusal';
    else if (toolCalls.length)
      reason = 'tool_use'; // some servers report "stop" with tool calls
    else reason = 'end_turn';
    yield {
      type: 'stop',
      reason,
      message,
      ...(reason === 'refusal' ? { detail: refusal || 'content_filter' } : {}),
    };
  }

  return {
    kind: 'openai-compatible',
    stream,
    async test(signal) {
      const res = await post(
        {
          model: opts.model,
          [maxField]: 16,
          messages: [{ role: 'user', content: 'Reply with OK.' }],
        },
        signal,
      );
      const json = (await res.json().catch(() => ({}))) as { model?: string };
      return { model: json.model || opts.model };
    },
  };
}

function toUsage(u: NonNullable<OpenAiChunk['usage']>): Usage {
  const cached = u.prompt_tokens_details?.cached_tokens;
  return {
    inputTokens: u.prompt_tokens ?? 0,
    outputTokens: u.completion_tokens ?? 0,
    ...(cached ? { cachedInputTokens: cached } : {}),
  };
}

function errorMessage(status: number, body: string): string {
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    const m = typeof j.error === 'string' ? j.error : (j.error?.message ?? j.message);
    if (m) return `${status}: ${m}`;
  } catch {
    // not JSON
  }
  return `${status}: ${body.slice(0, 300) || 'request failed'}`;
}

type OpenAiMessage =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: {
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

export function toOpenAiMessages(
  system: string,
  messages: readonly ConversationMessage[],
): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.context ? `${m.text}\n\n${m.context}` : m.text });
    } else if (m.role === 'assistant') {
      if (!m.text && m.toolCalls.length === 0) continue;
      out.push({
        role: 'assistant',
        content: m.text || null,
        ...(m.toolCalls.length
          ? {
              tool_calls: m.toolCalls.map((c) => ({
                id: c.id,
                type: 'function' as const,
                function: { name: c.name, arguments: c.rawArguments },
              })),
            }
          : {}),
      });
    } else {
      for (const r of m.results) {
        out.push({
          role: 'tool',
          tool_call_id: r.id,
          content: r.isError ? `ERROR: ${r.content}` : r.content,
        });
      }
    }
  }
  return out;
}

type Schema = Readonly<Record<string, unknown>>;

/**
 * OpenAI strict mode needs every property in `required`: optional properties become
 * required and nullable (`anyOf: [schema, {type: "null"}]`). Pair with {@link stripNulls}.
 */
export function toOpenAiStrictSchema(schema: Schema): Schema {
  const out: Record<string, unknown> = { ...schema };
  const props = schema['properties'] as Record<string, Schema> | undefined;
  if (props) {
    const required = new Set((schema['required'] as string[] | undefined) ?? []);
    const next: Record<string, Schema> = {};
    for (const [k, v] of Object.entries(props)) {
      const converted = toOpenAiStrictSchema(v);
      next[k] = required.has(k) ? converted : { anyOf: [converted, { type: 'null' }] };
    }
    out['properties'] = next;
    out['required'] = Object.keys(props);
  }
  if (schema['items']) out['items'] = toOpenAiStrictSchema(schema['items'] as Schema);
  if (Array.isArray(schema['anyOf'])) {
    out['anyOf'] = (schema['anyOf'] as Schema[]).map(toOpenAiStrictSchema);
  }
  return out;
}

/** Removes `null`-valued object properties (strict-mode placeholders for omitted fields). */
export function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== null) out[k] = stripNulls(v);
    }
    return out;
  }
  return value;
}
