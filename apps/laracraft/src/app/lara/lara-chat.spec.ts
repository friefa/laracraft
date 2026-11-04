import { ApplicationInitStatus, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BuildDocument, type ChangeSet, createJavaBlockRegistry } from '@laracraft/core-model';
import type { ChatMessage } from '@laracraft/lara-agent';
import { LANG_STORAGE_KEY } from '../i18n/lang';
import { provideI18nTesting } from '../i18n/i18n.testing';
import { ChatHistoryStore, EMPTY_CHAT, type StoredChat } from '../storage/chat-history-store';
import { createFakeLaraAgent } from './fake-lara-agent';
import { LARA_AGENT } from './lara-agent';
import { LaraChat } from './lara-chat';
import type { LaraChatHost } from './lara-chat-host';
import { LARA_SECRET_STORE, type SecretStore } from './secret-store';

function q<T extends Element = HTMLElement>(root: Element, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`No element for ${selector}`);
  return found;
}

const registry = createJavaBlockRegistry();

function makeHost() {
  const doc = new BuildDocument({
    name: 'Haus',
    edition: 'java',
    dataVersion: 4189,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  });
  const canUndo = signal(false);
  const recorded: ChangeSet[] = [];
  const host = {
    buildId: 'b1',
    doc,
    registry,
    selection: () => null,
    previewChanged: vi.fn(),
    recordTurn: vi.fn((cs: ChangeSet) => {
      recorded.push(cs);
      canUndo.set(true);
    }),
    canUndoTurn: canUndo.asReadonly(),
    undoTurn: vi.fn(() => {
      canUndo.set(false);
      return true;
    }),
    setBusy: vi.fn(),
  } satisfies LaraChatHost;
  return { host, recorded, doc };
}

async function setup(opts: { key?: string | null; chat?: StoredChat } = {}) {
  localStorage.clear();
  localStorage.setItem(LANG_STORAGE_KEY, 'de');
  const key = opts.key === undefined ? 'sk-ant-test-key' : opts.key;
  const secrets: SecretStore = {
    kind: 'web',
    get: async () => key,
    set: async () => undefined,
    clear: async () => undefined,
  };
  const saved: StoredChat[] = [];
  const chats = {
    load: vi.fn(async () => opts.chat ?? EMPTY_CHAT),
    save: vi.fn(async (_id: string, chat: StoredChat) => {
      saved.push(chat);
    }),
    delete: vi.fn(),
  };
  TestBed.configureTestingModule({
    imports: [LaraChat],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      { provide: LARA_SECRET_STORE, useValue: secrets },
      { provide: ChatHistoryStore, useValue: chats },
      { provide: LARA_AGENT, useValue: () => Promise.resolve(createFakeLaraAgent({ delayMs: 0 })) },
    ],
  });
  await TestBed.inject(ApplicationInitStatus).donePromise;
  const { host, recorded, doc } = makeHost();
  const fixture = TestBed.createComponent(LaraChat);
  fixture.componentRef.setInput('host', host);
  await fixture.whenStable();
  await settle(fixture, 10);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, host, recorded, doc, chats, saved };
}

/** Lets timers (the fake streams with setTimeout) and rendering run until idle. */
async function settle(fixture: { whenStable(): Promise<unknown> }, rounds = 200) {
  for (let i = 0; i < rounds; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
  await fixture.whenStable();
}

describe('LaraChat', () => {
  it('shows the BYOK onboarding when Lara is not set up', async () => {
    const { el } = await setup({ key: null });
    expect(el.querySelector('[data-state="onboarding"]')).not.toBeNull();
    expect(el.textContent).toContain('dein eigenes Konto');
    const link = el.querySelector<HTMLAnchorElement>('[data-action="lara-setup"]');
    expect(link?.getAttribute('href')).toContain('/settings/lara?from=b1');
    expect(el.querySelector('textarea')).toBeNull();
  });

  it('sends a message, streams the reply with chips and records one undo step', async () => {
    const { el, fixture, host, recorded, doc, saved } = await setup();
    expect(el.querySelector('[data-suggestion="house"]')).not.toBeNull();
    const input = q<HTMLTextAreaElement>(el, 'textarea');
    input.value = 'Bau eine Mauer';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle(fixture);

    expect(host.setBusy).toHaveBeenNthCalledWith(1, true);
    expect(host.setBusy).toHaveBeenLastCalledWith(false);
    expect(host.previewChanged).toHaveBeenCalledTimes(2);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.changes).toHaveLength(60);
    expect(doc.volume.blockCount).toBe(60);

    expect(el.querySelector('.user-bubble')?.textContent).toContain('Bau eine Mauer');
    const chips = [...el.querySelectorAll('.lara .lc-chip')].map((c) => c.textContent?.trim());
    expect(chips).toEqual(['Wand · 48 Blöcke', 'Linie · 12 Blöcke']);
    expect(el.querySelector('.lara strong')?.textContent).toBe('Mauer');
    expect(el.querySelector('.usage')?.textContent).toContain('1.870 Token rein');
    expect(saved.at(-1)?.messages).toHaveLength(2);

    q<HTMLButtonElement>(el, '[data-action="undo-turn"]').click();
    await settle(fixture);
    expect(host.undoTurn).toHaveBeenCalledTimes(1);
    expect(el.querySelector('.undone-label')?.textContent).toContain('Rückgängig gemacht');
    expect(saved.at(-1)?.undone).toHaveLength(1);
  });

  it('shows errors with retry and settings', async () => {
    const { el, fixture, recorded } = await setup();
    const input = q<HTMLTextAreaElement>(el, 'textarea');
    input.value = 'Mauer /fehler';
    input.dispatchEvent(new Event('input'));
    q(el, 'form').dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(recorded).toHaveLength(0);
    expect(el.querySelector('[data-error="network"]')?.textContent).toContain('Bist du online?');
    expect(el.querySelector('.failed .lc-chip')).toBeNull();

    q<HTMLButtonElement>(el, '[data-action="retry"]').click();
    await settle(fixture);
    // The retry sends the same text again (and fails again with the fake).
    expect(el.querySelectorAll('.user-bubble')).toHaveLength(1);
    expect(el.querySelectorAll('[data-error="network"]')).toHaveLength(1);
  });

  it('restores the stored conversation and never renders HTML from messages', async () => {
    const chat: ChatMessage[] = [
      { role: 'user', id: 'u', text: '<b>hi</b>', at: '' },
      { role: 'lara', id: 'l', text: '<img src=x onerror=alert(1)>', at: '', operations: [] },
    ];
    const { el } = await setup({ chat: { messages: chat, undone: [] } });
    expect(el.querySelector('img, .user-bubble b')).toBeNull();
    expect(el.querySelector('.lara lc-lara-markdown')?.textContent).toContain('<img');
    // No undo for turns from an earlier editor session.
    expect(el.querySelector('[data-action="undo-turn"]')).toBeNull();
  });
});
