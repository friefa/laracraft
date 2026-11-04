import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type {
  ChatMessage,
  LaraErrorInfo,
  LaraEvent,
  LaraSession,
  Usage,
} from '@laracraft/lara-agent';
import { Icon } from '../editor/icon';
import { LanguageService } from '../i18n/language.service';
import { Lara } from '../shared/lara/lara';
import { ChatHistoryStore } from '../storage/chat-history-store';
import {
  blocksKey,
  errorKey,
  historyForSession,
  needsSettings,
  newMessageId,
  opLabelKey,
  retryText,
} from './chat-model';
import { LARA_AGENT } from './lara-agent';
import type { LaraChatHost } from './lara-chat-host';
import { LaraMarkdown } from './lara-markdown';
import { LaraSettings } from './lara-settings';

type LaraMessage = Extract<ChatMessage, { role: 'lara' }>;

interface Streaming {
  readonly text: string;
  readonly operations: readonly { readonly op: string; readonly changed: number }[];
}

export type ChatSize = 'half' | 'full';

const SUGGESTIONS = ['house', 'taller', 'wall'] as const;

/**
 * Lara chat panel (ADR-0008): conversation per build, streaming replies with live 3D
 * preview, operation chips, stop/retry, usage, and "undo" of the last Lara turn as one
 * editor undo step. Shows the BYOK onboarding when Lara is not set up yet.
 * Lazy-loaded by the editor (`@defer`), together with the agent.
 */
@Component({
  selector: 'lc-lara-chat',
  imports: [RouterLink, TranslocoPipe, Icon, Lara, LaraMarkdown],
  templateUrl: './lara-chat.html',
  styleUrl: './lara-chat.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'region',
    'aria-labelledby': 'lara-chat-title',
    '(keydown.escape)': 'onEscape($event)',
  },
})
export class LaraChat {
  private readonly settings = inject(LaraSettings);
  private readonly chats = inject(ChatHistoryStore);
  private readonly loadAgent = inject(LARA_AGENT);
  private readonly language = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly input = viewChild<ElementRef<HTMLTextAreaElement>>('input');
  private readonly log = viewChild<ElementRef<HTMLElement>>('log');
  private readonly setupLink = viewChild<ElementRef<HTMLElement>>('setupLink');

  readonly host = input.required<LaraChatHost>();
  /** Phone bottom sheet height (ignored in the desktop side panel). */
  readonly size = input<ChatSize>('half');
  readonly sizeChange = output<ChatSize>();
  readonly closed = output<void>();

  protected readonly suggestions = SUGGESTIONS;
  protected readonly opLabelKey = opLabelKey;
  protected readonly blocksKey = blocksKey;
  protected readonly errorKey = errorKey;
  protected readonly needsSettings = needsSettings;
  private readonly numberFormat = computed(() => new Intl.NumberFormat(this.language.lang()));
  protected readonly fmt = (n: number) => this.numberFormat().format(n);

  protected readonly ready = signal(false);
  protected readonly configured = this.settings.configured;
  protected readonly modelLabel = computed(() => this.settings.prefs().model);
  protected readonly messages = signal<readonly ChatMessage[]>([]);
  protected readonly undone = signal<ReadonlySet<string>>(new Set());
  protected readonly streaming = signal<Streaming | null>(null);
  protected readonly draft = signal('');
  protected readonly loadFailed = signal(false);
  /** Screen reader announcement (start, finished reply, errors); not every delta. */
  protected readonly announcement = signal<{ readonly key?: string; readonly text?: string }>({});
  /** The Lara message whose changes are the latest editor undo step. */
  protected readonly undoableId = signal<string | null>(null);

  protected readonly busy = computed(() => this.streaming() !== null);
  protected readonly canSend = computed(() => !this.busy() && this.draft().trim().length > 0);
  protected readonly lastLaraId = computed(
    () => this.messages().findLast((m) => m.role === 'lara')?.id ?? null,
  );

  private session: LaraSession | null = null;
  private abort: AbortController | null = null;

  constructor() {
    afterNextRender(() => void this.init());
    this.destroyRef.onDestroy(() => {
      this.abort?.abort();
      this.host().setBusy(false);
    });
  }

