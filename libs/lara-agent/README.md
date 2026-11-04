# lara-agent

Lara on the device (ADR-0008): talks directly to the provider the user configured, drives the
tool loop over `@laracraft/lara-dsl` and streams events to the UI. Contract: `src/lib/api.ts`.

- `createLaraSession(provider, context, history?, options?)` / `testProvider(provider, signal?, options?)`.
  `options` (`LaraAgentOptions`) adds what the contract leaves to the app: `fetch` (Capacitor
  native HTTP), `usageStore` (local daily token limit), effort, iteration cap, strict tools for
  OpenAI-compatible endpoints.
- Providers (`src/lib/providers/`): Anthropic via `@anthropic-ai/sdk` (browser mode, streaming,
  strict tools with eager input streaming, prompt caching, adaptive thinking with explicit
  effort, server-side refusal fallback) and OpenAI-compatible Chat Completions over `fetch` + SSE.
- System prompt: `src/lib/system-prompt.ts` (stable per edition, cached with the tools).
- Build context: `src/lib/build-context.ts` (format documented there; bounded to ≈ 2–3k tokens).

Tests use fake `fetch` with recorded-style SSE streams; no network.

Run `pnpm exec nx run-many -p lara-agent -t lint typecheck test`.
