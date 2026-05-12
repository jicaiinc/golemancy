import type { SidecarStatus } from './sidecar.js';

export type ApiClient = {
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  getJson: <T>(path: string) => Promise<T>;
  postJson: <T>(path: string, body: unknown, init?: RequestInit) => Promise<T>;
};

export function createApiClient(runtime: { url: string; token: string }): ApiClient {
  const base = runtime.url.replace(/\/$/, '');
  const auth = `Bearer ${runtime.token}`;

  const doFetch = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', auth);
    return fetch(`${base}${path}`, { ...init, headers });
  };

  return {
    fetch: doFetch,
    getJson: async <T>(path: string) => {
      const res = await doFetch(path);
      if (!res.ok) {
        throw new Error(`GET ${path} failed: ${res.status}`);
      }
      return res.json() as Promise<T>;
    },
    postJson: async <T>(path: string, body: unknown, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set('Content-Type', 'application/json');
      const res = await doFetch(path, {
        ...init,
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`POST ${path} failed: ${res.status} ${text}`);
      }
      return res.json() as Promise<T>;
    },
  };
}

export function isReady(
  status: SidecarStatus,
): status is Extract<SidecarStatus, { status: 'ready' }> {
  return status.status === 'ready';
}
