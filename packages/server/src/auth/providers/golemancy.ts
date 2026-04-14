import type { OAuthProviderConfig } from '@golemancy/shared'

/**
 * Golemancy OAuth provider config.
 *
 * Bridge flow (Scheme C):
 *   Desktop  → opens browser to `authEndpoint` (locale-agnostic)
 *   Web      → consent page → 302 to `http://127.0.0.1:<dynamic>/auth/callback`
 *   Desktop  → POST `tokenEndpoint` → Supabase access + refresh token pair
 *   Desktop  → uses access token as Bearer against the runtime Data Plane (`apiBaseUrl`)
 *
 * - `callbackPort` omitted → callback-server picks an OS-assigned dynamic port
 *   per RFC 8252 §7.3 (no fixed-port collision risk with Codex 1455).
 * - `apiBaseUrl` points at the Runtime Data Plane (NOT the website) — the
 *   token is then sent as `Authorization: Bearer <access_token>` to runtime
 *   `/v1/chat/completions`.
 *
 * Base URLs resolved at import time from env; defaults fall back to prod so
 * the config is safe without any local configuration. Override via `.env.local`
 * at the monorepo root (e.g. GOLEMANCY_WEB_URL=http://127.0.0.1:3000) to point
 * at a local web/runtime stack. Kept in lockstep with the UI preset in
 * `packages/ui/src/lib/provider-presets.ts`.
 */
const GOLEMANCY_WEB_URL = process.env.GOLEMANCY_WEB_URL ?? 'https://www.golemancy.ai'
const GOLEMANCY_RUNTIME_URL = process.env.GOLEMANCY_RUNTIME_URL ?? 'https://runtime.golemancy.ai'

export const GOLEMANCY_OAUTH_CONFIG: OAuthProviderConfig = {
  flowType: 'authorization_code',
  clientId: 'golemancy-desktop',
  authEndpoint: `${GOLEMANCY_WEB_URL}/auth/desktop/authorize`,
  tokenEndpoint: `${GOLEMANCY_WEB_URL}/api/auth/desktop/token`,
  // redirectUri intentionally omitted — assembled at runtime from the actual
  // bound port via buildRedirectUri(config, actualPort).
  scope: 'api',
  apiBaseUrl: `${GOLEMANCY_RUNTIME_URL}/v1`,
  callbackPath: '/auth/callback',
  sdkType: 'openai-compat',
}
