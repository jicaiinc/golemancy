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

export interface ProviderEntry {
  name: string
  apiKey?: string
  baseUrl?: string
  sdkType: ProviderSdkType
  models: string[]
  testStatus?: ProviderTestStatus
}

export type ThemeMode = 'light' | 'dark' | 'system'

export interface GlobalSettings {
  providers: Record<string, ProviderEntry>
  defaultModel?: AgentModelConfig
  theme: ThemeMode
  speechToText?: SpeechToTextSettings
  onboardingCompleted?: boolean
  onboardingStep?: number
}

export interface ProjectConfig {
  maxConcurrentAgents: number
  permissionsConfigId?: PermissionsConfigId
}

export interface AgentModelConfig {
  provider: string
  model: string
}
