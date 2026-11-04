import type { LaraErrorCode, Usage } from '../api';

/**
 * Internal, provider-neutral chat interface (ADR-0005, running in the client per ADR-0008).
 * The agent loop only talks to this; `anthropic.ts` and `openai-compatible.ts` map it to
 * the wire formats.
 */

/** Tool definition (JSON Schema input), shared by both providers. */
export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  /**
   * Parsed arguments, or `undefined` when the provider delivered text that is not valid
   * JSON (then `parseError` is set and the call is answered with a tool error).
   */
  readonly arguments: unknown;
  /** Arguments exactly as received (JSON text). */
  readonly rawArguments: string;
  readonly parseError?: string;
}

export interface ToolResult {
  readonly id: string;
  readonly name: string;
  readonly content: string;
  readonly isError: boolean;
}

export interface AssistantMessage {
  readonly role: 'assistant';
  readonly text: string;
  readonly toolCalls: readonly ToolCall[];
  /**
   * The provider's own assistant content (e.g. Anthropic thinking and fallback blocks),
   * echoed back unchanged by the same provider within a turn.
   */
  readonly raw?: unknown;
}

/** Conversation as the agent keeps it. */
export type ConversationMessage =
  | {
      readonly role: 'user';
      readonly text: string;
      /** Volatile per-turn context sent after the user's text (never in the cached prefix). */
      readonly context?: string;
    }
  | AssistantMessage
  | { readonly role: 'tool-results'; readonly results: readonly ToolResult[] };

export type StopReason =
  'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'pause_turn' | 'context_exceeded' | 'other';

export interface ChatRequest {
  /** Stable system prompt (cached by providers that support caching). */
  readonly system: string;
  readonly tools: readonly ToolSpec[];
  readonly messages: readonly ConversationMessage[];
  /** `none` = text only (tools stay in the request so the cached prefix is reused). */
  readonly toolChoice: 'auto' | 'none';
  readonly maxOutputTokens: number;
  readonly signal?: AbortSignal;
}

export type ChatStreamEvent =
  | { readonly type: 'text-delta'; readonly text: string }
  | { readonly type: 'usage'; readonly usage: Usage }
  /** Final event of every successful stream. */
  | {
      readonly type: 'stop';
      readonly reason: StopReason;
      /** The complete assistant message (text, tool calls, raw provider content). */
      readonly message: AssistantMessage;
      /** Provider detail, e.g. the refusal category (English, for logs/UI). */
      readonly detail?: string;
    };

export interface ChatProvider {
  readonly kind: string;
  /** Streams one model response. Throws {@link ProviderError} on failure. */
  stream(request: ChatRequest): AsyncIterable<ChatStreamEvent>;
  /** Cheap request that validates key and model. Throws {@link ProviderError}. */
  test(signal?: AbortSignal): Promise<{ readonly model: string }>;
}

/** Error thrown by providers, already mapped to the contract's error codes. */
export class ProviderError extends Error {
  constructor(
    readonly code: LaraErrorCode,
    message: string,
    /** Malformed stream (e.g. tool JSON the SDK could not parse): the request may be re-issued. */
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export const isAbortError = (e: unknown, signal?: AbortSignal): boolean =>
  signal?.aborted === true ||
  (e instanceof Error && (e.name === 'AbortError' || e.name === 'APIUserAbortError'));

/** Strict JSON parse of tool arguments (empty text = `{}`). */
export function parseToolArguments(raw: string): Pick<ToolCall, 'arguments' | 'parseError'> {
  if (raw.trim() === '') return { arguments: {} };
  try {
    return { arguments: JSON.parse(raw) as unknown };
  } catch (e) {
    return { arguments: undefined, parseError: (e as Error).message };
  }
}

/** Maps an HTTP status of a provider response to an error code. */
export function codeForStatus(status: number): LaraErrorCode {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate-limit';
  return 'provider';
}
