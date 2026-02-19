import type { PermissionsConfigId } from './common'

export type ProviderSdkType = 'anthropic' | 'openai' | 'google' | 'openai-compatible'

export interface ProviderEntry {
  name: string
  apiKey?: string
  baseUrl?: string
  sdkType: ProviderSdkType
  models: string[]
}

export type ThemeMode = 'light' | 'dark' | 'system'

export interface UserProfile {
  name: string
  email: string
  avatarUrl?: string
}

export interface GlobalSettings {
  providers: Record<string, ProviderEntry>
  defaultModel?: AgentModelConfig
  theme: ThemeMode
  userProfile: UserProfile
  defaultWorkingDirectoryBase: string
}

export interface ProjectConfig {
  maxConcurrentAgents: number
  permissionsConfigId?: PermissionsConfigId
}

export interface AgentModelConfig {
  provider: string
  model: string
}
