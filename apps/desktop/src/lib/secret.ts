import { invoke } from '@tauri-apps/api/core';

// Well-known keychain entries owned by the desktop app.
// M1 transports the resolved value to the sidecar inside POST /runs.
// See _decisions/secret-transport.zh.md for the production target.
export const SECRET_KEYS = {
  openaiApiKey: 'openai.apiKey',
} as const;

export async function secretGet(key: string): Promise<string | null> {
  const value = await invoke<string | null>('secret_get', { key });
  return value ?? null;
}

export async function secretSet(key: string, value: string): Promise<void> {
  await invoke('secret_set', { key, value });
}

export async function secretDelete(key: string): Promise<void> {
  await invoke('secret_delete', { key });
}