  private async init(): Promise<void> {
    const [, chat] = await Promise.all([
      this.settings.load(),
      this.chats.load(this.host().buildId).catch((err: unknown) => {
        console.error('Lara chat history could not be loaded', err);
        this.loadFailed.set(true);
        return null;
      }),
    ]);
    if (chat) {
      this.messages.set(chat.messages);
      this.undone.set(new Set(chat.undone));
    }
    this.ready.set(true);
    afterNextRender(
      () => {
        this.scrollToEnd();
        (this.input() ?? this.setupLink())?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  // --- user actions ----------------------------------------------------------

  protected onInput(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    this.draft.set(el.value);
    autoGrow(el);
  }

  protected onComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void this.submit();
    }
  }

  protected async submit(event?: Event): Promise<void> {
    event?.preventDefault();
    const text = this.draft().trim();
    if (!text || this.busy()) return;
    this.draft.set('');
    const el = this.input()?.nativeElement;
    if (el) {
      el.value = '';
      autoGrow(el);
    }
    await this.send(text);
  }

  protected useSuggestion(text: string): void {
    if (!this.busy()) void this.send(text);
  }

  protected stop(): void {
    this.abort?.abort();
  }

  protected async retry(errorId: string): Promise<void> {
    const text = retryText(this.messages(), errorId);
    if (!text || this.busy()) return;
    // Drop the failed exchange; send() adds the user message again.
    const i = this.messages().findIndex((m) => m.id === errorId);
    this.messages.update((list) => list.filter((_, j) => j !== i && j !== i - 1));
    await this.send(text);
  }

  protected undoTurn(id: string): void {
    if (this.undoableId() !== id || !this.host().undoTurn()) return;
    this.undoableId.set(null);
    this.undone.update((s) => new Set(s).add(id));
    this.announce('lara.chat.undone');
    void this.persist();
  }

  protected toggleSize(): void {
    this.sizeChange.emit(this.size() === 'half' ? 'full' : 'half');
  }

  protected close(): void {
    this.closed.emit();
  }

  protected onEscape(event: Event): void {
    event.stopPropagation();
    if (this.busy()) this.stop();
    else this.close();
  }

  // --- conversation ------------------------------------------------------------

  private async send(text: string): Promise<void> {
    const host = this.host();
    const config = await this.settings.providerConfig();
    if (!config) return; // The template shows the onboarding instead.
    const userMsg: ChatMessage = {
      role: 'user',
      id: newMessageId(),
      text,
      at: new Date().toISOString(),
    };
    this.messages.update((list) => [...list, userMsg]);
    if (this.settings.limitReached()) {
      this.fail({ code: 'limit', message: 'Daily token limit reached' }, '');
      return;
    }

    const abort = new AbortController();
    this.abort = abort;
    this.streaming.set({ text: '', operations: [] });
    host.setBusy(true);
    this.announce('lara.chat.typing');
    this.scrollToEnd();
    let finished = false;
    let usage: Usage | undefined;
    const onEvent = (event: LaraEvent) => {
      if (this.abort !== abort && event.type !== 'error') return;
      switch (event.type) {
        case 'turn-start':
          break;
        case 'text-delta':
          this.streaming.update((s) => s && { ...s, text: s.text + event.text });
          this.scrollToEnd();
          break;
        case 'operation':
          host.previewChanged();
          this.streaming.update(
            (s) =>
              s && {
                ...s,
                operations: [...s.operations, { op: event.op, changed: event.changed }],
              },
          );
          this.scrollToEnd();
          break;
        case 'operation-rejected':
          break;
        case 'usage':
          usage = event.usage;
          this.settings.recordUsage(event.usage);
          break;
        case 'turn-end': {
          finished = true;
          const msg = withUsage(event.message, usage);
          this.messages.update((list) => [...list, msg]);
          if (event.changeSet.changes.length > 0) {
            host.recordTurn(event.changeSet);
            this.undoableId.set(msg.id);
          }
          this.announcement.set({ text: msg.text });
          break;
        }
        case 'error': {
          finished = true;
          // The agent already reverted the turn's partial changes: re-render.
          host.previewChanged();
          const s = this.streaming();
          this.fail(event.error, s?.text ?? '');
          break;
        }
      }
    };

    try {
      if (!this.session) {
        const agent = await this.loadAgent();
        this.session = agent.createSession(
          config,
          {
            doc: host.doc,
            registry: host.registry,
            edition: host.doc.metadata.edition === 'bedrock' ? 'bedrock' : 'java',
            language: this.language.lang(),
            selection: host.selection(),
          },
          historyForSession(this.messages().slice(0, -1)),
        );
      }
      await this.session.send(text, onEvent, { signal: abort.signal });
      if (!finished) this.fail({ code: 'unknown', message: 'Turn ended without result' }, '');
    } catch (err) {
      // Never log the config (it holds the key); the error itself carries no secrets.
      console.error('Lara turn failed', err);
      if (!finished) {
        host.previewChanged();
        this.fail({ code: 'unknown', message: String(err) }, this.streaming()?.text ?? '');
      }
    } finally {
      if (this.abort === abort) this.abort = null;
      this.streaming.set(null);
      host.setBusy(false);
      void this.persist();
      this.scrollToEnd();
      afterNextRender(() => this.input()?.nativeElement.focus(), { injector: this.injector });
    }
  }

  /** Adds a failed Lara turn (the agent reverted its changes, so no operation chips). */
  private fail(error: LaraErrorInfo, partialText: string): void {
    const msg: LaraMessage = {
      role: 'lara',
      id: newMessageId(),
      text: partialText,
      at: new Date().toISOString(),
      operations: [],
      error,
    };
    this.messages.update((list) => [...list, msg]);
    // The agent session may hold the failed turn; start fresh from our history next time.
    this.session = null;
    this.announce(error.code === 'cancelled' ? 'lara.chat.stopped' : errorKey(error.code));
  }

  private async persist(): Promise<void> {
    try {
      await this.chats.save(this.host().buildId, {
        messages: this.messages(),
        undone: [...this.undone()],
      });
    } catch (err) {
      console.error('Lara chat history could not be saved', err);
    }
  }

  /** Announces a translated status in the live region. */
  private announce(key: string): void {
    this.announcement.set({ key });
  }

  private scrollToEnd(): void {
    afterNextRender(
      () => {
        const el = this.log()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      },
      { injector: this.injector },
    );
  }
}

function withUsage(message: ChatMessage, usage: Usage | undefined): ChatMessage {
  if (message.role !== 'lara' || message.usage || !usage) return message;
  return { ...message, usage };
}

function autoGrow(el: HTMLTextAreaElement): void {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
}
