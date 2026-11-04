import Anthropic from '@anthropic-ai/sdk';
import type { Usage } from '../api';
import {
  type AssistantMessage,
  type ChatProvider,
  type ChatRequest,
  type ChatStreamEvent,
  type ConversationMessage,
  isAbortError,
  parseToolArguments,
  ProviderError,
  type StopReason,
  type ToolCall,
} from './types';

type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type BetaContentBlock = Anthropic.Beta.Messages.BetaContentBlock;
type BetaContentBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam;
type BetaToolUnion = Anthropic.Beta.Messages.BetaToolUnion;
type BetaUsage = Anthropic.Beta.Messages.BetaUsage;

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

/** Beta for server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AnthropicProviderOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly headers?: Readonly<Record<string, string>>;
  /** `output_config.effort`; `null` = do not send (older models reject it). Default `medium`. */
  readonly effort?: Effort | null;
  /** Server-side refusal fallback (`fallbacks: "default"`). Default true. */
  readonly refusalFallback?: boolean;
  /** Custom fetch (e.g. Capacitor native HTTP); default global fetch. */
  readonly fetch?: typeof fetch;
  /** SDK retries for 408/409/429/5xx and connection errors (default 2). */
  readonly maxRetries?: number;
}

/** Whether the model accepts `output_config.effort` (Opus 4.5, 4.6+ and the 5.x families). */
export function supportsEffort(model: string): boolean {
  if (/^claude-(?:3|2|instant)/.test(model)) return false;
  const m = /^claude-(opus|sonnet|haiku)-4(?:-(\d+))?/.exec(model);
  if (!m) return true;
  let minor = Number(m[2] ?? 0);
  if (minor > 99) minor = 0; // date suffix, e.g. claude-sonnet-4-20250514
  return minor >= 6 || (m[1] === 'opus' && minor === 5);
}

/**
 * Anthropic Messages API (native) through the official SDK in browser mode.
 *
 * - Streaming via `client.beta.messages.stream` (beta namespace only for the server-side
 *   refusal fallback); text deltas are forwarded as they arrive.
 * - Tools: `strict: true` + `eager_input_streaming: true`. Because eager streaming skips the
 *   API's buffering/validation, the raw `input_json_delta` fragments are collected here and
 *   parsed strictly; the agent validates every input with `validateToolCall` anyway.
 * - Prompt caching: breakpoint on the system prompt (covers tools + system, which render
 *   first) and a moving breakpoint on the last message, so each tool-loop iteration reads
 *   the previous one from cache. The volatile build context sits in the turn's user message,
 *   after the system breakpoint.
 * - Adaptive thinking: `thinking` is omitted (Opus 5.5 runs adaptive; budget_tokens would
 *   400), depth via `output_config.effort`. No temperature/top_p.
 * - `tool_choice: auto` (forced tool choice 400s on current models); `none` for text-only.
 */
export function createAnthropicProvider(opts: AnthropicProviderOptions): ChatProvider {
  const model = opts.model || DEFAULT_ANTHROPIC_MODEL;
  const client = new Anthropic({
    apiKey: opts.apiKey,
    dangerouslyAllowBrowser: true,
    ...(opts.baseUrl ? { baseURL: opts.baseUrl } : {}),
    ...(opts.headers ? { defaultHeaders: { ...opts.headers } } : {}),
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
    ...(opts.maxRetries !== undefined ? { maxRetries: opts.maxRetries } : {}),
  });
  const effort = opts.effort === undefined ? 'medium' : opts.effort;
  const fallback = opts.refusalFallback ?? true;

  async function* stream(request: ChatRequest): AsyncIterable<ChatStreamEvent> {
    const tools: BetaToolUnion[] = request.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Beta.Messages.BetaTool.InputSchema,
      strict: true,
      eager_input_streaming: true,
    }));
    const params: Anthropic.Beta.Messages.MessageCreateParamsStreaming = {
      model,
      max_tokens: request.maxOutputTokens,
      system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
      tools,
      tool_choice: { type: request.toolChoice },
      messages: toAnthropicMessages(request.messages),
      stream: true,
      ...(effort && supportsEffort(model) ? { output_config: { effort } } : {}),
      ...(fallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
    };

    const rawJson = new Map<number, string>();
    let final: Anthropic.Beta.Messages.BetaMessage;
    try {
      const s = client.beta.messages.stream(params, { signal: request.signal });
      for await (const event of s) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield { type: 'text-delta', text: event.delta.text };
          } else if (event.delta.type === 'input_json_delta') {
            rawJson.set(event.index, (rawJson.get(event.index) ?? '') + event.delta.partial_json);
          }
        }
      }
      final = await s.finalMessage();
    } catch (e) {
      throw mapAnthropicError(e, request.signal);
    }

    yield { type: 'usage', usage: toUsage(final.usage) };
    const message = toAssistantMessage(final.content, rawJson);
    const reason = mapStopReason(final.stop_reason);
    const detail =
      reason === 'refusal' && final.stop_details
        ? [final.stop_details.category, final.stop_details.explanation].filter(Boolean).join(': ')
        : undefined;
    yield { type: 'stop', reason, message, ...(detail ? { detail } : {}) };
  }

  return {
    kind: 'anthropic',
    stream,
    async test(signal) {
      try {
        // Token counting: free, validates key and model id. Not the Models API: its
        // responses carry no CORS headers, so browsers block it (verified 2026-11-04).
        await client.messages.countTokens(
          { model, messages: [{ role: 'user', content: 'ping' }] },
          { signal },
        );
        return { model };
      } catch (e) {
        throw mapAnthropicError(e, signal);
      }
    },
  };
}

