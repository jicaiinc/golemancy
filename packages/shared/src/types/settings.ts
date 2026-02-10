// Three-layer config inheritance: Global → Project → Agent

export type AIProvider = 'openai' | 'anthropic' | 'google' | 'custom'

export interface ProviderConfig {
  provider: AIProvider
  apiKey: string
  baseUrl?: string
  defaultModel: string
}

// Layer 1: Global settings
export interface GlobalSettings {
  providers: ProviderConfig[]
  defaultProvider: AIProvider
  theme: 'dark' // Only dark in v1
}

// Layer 2: Project-level overrides
export interface ProjectConfig {
  providerOverride?: Partial<ProviderConfig>
  maxConcurrentAgents: number
}

// Layer 3: Agent-level model config
export interface AgentModelConfig {
  provider?: AIProvider
  model?: string
  temperature?: number
  maxTokens?: number
}
