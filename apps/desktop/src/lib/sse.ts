export type SseFrame = {
  readonly event: string;
  readonly id: string | null;
  readonly data: string;
};

// Parses an SSE byte stream into discrete frames. Yields one frame per
// double-newline boundary. Compatible with Hono's `streamSSE` output.
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        const tail = decoder.decode();
        if (tail) buffer += tail;
        if (buffer.trim().length > 0) {
          const frame = parseFrame(buffer);
          if (frame) yield frame;
        }
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const frame = parseFrame(raw);
        if (frame) yield frame;
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}

function parseFrame(raw: string): SseFrame | null {
  let event = 'message';
  let id: string | null = null;
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith(':') || line.length === 0) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const valueRaw = colon === -1 ? '' : line.slice(colon + 1);
    const value = valueRaw.startsWith(' ') ? valueRaw.slice(1) : valueRaw;
    if (field === 'event') event = value;
    else if (field === 'id') id = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  return { event, id, data: dataLines.join('\n') };
}
