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

export interface OAuthProviderConfig {
  flowType: OAuthFlowType
  clientId: string
  authEndpoint: string
  tokenEndpoint: string
  redirectUri?: string       // Auth Code Flow only
  scope: string              // OAuth scopes (space-separated)
  apiBaseUrl: string         // e.g., https://chatgpt.com/backend-api/codex
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

export interface GlobalSettings {
  providers: Record<string, ProviderEntry>
  defaultModel?: AgentModelConfig
  theme: ThemeMode
  language?: string
  speechToText?: SpeechToTextSettings
  onboardingCompleted?: boolean
  onboardingStep?: number
  telemetryEnabled?: boolean
}

export interface ProjectConfig {
  permissionsConfigId?: PermissionsConfigId
}

export interface AgentModelConfig {
  provider: string
  model: string
}
