import { API_PATHS, type SecretStatusResponse, type SetSecretResponse, type DeleteSecretResponse } from '@golemancy/protocol';
import type { ApiClient } from './api-client.js';

// Centralised account names. The sidecar owns the actual keychain reads via
// `security` CLI subprocess; the UI never holds the plaintext beyond the
// in-form input value that is POSTed once and then dropped.
export const SECRET_ACCOUNTS = {
  openaiApiKey: 'openai.apiKey',
} as const;
export type SecretAccount = (typeof SECRET_ACCOUNTS)[keyof typeof SECRET_ACCOUNTS];

export async function getSecretStatus(
  client: ApiClient,
  account: string,
): Promise<SecretStatusResponse> {
  return client.getJson<SecretStatusResponse>(API_PATHS.secretStatus(account));
}

export async function saveSecret(
  client: ApiClient,
  account: string,
  value: string,
): Promise<SetSecretResponse> {
  const res = await client.fetch(API_PATHS.secret(account), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PUT secret failed: ${res.status} ${text}`);
  }
  return (await res.json()) as SetSecretResponse;
}

export async function deleteSecret(
  client: ApiClient,
  account: string,
): Promise<DeleteSecretResponse> {
  const res = await client.fetch(API_PATHS.secret(account), { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DELETE secret failed: ${res.status} ${text}`);
  }
  return (await res.json()) as DeleteSecretResponse;
}
