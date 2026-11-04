import { type ChangeSet, invertChangeSet } from '@laracraft/core-model';
import {
  createLaraTurn,
  type DslError,
  type DslLimits,
  type DslModule,
  LARA_TOOLS,
  type LaraTurn,
  type ModuleCatalogue as DslModuleCatalogue,
  type OperationReport,
  TOOL_NAME_TO_OP,
} from '@laracraft/lara-dsl';
import { modulesForEdition, type RedstoneModule } from '@laracraft/redstone-modules';
import type {
  ChatMessage,
  CreateLaraSessionFn,
  LaraContext,
  LaraErrorCode,
  LaraErrorInfo,
  LaraEvent,
  LaraSendOptions,
  LaraSession,
  ProviderConfig,
  TestProviderFn,
  Usage,
} from './api';
import { buildContextText } from './build-context';
import { createAnthropicProvider, type Effort } from './providers/anthropic';
import { createOpenAiCompatibleProvider } from './providers/openai-compatible';
import {
  type AssistantMessage,
  type ChatProvider,
  type ConversationMessage,
  ProviderError,
  type StopReason,
  type ToolCall,
  type ToolResult,
  type ToolSpec,
} from './providers/types';
import { buildSystemPrompt } from './system-prompt';

/**
 * Local daily token budget (ADR-0008 §5). Implemented by the app (storage, day boundary);
 * the agent checks it before every model request and reports every request's tokens.
 */
export interface UsageStore {
  /** Tokens (input + output) used today. */
  usedToday(): number | Promise<number>;
  /** Adds the tokens of one model request to today's total. */
  add(tokens: number, usage: Usage): void | Promise<void>;
  /** Daily limit in tokens; `null`/`undefined`/`0` = no limit. */
  dailyLimit(): number | null | undefined | Promise<number | null | undefined>;
}

/** Agent options beyond the lead-owned contract (all optional). */
export interface LaraAgentOptions {
  /** HTTP implementation (e.g. Capacitor native HTTP on mobile to avoid CORS). */
  readonly fetch?: typeof fetch;
  readonly usageStore?: UsageStore;
  /** DSL limits (default `DEFAULT_DSL_LIMITS`). */
  readonly limits?: DslLimits;
  /** Modules Lara may insert (default: `modulesForEdition(context.edition)`). */
  readonly modules?: readonly RedstoneModule[];
  /** Model requests per turn (default 12). */
  readonly maxIterations?: number;
  /** Anthropic `output_config.effort` (default `medium`; `null` = not sent). */
  readonly effort?: Effort | null;
  /** Anthropic server-side refusal fallback (`fallbacks: "default"`, default true). */
  readonly refusalFallback?: boolean;
  /** OpenAI-compatible: send `strict: true` on tools (default false). */
  readonly openAiStrictTools?: boolean;
  /** OpenAI-compatible: output limit field name (default depends on the base URL). */
  readonly maxTokensField?: 'max_tokens' | 'max_completion_tokens';
  /** Anthropic SDK retries (default 2). */
  readonly maxRetries?: number;
  /** ChangeSet label (already localised by the app). Default `'Lara'`. */
  readonly label?: string;
  readonly now?: () => Date;
  readonly newId?: () => string;
  /** Test hook: use this provider instead of creating one from the config. */
  readonly chatProvider?: ChatProvider;
}

export const DEFAULT_MAX_ITERATIONS = 12;
export const DEFAULT_MAX_OUTPUT_TOKENS = 16_000;
/** Re-issues of a request whose stream was malformed (no tool_use id to answer). */
const MAX_MALFORMED_RETRIES = 2;

/** Tool definitions (static, deterministic order → cacheable). */
export const LARA_TOOL_SPECS: readonly ToolSpec[] = LARA_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: t.input_schema as unknown as Record<string, unknown>,
}));

