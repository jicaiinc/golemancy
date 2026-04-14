import type { OAuthProviderConfig } from '@golemancy/shared'

export const CODEX_OAUTH_CONFIG: OAuthProviderConfig = {
  flowType: 'authorization_code',
  clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
  authEndpoint: 'https://auth.openai.com/oauth/authorize',
  tokenEndpoint: 'https://auth.openai.com/oauth/token',
  redirectUri: 'http://localhost:1455/auth/callback',
  scope: 'openid profile email offline_access api.connectors.read api.connectors.invoke',
  apiBaseUrl: 'https://chatgpt.com/backend-api/codex',
  callbackPort: 1455,
  sdkType: 'codex',
}

/** Extra query parameters for Codex OAuth authorization URL. */
export const CODEX_AUTH_EXTRA_PARAMS: Record<string, string> = {
  id_token_add_organizations: 'true',
  codex_cli_simplified_flow: 'true',
  originator: 'golemancy',
}
