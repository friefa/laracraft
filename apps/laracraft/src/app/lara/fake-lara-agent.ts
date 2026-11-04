import { type ChangeSet, invertChangeSet } from '@laracraft/core-model';
import type {
  ChatMessage,
  LaraContext,
  LaraEvent,
  LaraSendOptions,
  LaraSession,
  ProviderConfig,
  Usage,
  UsageStore,
} from '@laracraft/lara-agent';
import { createLaraTurn } from '@laracraft/lara-dsl';
import type { LaraAgent } from './lara-agent';

/**
 * Scripted stand-in for `@laracraft/lara-agent` (development, tests, screenshots) until
 * the real agent is wired (see `LARA_AGENT`). It honours the contract: streams text,
 * applies REAL validated DSL operations to `context.doc` (live preview), reports usage,
 * ends with the merged change set, and reverts partial changes on cancel/error.
 *
 * Triggers for UI states: a message containing `/fehler` or `/error` fails mid-turn with a
 * network error; the API key `invalid` fails with an auth error.
 */
export interface FakeLaraOptions {
  /** Pause between streamed chunks in ms (0 in unit tests). */
  readonly delayMs?: number;
  readonly usageStore?: UsageStore;
}

export function createFakeLaraAgent(options: FakeLaraOptions = {}): LaraAgent {
  const delayMs = options.delayMs ?? 45;
  return {
    createSession: (provider, context, history = []) =>
      new FakeLaraSession(provider, context, [...history], delayMs, options.usageStore),
    testProvider: async (provider, signal) => {
      await sleep(delayMs * 8, signal);
      if (provider.apiKey === 'invalid' || provider.apiKey.trim().length < 8) {
        return { ok: false, error: { code: 'auth', message: 'invalid x-api-key' } };
      }
      if (provider.kind === 'openai-compatible' && !provider.baseUrl) {
        return { ok: false, error: { code: 'network', message: 'missing base URL' } };
      }
      return { ok: true, model: provider.model };
    },
  };
}

const SCRIPT = {
  de: {
    intro: 'Klar! Ich baue dir eine **Mauer** vor deinen Bau.\n\n',
    details: '- 12 Blöcke lang\n- 4 Blöcke hoch\n- oben mit **bemoosten Steinziegeln**\n',
    outro: '\nSag mir, wenn sie anders aussehen soll!',
    explain: 'In diesem Schritt setzt du die **Grundmauer**. Fang an einer Ecke an.',
  },
  en: {
    intro: 'Sure! I am building a **wall** in front of your build.\n\n',
    details: '- 12 blocks long\n- 4 blocks high\n- topped with **mossy stone bricks**\n',
    outro: '\nTell me if it should look different!',
    explain: 'In this step you place the **base wall**. Start at a corner.',
  },
} as const;

class FakeLaraSession implements LaraSession {
  private turns = 0;

  constructor(
    private readonly provider: ProviderConfig,
    private readonly context: LaraContext,
    private readonly messages: ChatMessage[],
    private readonly delayMs: number,
    private readonly usageStore?: UsageStore,
  ) {}

  get history(): readonly ChatMessage[] {
    return this.messages;
  }