function defaultNewId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Creates the chat provider for a configuration; throws `not-configured` when incomplete. */
export function createChatProvider(
  config: ProviderConfig,
  options: LaraAgentOptions = {},
): ChatProvider {
  if (options.chatProvider) return options.chatProvider;
  if (config.kind === 'anthropic') {
    if (!config.apiKey) throw new ProviderError('not-configured', 'Anthropic API key missing');
    return createAnthropicProvider({
      apiKey: config.apiKey,
      model: config.model,
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
      ...(config.headers ? { headers: config.headers } : {}),
      ...(options.effort !== undefined ? { effort: options.effort } : {}),
      ...(options.refusalFallback !== undefined
        ? { refusalFallback: options.refusalFallback }
        : {}),
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
    });
  }
  if (config.kind === 'openai-compatible') {
    if (!config.baseUrl) throw new ProviderError('not-configured', 'base URL missing');
    if (!config.model) throw new ProviderError('not-configured', 'model missing');
    return createOpenAiCompatibleProvider({
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: config.apiKey,
      ...(config.headers ? { headers: config.headers } : {}),
      ...(options.openAiStrictTools !== undefined
        ? { strictTools: options.openAiStrictTools }
        : {}),
      ...(options.maxTokensField ? { maxTokensField: options.maxTokensField } : {}),
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }
  throw new ProviderError('not-configured', `unknown provider kind "${String(config.kind)}"`);
}

/** Adapts the redstone module list to the DSL's catalogue interface. */
export function dslCatalogue(modules: readonly RedstoneModule[]): DslModuleCatalogue {
  const byId = new Map<string, DslModule>(
    modules.map((m) => [
      m.id,
      { id: m.id, size: m.size, build: (params, facing) => m.build(params, facing) },
    ]),
  );
  const ids = [...byId.keys()].sort();
  return { get: (id) => byId.get(id), ids: () => ids };
}

const APPLIED_TAG = 'applied_operations';

/** Visible chat history → conversation (text only; earlier tool calls as a short note). */
export function historyToConversation(history: readonly ChatMessage[]): ConversationMessage[] {
  const out: ConversationMessage[] = [];
  for (const m of history) {
    if (m.role === 'user') {
      out.push({ role: 'user', text: m.text });
      continue;
    }
    if (out.length === 0) continue; // a conversation must start with the user
    const ops = m.operations;
    const note = ops.length
      ? `\n\n<${APPLIED_TAG}>${ops.map((o) => `${o.op}: ${o.changed} blocks`).join(', ')}</${APPLIED_TAG}>`
      : '';
    const text = `${m.text}${note}`.trim();
    if (!text) continue;
    out.push({ role: 'assistant', text, toolCalls: [] });
  }
  return out;
}

function formatDslErrors(errors: readonly DslError[]): string {
  return errors.map((e) => `${e.path || '(arguments)'}: ${e.message} [${e.code}]`).join('\n');
}

function formatReport(r: OperationReport): string {
  if (r.changed === 0) return `ok: ${r.op} changed nothing (the cells already had these blocks).`;
  const blocks = r.blocks
    .slice(0, 6)
    .map((b) => `${b.state.replace(/^minecraft:/, '')} ×${b.count}`)
    .join(', ');
  const more = r.blocks.length > 6 ? `, +${r.blocks.length - 6} more states` : '';
  return `ok: ${r.op} changed ${r.changed} blocks (${blocks}${more}).`;
}

const addUsage = (a: Usage | undefined, b: Usage): Usage => ({
  inputTokens: (a?.inputTokens ?? 0) + b.inputTokens,
  outputTokens: (a?.outputTokens ?? 0) + b.outputTokens,
  cachedInputTokens: (a?.cachedInputTokens ?? 0) + (b.cachedInputTokens ?? 0),
});

function toErrorInfo(e: unknown): LaraErrorInfo {
  if (e instanceof ProviderError) return { code: e.code, message: e.message };
  return { code: 'unknown', message: e instanceof Error ? e.message : String(e) };
}

class TurnAbort extends ProviderError {}

/**
 * Creates a Lara session for one build (see `LaraSession`). The fourth parameter carries
 * options beyond the contract; the function is assignable to `CreateLaraSessionFn`.
 */
export function createLaraSession(
  provider: ProviderConfig,
  context: LaraContext,
  history: readonly ChatMessage[] = [],
  options: LaraAgentOptions = {},
): LaraSession {
  const messages: ChatMessage[] = [...history];
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? defaultNewId;
  const label = options.label ?? 'Lara';
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const maxOutputTokens = provider.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const modules = options.modules ?? modulesForEdition(context.edition);
  const catalogue = dslCatalogue(modules);
  const system = buildSystemPrompt(context.edition, modules);
  let chat: ChatProvider | undefined;
  let running = false;

  const getProvider = (): ChatProvider => (chat ??= createChatProvider(provider, options));

  async function checkBudget(): Promise<void> {
    const store = options.usageStore;
    if (!store) return;
    const limit = await store.dailyLimit();
    if (!limit) return;
    const used = await store.usedToday();
    if (used >= limit) {
      throw new ProviderError('limit', `daily token limit reached (${used} of ${limit})`);
    }
  }

  async function recordUsage(usage: Usage): Promise<void> {
    await options.usageStore?.add(usage.inputTokens + usage.outputTokens, usage);
  }

  interface RequestResult {
    readonly reason: StopReason;
    readonly message: AssistantMessage;
    readonly detail?: string;
    readonly usage?: Usage;
  }

  /** One model request; forwards text deltas, re-issues malformed streams. */
  async function request(
    conversation: readonly ConversationMessage[],
    toolChoice: 'auto' | 'none',
    onEvent: (e: LaraEvent) => void,
    onText: (t: string) => void,
    signal: AbortSignal | undefined,
  ): Promise<RequestResult> {
    for (let attempt = 0; ; attempt++) {
      try {
        let usage: Usage | undefined;
        for await (const ev of getProvider().stream({
          system,
          tools: LARA_TOOL_SPECS,
          messages: conversation,
          toolChoice,
          maxOutputTokens,
          ...(signal ? { signal } : {}),
        })) {
          if (ev.type === 'text-delta') onText(ev.text);
          else if (ev.type === 'usage') {
            usage = ev.usage;
            onEvent({ type: 'usage', usage: ev.usage });
            await recordUsage(ev.usage);
          } else {
            return {
              reason: ev.reason,
              message: ev.message,
              ...(ev.detail ? { detail: ev.detail } : {}),
              ...(usage ? { usage } : {}),
            };
          }
        }
        throw new ProviderError('provider', 'stream ended without a result');
      } catch (e) {
        if (signal?.aborted) throw new TurnAbort('cancelled', 'cancelled');
        if (e instanceof ProviderError && e.retryable && attempt < MAX_MALFORMED_RETRIES) continue;
        throw e;
      }
    }
  }

  function executeToolCall(
    turn: LaraTurn,
    call: ToolCall,
    truncated: boolean,
    onEvent: (e: LaraEvent) => void,
    ops: { op: string; changed: number }[],
  ): ToolResult {
    const opName = TOOL_NAME_TO_OP.get(call.name) ?? call.name;
    const reject = (message: string): ToolResult => {
      onEvent({ type: 'operation-rejected', op: opName, message });
      return { id: call.id, name: call.name, content: message, isError: true };
    };
    if (truncated) {
      return reject(
        'Not executed: your reply hit the output limit while writing this call. Use fewer or smaller calls.',
      );
    }
    if (call.arguments === undefined) {
      return reject(
        JSON.stringify({
          INVALID_JSON: call.rawArguments,
          error: call.parseError ?? 'invalid JSON',
        }),
      );
    }
    const step = turn.applyToolCall(call.name, call.arguments);
    if (!step.ok) return reject(formatDslErrors(step.errors));
    const changeSet: ChangeSet = { changes: step.changes, origin: 'lara', label };
    if (step.changes.length) context.doc.apply(changeSet);
    ops.push({ op: step.report.op, changed: step.report.changed });
    onEvent({ type: 'operation', op: step.report.op, changed: step.report.changed, changeSet });
    return { id: call.id, name: call.name, content: formatReport(step.report), isError: false };
  }

  async function runTurn(
    kind: 'build' | 'explain',
    text: string,
    onEvent: (event: LaraEvent) => void,
    opts: LaraSendOptions | undefined,
  ): Promise<void> {
    const emit = (event: LaraEvent): void => {
      try {
        onEvent(event);
      } catch {
        // A UI callback error must not break the turn (and the revert logic).
      }
    };
    if (running) {
      emit({
        type: 'error',
        error: { code: 'unknown', message: 'Lara is still answering the previous message' },
      });
      return;
    }
    running = true;
    const signal = opts?.signal;
    const turnId = newId();
    emit({ type: 'turn-start', turnId });

    const previous = historyToConversation(messages);
    let conversation: ConversationMessage[];
    if (kind === 'build') {
      messages.push({ role: 'user', id: newId(), text, at: now().toISOString() });
      conversation = [...previous, { role: 'user', text, context: buildContextText(context) }];
    } else {
      conversation = [
        ...previous,
        {
          role: 'user',
          text: `Explain this step of the build guide to the player in simple words (two to four sentences, no tools needed):\n\n${text}`,
          context: `App language: ${context.language}. Target edition: ${context.edition}.`,
        },
      ];
    }

    const turn = createLaraTurn(context.doc, context.registry, {
      ...(options.limits ? { limits: options.limits } : {}),
      modules: catalogue,
      label,
    });
    const ops: { op: string; changed: number }[] = [];
    let reply = '';
    let iterationHasText = false;
    let usage: Usage | undefined;
    const onText = (t: string): void => {
      if (!iterationHasText && reply && !/\s$/.test(reply)) {
        reply += '\n\n';
        emit({ type: 'text-delta', text: '\n\n' });
      }
      iterationHasText = true;
      reply += t;
      emit({ type: 'text-delta', text: t });
    };
    const throwIfAborted = (): void => {
      if (signal?.aborted) throw new TurnAbort('cancelled', 'cancelled');
    };

    try {
      let limitNote: LaraErrorInfo | undefined;
      for (let iteration = 0; ; iteration++) {
        throwIfAborted();
        if (iteration >= maxIterations) {
          limitNote = {
            code: 'turn-limit',
            message: `stopped after ${maxIterations} model requests in one turn`,
          };
          break;
        }
        await checkBudget();
        iterationHasText = false;
        const r = await request(
          conversation,
          kind === 'build' ? 'auto' : 'none',
          emit,
          onText,
          signal,
        );
        if (r.usage) usage = addUsage(usage, r.usage);
        throwIfAborted();
        if (r.reason === 'refusal') {
          throw new ProviderError('refusal', r.detail || 'the model declined this request');
        }
        if (r.reason === 'context_exceeded') {
          throw new ProviderError('provider', 'the conversation is too long for the model');
        }
        conversation.push(r.message);
        if (r.reason === 'pause_turn') continue;
        if (kind === 'explain' || r.message.toolCalls.length === 0) break;
        const truncated = r.reason === 'max_tokens';
        const results = r.message.toolCalls.map((call) => {
          throwIfAborted();
          return executeToolCall(turn, call, truncated, emit, ops);
        });
        conversation.push({ role: 'tool-results', results });
      }

      const changeSet = turn.finish();
      const message: ChatMessage = {
        role: 'lara',
        id: newId(),
        text: reply,
        at: now().toISOString(),
        operations: ops,
        ...(usage ? { usage } : {}),
        ...(limitNote ? { error: limitNote } : {}),
      };
      messages.push(message);
      emit({ type: 'turn-end', message, changeSet });
    } catch (e) {
      const partial = turn.finish();
      if (partial.changes.length) context.doc.apply(invertChangeSet(partial));
      const error: LaraErrorInfo =
        signal?.aborted || e instanceof TurnAbort
          ? { code: 'cancelled' as LaraErrorCode, message: 'cancelled' }
          : toErrorInfo(e);
      messages.push({
        role: 'lara',
        id: newId(),
        text: reply,
        at: now().toISOString(),
        operations: [],
        ...(usage ? { usage } : {}),
        error,
      });
      emit({ type: 'error', error });
    } finally {
      running = false;
    }
  }

  return {
    get history() {
      return messages;
    },
    send: (text, onEvent, opts) => runTurn('build', text, onEvent, opts),
    explainStep: (stepSummary, onEvent, opts) => runTurn('explain', stepSummary, onEvent, opts),
  };
}

// Compile-time check that the implementation matches the lead-owned contract.
const _createLaraSession: CreateLaraSessionFn = createLaraSession;
void _createLaraSession;

/** Settings-screen check of a provider configuration (cheap request). */
export async function testProvider(
  provider: ProviderConfig,
  signal?: AbortSignal,
  options: LaraAgentOptions = {},
): ReturnType<TestProviderFn> {
  try {
    const r = await createChatProvider(provider, options).test(signal);
    return { ok: true, model: r.model };
  } catch (e) {
    if (signal?.aborted) return { ok: false, error: { code: 'cancelled', message: 'cancelled' } };
    return { ok: false, error: toErrorInfo(e) };
  }
}

const _testProvider: TestProviderFn = testProvider;
void _testProvider;
