import { describe, expect, it } from 'vitest';
import { parseSseStream } from './sse.js';

const streamFrom = (chunks: string[]): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

describe('SSE parser', () => {
  it('parses frames across arbitrary byte chunks', async () => {
    const frames = [];
    for await (const frame of parseSseStream(
      streamFrom([
        'id: 1\nevent: text_delta\ndata: {"delta":"hel',
        'lo"}\n\nid: 2\nevent: done\ndata: {"type":"done"}\n\n',
      ]),
    )) {
      frames.push(frame);
    }

    expect(frames).toEqual([
      { id: '1', event: 'text_delta', data: '{"delta":"hello"}' },
      { id: '2', event: 'done', data: '{"type":"done"}' },
    ]);
  });

  it('joins multi-line data fields and ignores comments', async () => {
    const frames = [];
    for await (const frame of parseSseStream(
      streamFrom([': heartbeat\nid: 7\ndata: first\ndata: second\n\n']),
    )) {
      frames.push(frame);
    }

    expect(frames).toEqual([{ id: '7', event: 'message', data: 'first\nsecond' }]);
  });
});
