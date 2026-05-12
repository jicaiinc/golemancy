import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, isReady } from './api-client.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('desktop api client', () => {
  it('normalizes base URL and injects bearer auth for every request', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async (_input, _init) =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ url: 'http://127.0.0.1:18901/', token: 'secret-token' });
    await expect(client.postJson('/runs', { prompt: 'hello' })).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(init).toBeDefined();
    const requestInit = init!;
    const headers = requestInit.headers as Headers;
    expect(url).toBe('http://127.0.0.1:18901/runs');
    expect(headers.get('Authorization')).toBe('Bearer secret-token');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(requestInit.method).toBe('POST');
    expect(requestInit.body).toBe(JSON.stringify({ prompt: 'hello' }));
  });

  it('keeps sidecar readiness as a narrow type guard', () => {
    expect(isReady({ status: 'starting' })).toBe(false);
    expect(isReady({ status: 'ready', url: 'http://127.0.0.1:1', token: 't', pid: 1 })).toBe(true);
  });
});