function toUsage(u: BetaUsage): Usage {
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  return {
    // Total input including cached parts; cachedInputTokens = read from cache.
    inputTokens: u.input_tokens + cacheRead + cacheWrite,
    outputTokens: u.output_tokens,
    cachedInputTokens: cacheRead,
  };
}

function mapStopReason(r: string | null): StopReason {
  switch (r) {
    case 'end_turn':
    case 'stop_sequence':
      return 'end_turn';
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    case 'refusal':
      return 'refusal';
    case 'pause_turn':
      return 'pause_turn';
    case 'model_context_window_exceeded':
      return 'context_exceeded';
    default:
      return 'other';
  }
}

/**
 * Builds the neutral assistant message. After a mid-output server-side fallback only the
 * content after the last `fallback` block counts (tool calls before it were never
 * completed); the raw content is trimmed accordingly for echoing (see the fallback rules:
 * drop thinking/tool_use blocks before the last fallback block, keep text).
 */
function toAssistantMessage(
  content: readonly BetaContentBlock[],
  rawJson: ReadonlyMap<number, string>,
): AssistantMessage {
  let lastFallback = -1;
  content.forEach((b, i) => {
    if (b.type === 'fallback') lastFallback = i;
  });
  const raw: BetaContentBlock[] = [];
  const toolCalls: ToolCall[] = [];
  const text: string[] = [];
  content.forEach((block, index) => {
    const beforeBoundary = index < lastFallback;
    if (block.type === 'text') {
      raw.push(block);
      text.push(block.text);
      return;
    }
    if (beforeBoundary) return;
    if (block.type === 'fallback') return; // audit marker only
    raw.push(block);
    if (block.type === 'tool_use') {
      const rawArguments = rawJson.get(index) ?? JSON.stringify(block.input ?? {});
      toolCalls.push({
        id: block.id,
        name: block.name,
        rawArguments,
        ...parseToolArguments(rawArguments),
      });
    }
  });
  return { role: 'assistant', text: text.join(''), toolCalls, raw };
}

const CACHE = { type: 'ephemeral' } as const;

/** Neutral conversation → Anthropic messages, with a cache breakpoint on the last block. */
export function toAnthropicMessages(messages: readonly ConversationMessage[]): BetaMessageParam[] {
  const out: BetaMessageParam[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      const content: BetaContentBlockParam[] = [{ type: 'text', text: m.text || '(empty)' }];
      if (m.context) content.push({ type: 'text', text: m.context });
      out.push({ role: 'user', content });
    } else if (m.role === 'assistant') {
      const content: BetaContentBlockParam[] = Array.isArray(m.raw)
        ? (m.raw as BetaContentBlockParam[]).map(stripResponseOnlyFields)
        : [
            ...(m.text ? [{ type: 'text' as const, text: m.text }] : []),
            ...m.toolCalls.map((c) => ({
              type: 'tool_use' as const,
              id: c.id,
              name: c.name,
              input: c.arguments ?? {},
            })),
          ];
      if (content.length === 0) continue;
      out.push({ role: 'assistant', content });
    } else {
      out.push({
        role: 'user',
        content: m.results.map((r) => ({
          type: 'tool_result' as const,
          tool_use_id: r.id,
          content: r.content,
          ...(r.isError ? { is_error: true } : {}),
        })),
      });
    }
  }
  const last = out[out.length - 1];
  if (last && Array.isArray(last.content) && last.content.length > 0) {
    const blocks = last.content as BetaContentBlockParam[];
    const lastBlock = blocks[blocks.length - 1] as BetaContentBlockParam & {
      cache_control?: unknown;
    };
    blocks[blocks.length - 1] = { ...lastBlock, cache_control: CACHE } as BetaContentBlockParam;
  }
  return out;
}

/** Response blocks are valid params except for a few response-only fields. */
function stripResponseOnlyFields(block: BetaContentBlockParam): BetaContentBlockParam {
  const b = { ...(block as unknown as Record<string, unknown>) };
  if (b['type'] === 'text' && b['citations'] == null) delete b['citations'];
  if (b['type'] === 'tool_use' && b['caller'] == null) delete b['caller'];
  return b as unknown as BetaContentBlockParam;
}

export function mapAnthropicError(e: unknown, signal?: AbortSignal): ProviderError {
  if (e instanceof ProviderError) return e;
  if (isAbortError(e, signal) || e instanceof Anthropic.APIUserAbortError) {
    return new ProviderError('cancelled', 'cancelled');
  }
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError('auth', e.message);
  }
  if (e instanceof Anthropic.RateLimitError) return new ProviderError('rate-limit', e.message);
  if (e instanceof Anthropic.APIConnectionError) return new ProviderError('network', e.message);
  if (e instanceof Anthropic.APIError) return new ProviderError('provider', e.message);
  if (e instanceof Anthropic.AnthropicError) {
    // Not an HTTP error: a malformed stream, e.g. tool input JSON the SDK could not parse
    // (no tool_use id to answer) → the request may be re-issued.
    return new ProviderError('provider', e.message, true);
  }
  if (e instanceof TypeError) return new ProviderError('network', e.message);
  return new ProviderError('unknown', e instanceof Error ? e.message : String(e));
}