  async send(
    text: string,
    onEvent: (event: LaraEvent) => void,
    opts: LaraSendOptions = {},
  ): Promise<void> {
    const { doc, registry } = this.context;
    const script = SCRIPT[this.context.language];
    const turnId = `fake-${Date.now().toString(36)}-${++this.turns}`;
    this.messages.push({ role: 'user', id: `${turnId}-u`, text, at: new Date().toISOString() });
    onEvent({ type: 'turn-start', turnId });
    if (this.provider.apiKey === 'invalid') {
      onEvent({ type: 'error', error: { code: 'auth', message: 'invalid x-api-key' } });
      return;
    }
    const limit = await this.usageStore?.dailyLimit();
    if (limit && ((await this.usageStore?.usedToday()) ?? 0) >= limit) {
      onEvent({ type: 'error', error: { code: 'limit', message: 'daily token limit reached' } });
      return;
    }

    const turn = createLaraTurn(doc, registry, { label: 'Lara' });
    const operations: { op: string; changed: number }[] = [];
    let reply = '';
    const revert = () => {
      const partial = turn.finish();
      if (partial.changes.length) doc.apply(invertChangeSet(partial));
    };
    const stream = async (chunk: string) => {
      for (const part of chunk.match(/\S+\s*|\s+/g) ?? []) {
        await sleep(this.delayMs, opts.signal);
        reply += part;
        onEvent({ type: 'text-delta', text: part });
      }
    };
    const operate = async (operation: unknown) => {
      await sleep(this.delayMs * 3, opts.signal);
      const r = turn.apply(operation);
      const name = (operation as { op: string }).op;
      if (!r.ok) {
        onEvent({ type: 'operation-rejected', op: name, message: r.errors[0]?.message ?? '' });
        return;
      }
      const changeSet: ChangeSet = { changes: r.changes, origin: 'lara', label: 'Lara' };
      doc.apply(changeSet);
      operations.push({ op: r.report.op, changed: r.report.changed });
      onEvent({ type: 'operation', op: r.report.op, changed: r.report.changed, changeSet });
    };

    try {
      const b = doc.volume.bounds();
      const x = b?.min.x ?? 0;
      const y = b?.min.y ?? 0;
      const z = (b?.max.z ?? -2) + 2;
      await stream(script.intro);
      if (/\/(fehler|error)\b/i.test(text)) {
        await operate({
          op: 'wall',
          from: { x, y, z },
          to: { x: x + 11, y, z },
          height: 4,
          block: 'minecraft:stone_bricks',
        });
        throw Object.assign(new Error('Failed to fetch'), { code: 'network' });
      }
      await operate({
        op: 'wall',
        from: { x, y, z },
        to: { x: x + 11, y, z },
        height: 4,
        block: 'minecraft:stone_bricks',
      });
      await stream(script.details);
      await operate({
        op: 'line',
        from: { x, y: y + 4, z },
        to: { x: x + 11, y: y + 4, z },
        block: 'minecraft:mossy_stone_bricks',
      });
      await stream(script.outro);
    } catch (err) {
      revert();
      const cancelled = opts.signal?.aborted === true;
      onEvent({
        type: 'error',
        error: cancelled
          ? { code: 'cancelled', message: 'Cancelled' }
          : { code: 'network', message: err instanceof Error ? err.message : String(err) },
      });
      return;
    }

    const usage: Usage = {
      inputTokens: 1830 + 40 * this.turns,
      outputTokens: 212,
      cachedInputTokens: 1200,
    };
    await this.usageStore?.add(usage.inputTokens + usage.outputTokens, usage);
    onEvent({ type: 'usage', usage });
    const message: ChatMessage = {
      role: 'lara',
      id: `${turnId}-l`,
      text: reply,
      at: new Date().toISOString(),
      operations,
      usage,
    };
    this.messages.push(message);
    onEvent({ type: 'turn-end', message, changeSet: turn.finish() });
  }

  async explainStep(
    _stepSummary: string,
    onEvent: (event: LaraEvent) => void,
    opts: LaraSendOptions = {},
  ): Promise<void> {
    const turnId = `fake-explain-${++this.turns}`;
    onEvent({ type: 'turn-start', turnId });
    const text = SCRIPT[this.context.language].explain;
    try {
      await sleep(this.delayMs, opts.signal);
    } catch {
      onEvent({ type: 'error', error: { code: 'cancelled', message: 'Cancelled' } });
      return;
    }
    onEvent({ type: 'text-delta', text });
    const message: ChatMessage = {
      role: 'lara',
      id: `${turnId}-l`,
      text,
      at: new Date().toISOString(),
      operations: [],
    };
    onEvent({ type: 'turn-end', message, changeSet: { changes: [], origin: 'lara' } });
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
