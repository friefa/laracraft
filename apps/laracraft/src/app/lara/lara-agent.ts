import { InjectionToken } from '@angular/core';
import type { CreateLaraSessionFn, TestProviderFn } from '@laracraft/lara-agent';

/** What the app needs from `@laracraft/lara-agent` (contract in `libs/lara-agent/src/lib/api.ts`). */
export interface LaraAgent {
  readonly createSession: CreateLaraSessionFn;
  readonly testProvider: TestProviderFn;
}

/** Loads the agent lazily so the provider SDKs stay out of the initial bundle. */
export type LaraAgentLoader = () => Promise<LaraAgent>;

/**
 * The Lara agent implementation.
 *
 * TODO(lead): `libs/lara-agent` does not export `createLaraSession` / `testProvider` in
 * this base yet. Until it does, the default is the scripted dev fake (streams a reply and
 * applies a couple of real DSL operations to the build). Wire the real agent with:
 *
 * ```ts
 * factory: () => () =>
 *   import('@laracraft/lara-agent').then((m) => ({
 *     createSession: m.createLaraSession,
 *     testProvider: m.testProvider,
 *   })),
 * ```
 */
export const LARA_AGENT = new InjectionToken<LaraAgentLoader>('LARA_AGENT', {
  providedIn: 'root',
  factory: () => () => import('./fake-lara-agent').then((m) => m.createFakeLaraAgent()),
});
