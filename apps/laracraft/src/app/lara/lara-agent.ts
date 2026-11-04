import { DOCUMENT, InjectionToken, inject } from '@angular/core';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type {
  ChatMessage,
  LaraContext,
  LaraSession,
  ProviderConfig,
  TestProviderFn,
  UsageStore,
} from '@laracraft/lara-agent';
import { LaraSettings } from './lara-settings';
import { capacitorFetch } from './native-fetch';

/** What the app needs from `@laracraft/lara-agent`, with the app's options already bound. */
export interface LaraAgent {
  createSession(
    provider: ProviderConfig,
    context: LaraContext,
    history?: readonly ChatMessage[],
  ): LaraSession;
  testProvider(...args: Parameters<TestProviderFn>): ReturnType<TestProviderFn>;
}

/** Loads the agent lazily so the provider SDKs stay out of the initial bundle. */
export type LaraAgentLoader = () => Promise<LaraAgent>;

/**
 * Dev switch: `localStorage['laracraft.lara.devFake'] = '1'` uses the scripted fake agent
 * (no network, no key needed beyond any 8 characters) for UI work and screenshots.
 */
export const LARA_DEV_FAKE_KEY = 'laracraft.lara.devFake';

/** Agent options the app provides: the local daily budget and, in the apps, native HTTP. */
export interface AppAgentOptions {
  readonly usageStore: UsageStore;
  /** Native HTTP for OpenAI-compatible endpoints inside the apps (no CORS there). */
  readonly nativeFetch?: typeof fetch;
}

/** The real agent (`@laracraft/lara-agent`, pulls `@anthropic-ai/sdk`: dynamic import only). */
export async function loadRealAgent(opts: AppAgentOptions): Promise<LaraAgent> {
  const m = await import('@laracraft/lara-agent');
  const options = (provider: ProviderConfig) => ({
    usageStore: opts.usageStore,
    // Anthropic allows direct browser access and keeps streaming: native HTTP only for
    // compatible endpoints, which often lack CORS (local servers, proxies).
    ...(opts.nativeFetch && provider.kind === 'openai-compatible'
      ? { fetch: opts.nativeFetch }
      : {}),
  });
  return {
    createSession: (provider, context, history) =>
      m.createLaraSession(provider, context, history, options(provider)),
    testProvider: (provider, signal) => m.testProvider(provider, signal, options(provider)),
  };
}

export const LARA_AGENT = new InjectionToken<LaraAgentLoader>('LARA_AGENT', {
  providedIn: 'root',
  factory: () => {
    const settings = inject(LaraSettings);
    const doc = inject(DOCUMENT);
    const opts: AppAgentOptions = {
      usageStore: settings.usageStore,
      nativeFetch: Capacitor.isNativePlatform() ? capacitorFetch(CapacitorHttp) : undefined,
    };
    return () =>
      devFakeEnabled(doc)
        ? import('./fake-lara-agent').then((m) =>
            m.createFakeLaraAgent({ usageStore: opts.usageStore }),
          )
        : loadRealAgent(opts);
  },
});

function devFakeEnabled(doc: Document): boolean {
  try {
    return doc.defaultView?.localStorage.getItem(LARA_DEV_FAKE_KEY) === '1';
  } catch {
    return false;
  }
}
