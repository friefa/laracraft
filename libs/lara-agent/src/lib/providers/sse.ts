/** One server-sent event (only the fields the providers need). */
export interface SseEvent {
  readonly event?: string;
  readonly data: string;
}

/**
 * Parses a `text/event-stream` body into events (WHATWG rules: `data:` lines joined with
 * `\n`, blank line dispatches, `:` comments ignored, CR/LF/CRLF line endings).
 */
export async function* parseSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncIterable<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  let event: string | undefined;

  const onAbort = (): void => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  function* lines(flush: boolean): Generator<SseEvent> {
    for (;;) {
      const m = /\r\n|\r|\n/.exec(buffer);
      if (!m) break;
      // A trailing lone CR may be the first half of CRLF: wait for more input.
      if (!flush && m[0] === '\r' && m.index === buffer.length - 1) break;
      const line = buffer.slice(0, m.index);
      buffer = buffer.slice(m.index + m[0].length);
      if (line === '') {
        if (data.length) yield { ...(event ? { event } : {}), data: data.join('\n') };
        data = [];
        event = undefined;
        continue;
      }
      if (line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'data') data.push(value);
      else if (field === 'event') event = value;
    }
  }

  try {
    for (;;) {
      if (signal?.aborted) throw abortError();
      const { done, value } = await reader.read();
      if (signal?.aborted) throw abortError();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      yield* lines(false);
    }
    buffer += decoder.decode();
    if (buffer !== '' && !/[\r\n]$/.test(buffer)) buffer += '\n';
    yield* lines(true);
    if (data.length) yield { ...(event ? { event } : {}), data: data.join('\n') };
  } finally {
    signal?.removeEventListener('abort', onAbort);
    try {
      reader.releaseLock();
    } catch {
      // A pending read after cancel; nothing to release.
    }
  }
}

function abortError(): Error {
  const e = new Error('The operation was aborted.');
  e.name = 'AbortError';
  return e;
}
