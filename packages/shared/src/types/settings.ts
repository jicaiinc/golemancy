import type { PermissionsConfigId } from './common'

export type AIProvider = 'openai' | 'anthropic' | 'google' | 'custom'

export interface ProviderConfig {
  provider: AIProvider
  apiKey: string
  baseUrl?: string
  defaultModel: string
}

export type ThemeMode = 'light' | 'dark' | 'system'

export interface UserProfile {
  name: string
  email: string
  avatarUrl?: string
}

export interface GlobalSettings {
  providers: ProviderConfig[]
  defaultProvider: AIProvider
  theme: ThemeMode
  userProfile: UserProfile
  defaultWorkingDirectoryBase: string
}

export interface ProjectConfig {
  providerOverride?: Partial<ProviderConfig>
  maxConcurrentAgents: number
  permissionsConfigId?: PermissionsConfigId
}

export interface AgentModelConfig {
  provider?: AIProvider
  model?: string
  temperature?: number
  maxTokens?: number
}
