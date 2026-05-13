import type { PermissionsConfigId } from './common'
import type { SpeechToTextSettings } from './speech'

export type ProviderSdkType =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'deepseek'
  | 'xai'
  | 'groq'
  | 'mistral'
  | 'moonshot'
  | 'alibaba'
  | 'openai-compatible'

export type ProviderTestStatus = 'untested' | 'ok' | 'error'

export type OAuthFlowType = 'authorization_code' | 'device_code'

export interface OAuthTokens {
  accessToken: string
  refreshToken: string
  expiresAt: string          // ISO 8601
  accountId?: string         // ChatGPT account ID (team/enterprise)
}

/**
 * Which API shape the OAuth access token talks to at runtime.
 * - `codex`: OpenAI Codex Responses API (`/v1/responses` + `store:false` + instructions-param)
 * - `openai-compat`: Standard OpenAI chat completions (`/v1/chat/completions`)
 *
 * When undefined, the resolver falls back based on clientId for legacy Codex
 * configs that predate this field.
 */
export type OAuthSdkType = 'codex' | 'openai-compat'

export interface OAuthProviderConfig {
  flowType: OAuthFlowType
  clientId: string
  authEndpoint: string
  tokenEndpoint: string
  redirectUri?: string       // Auth Code Flow only — if set, takes precedence over dynamic port
  scope: string              // OAuth scopes (space-separated)
  apiBaseUrl: string         // e.g., https://chatgpt.com/backend-api/codex
  /**
   * Loopback callback port. `0` or undefined → OS-assigned dynamic port (RFC 8252 §7.3).
   * Codex uses a fixed `1455` for historical compatibility with the Codex CLI.
   */
  callbackPort?: number
  /** Callback path on the loopback server. Defaults to `/auth/callback`. */
  callbackPath?: string
  /** Which API shape this OAuth token targets. See OAuthSdkType. */
  sdkType?: OAuthSdkType
}

export type OAuthFlowStatus = 'idle' | 'pending' | 'success' | 'error'

export interface OAuthFlowState {
  status: OAuthFlowStatus
  authUrl?: string
  error?: string
}

export interface ProviderEntry {
  name: string
  apiKey?: string
  baseUrl?: string
  sdkType: ProviderSdkType
  models: string[]
  testStatus?: ProviderTestStatus
  oauth?: OAuthTokens
  oauthConfig?: OAuthProviderConfig
}

export type ThemeMode = 'light' | 'dark' | 'system'
export type StyleTheme = 'pixel' | 'modern'

export interface GlobalSettings {
  providers: Record<string, ProviderEntry>
  defaultModel?: AgentModelConfig
  theme: ThemeMode
  styleTheme?: StyleTheme
  language?: string
  speechToText?: SpeechToTextSettings
  onboardingCompleted?: boolean
  onboardingStep?: number
  telemetryEnabled?: boolean
  productAnalyticsEnabled?: boolean
  analyticsDistinctId?: string
}

export interface ProjectConfig {
  permissionsConfigId?: PermissionsConfigId
}

export interface AgentModelConfig {
  provider: string
  model: string
}
