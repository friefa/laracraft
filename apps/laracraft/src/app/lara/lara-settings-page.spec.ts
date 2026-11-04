import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { LANG_STORAGE_KEY } from '../i18n/lang';
import { provideI18nTesting } from '../i18n/i18n.testing';
import { createFakeLaraAgent } from './fake-lara-agent';
import { LARA_AGENT } from './lara-agent';
import { PREFS_KEY } from './lara-settings';
import { LaraSettingsPage } from './lara-settings-page';
import { LARA_SECRET_STORE, type SecretStore } from './secret-store';

function q<T extends Element = HTMLElement>(root: Element, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`No element for ${selector}`);
  return found;
}

async function setup(from?: string) {
  localStorage.clear();
  localStorage.setItem(LANG_STORAGE_KEY, 'de');
  const state = { value: null as string | null, persist: null as boolean | null };
  const secrets: SecretStore = {
    kind: 'web',
    get: async () => state.value,
    set: async (v, o) => {
      state.value = v;
      state.persist = o.persist;
    },
    clear: async () => {
      state.value = null;
    },
  };
  const agent = createFakeLaraAgent({ delayMs: 0 });
  const testProvider = vi.spyOn(agent, 'testProvider');
  TestBed.configureTestingModule({
    imports: [LaraSettingsPage],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      { provide: LARA_SECRET_STORE, useValue: secrets },
      { provide: LARA_AGENT, useValue: () => Promise.resolve(agent) },
    ],
  });
  await TestBed.inject(ApplicationInitStatus).donePromise;
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(LaraSettingsPage);
  if (from) fixture.componentRef.setInput('from', from);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const type = async (selector: string, value: string) => {
    const input = q<HTMLInputElement>(el, selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const settle = async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 0));
      await fixture.whenStable();
    }
  };
  return { fixture, el, secrets: state, testProvider, navigate, type, settle };
}

describe('LaraSettingsPage', () => {
  it('defaults to Anthropic with claude-opus-5-5 and a masked key', async () => {
    const { el, fixture } = await setup();
    expect(el.querySelector<HTMLInputElement>('#lara-model')?.value).toBe('claude-opus-5-5');
    expect(el.querySelector('#lara-base-url')).toBeNull();
    const key = q<HTMLInputElement>(el, '#lara-key');
    expect(key.type).toBe('password');
    q<HTMLButtonElement>(el, '[data-action="toggle-key"]').click();
    await fixture.whenStable();
    expect(key.type).toBe('text');
    expect(el.textContent).toContain('Empfohlen');
    expect(el.textContent).toContain('Nutzungsbedingungen');
  });

  it('validates, tests the connection and saves (key only in the secret store)', async () => {
    const { el, fixture, secrets, testProvider, navigate, type, settle } = await setup('b1');
    q<HTMLButtonElement>(el, '[data-action="save"]').click();
    await settle();
    expect(el.querySelector('.lc-field__error')?.textContent).toContain('API-Schlüssel');

    await type('#lara-key', 'sk-ant-abcdefgh');
    q<HTMLButtonElement>(el, '[data-action="test"]').click();
    await settle();
    expect(testProvider).toHaveBeenCalledWith(
      { kind: 'anthropic', model: 'claude-opus-5-5', apiKey: 'sk-ant-abcdefgh' },
      expect.any(AbortSignal),
    );
    expect(el.querySelector('[data-test="ok"]')?.textContent).toContain('Verbindung klappt');

    const remember = q<HTMLInputElement>(el, '[data-action="remember"]');
    remember.click();
    await fixture.whenStable();
    expect(el.querySelector('[data-warning="remember"]')).not.toBeNull();

    q(el, 'form').dispatchEvent(new Event('submit'));
    await settle();
    expect(secrets.value).toBe('sk-ant-abcdefgh');
    expect(secrets.persist).toBe(true);
    expect(localStorage.getItem(PREFS_KEY)).not.toContain('sk-ant');
    expect(navigate).toHaveBeenCalledWith(['/build', 'b1']);
  });

  it('switches to OpenAI-compatible with base URL and shows test errors', async () => {
    const { el, fixture, type, settle } = await setup();
    q<HTMLInputElement>(el, 'input[value="openai-compatible"]').click();
    await fixture.whenStable();
    expect(el.querySelector<HTMLInputElement>('#lara-model')?.value).toBe('');
    await type('#lara-model', 'llama3.1');
    await type('#lara-base-url', 'localhost');
    await type('#lara-key', 'invalid');
    q<HTMLButtonElement>(el, '[data-action="test"]').click();
    await settle();
    expect(el.textContent).toContain('https://');
    await type('#lara-base-url', 'http://localhost:11434/v1');
    q<HTMLButtonElement>(el, '[data-action="test"]').click();
    await settle();
    expect(el.querySelector('[data-test="failed"]')?.textContent).toContain('abgelehnt');
  });
});
