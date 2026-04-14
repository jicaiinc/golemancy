import type { OAuthProviderConfig } from '@golemancy/shared'

const DEFAULT_CALLBACK_PATH = '/auth/callback'

/**
 * Build the loopback redirect_uri used in both the authorize URL and the token
 * exchange body. Must produce the same string on both sides of the flow — OAuth
 * servers compare byte-for-byte.
 *
 * Precedence:
 * 1. `config.redirectUri` verbatim (legacy Codex configs & any explicit override)
 * 2. `http://127.0.0.1:${actualPort}${config.callbackPath ?? '/auth/callback'}`
 */
export function buildRedirectUri(
  config: OAuthProviderConfig,
  actualPort: number,
): string {
  if (config.redirectUri) return config.redirectUri
  const callbackPath = config.callbackPath ?? DEFAULT_CALLBACK_PATH
  return `http://127.0.0.1:${actualPort}${callbackPath}`
}
