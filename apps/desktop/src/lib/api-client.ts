import type { SidecarStatus } from './sidecar.js';

export type ApiClient = {
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  getJson: <T>(path: string) => Promise<T>;
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
  };
}

export function isReady(status: SidecarStatus): status is Extract<SidecarStatus, { status: 'ready' }> {
  return status.status === 'ready';
}
