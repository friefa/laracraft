import type { BlockRegistry, BuildDocument, ChangeSet } from '@laracraft/core-model';

/**
 * Lara agent contract (lead-owned, ADR-0008). Runs on the device: talks directly to
 * the provider the user configured, drives the tool loop over the Lara DSL
 * (`@laracraft/lara-dsl`), and streams events to the UI. No backend.
 */

export type ProviderKind = 'anthropic' | 'openai-compatible';

export interface ProviderConfig {
  readonly kind: ProviderKind;
  /** Model id, e.g. `claude-opus-5-5` or `gpt-…` / `llama3.1` for compatible endpoints. */
  readonly model: string;
  readonly apiKey: string;
  /** Required for `openai-compatible` (e.g. `https://api.openai.com/v1`); optional override for Anthropic. */
  readonly baseUrl?: string;
  /** Extra headers for compatible endpoints (e.g. OpenRouter attribution). */
  readonly headers?: Readonly<Record<string, string>>;
  /** Max output tokens per model request (default 16000). */
  readonly maxOutputTokens?: number;
}

export type LaraEdition = 'java' | 'bedrock';

export interface LaraContext {
  readonly doc: BuildDocument;
  readonly registry: BlockRegistry;
  /** Target edition of the build (ADR-0006); limits blocks/modules Lara may use. */
  readonly edition: LaraEdition;
  /** UI language for Lara's replies. */
  readonly language: 'de' | 'en';
  /** Optional current selection the user refers to ("make this taller"). */
  readonly selection?: { readonly min: Pos; readonly max: Pos } | null;
}

interface Pos {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** One message in the visible chat history (persisted per build by the app). */
export type ChatMessage =
  | { readonly role: 'user'; readonly id: string; readonly text: string; readonly at: string }
  | {
      readonly role: 'lara';
      readonly id: string;
      readonly text: string;
      readonly at: string;
      /** Summary of the build operations Lara applied in this turn (for chips in the UI). */
      readonly operations: readonly { readonly op: string; readonly changed: number }[];
      readonly usage?: Usage;
      readonly error?: LaraErrorInfo;
    };

export interface Usage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens?: number;
}

export type LaraErrorCode =
  | 'not-configured'
  | 'auth' // invalid API key
  | 'rate-limit'
  | 'network' // offline, CORS, DNS
  | 'provider' // 4xx/5xx from provider
  | 'refusal' // model declined
  | 'limit' // local daily token limit
  | 'turn-limit' // too many model requests in one turn; the changes so far are kept
  | 'cancelled'
  | 'unknown';

export interface LaraErrorInfo {
  readonly code: LaraErrorCode;
  readonly message: string;
}

/** Streaming events for the chat UI and the live 3D preview. */
export type LaraEvent =
  | { readonly type: 'turn-start'; readonly turnId: string }
  | { readonly type: 'text-delta'; readonly text: string }
  /** A validated operation was applied to the preview (document already updated by the agent). */
  | {
      readonly type: 'operation';
      readonly op: string;
      readonly changed: number;
      /** Changes of this single operation, for incremental rendering. */
      readonly changeSet: ChangeSet;
    }
  /** The model produced an invalid tool call; it got the error back and may retry. */
  | { readonly type: 'operation-rejected'; readonly op: string; readonly message: string }
  | { readonly type: 'usage'; readonly usage: Usage }
  /** Turn finished; `changeSet` is the merged single undo step (empty if nothing changed). */
  | { readonly type: 'turn-end'; readonly message: ChatMessage; readonly changeSet: ChangeSet }
  | { readonly type: 'error'; readonly error: LaraErrorInfo };

export interface LaraSendOptions {
  readonly signal?: AbortSignal;
}

/**
 * One conversation about one build. The agent applies validated operations to
 * `context.doc` as they stream in (live preview) and reports the merged change set
 * at `turn-end` so the app can push ONE undo step. On cancel/error mid-turn it
 * reverts the partial changes before emitting the error.
 */
export interface LaraSession {
  readonly history: readonly ChatMessage[];
  send(text: string, onEvent: (event: LaraEvent) => void, opts?: LaraSendOptions): Promise<void>;
  /** Ask Lara to explain a build-guide step (no tools, text only). */
  explainStep(
    stepSummary: string,
    onEvent: (event: LaraEvent) => void,
    opts?: LaraSendOptions,
  ): Promise<void>;
}

export type CreateLaraSessionFn = (
  provider: ProviderConfig,
  context: LaraContext,
  history?: readonly ChatMessage[],
) => LaraSession;

/** Test the configured provider (cheap request); used by the settings screen. */
export type TestProviderFn = (
  provider: ProviderConfig,
  signal?: AbortSignal,
) => Promise<
  | { readonly ok: true; readonly model: string }
  | { readonly ok: false; readonly error: LaraErrorInfo }
>;
