import type { CapacitorHttp } from '@capacitor/core';

type CapacitorHttpPlugin = typeof CapacitorHttp;

/**
 * `fetch` on top of Capacitor's native HTTP (iOS/Android), so OpenAI-compatible endpoints
 * that do not allow browser CORS (local servers, many proxies) still work in the apps.
 *
 * Limitation: native HTTP returns the whole body at once, so streamed replies arrive in
 * one piece instead of word by word. Only used where CORS is a problem (see
 * `lara-agent.ts`); Anthropic allows direct browser access and keeps real streaming.
 */
export function capacitorFetch(http: CapacitorHttpPlugin): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const signal = init?.signal ?? request.signal;
    signal?.throwIfAborted();
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => (headers[key] = value));
    const body =
      request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();
    const res = await http.request({
      url: request.url,
      method: request.method,
      headers,
      data: body,
      responseType: 'text',
    });
    signal?.throwIfAborted();
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '');
    return new Response(res.status === 204 ? null : text, {
      status: res.status,
      headers: res.headers,
    });
  };
}
