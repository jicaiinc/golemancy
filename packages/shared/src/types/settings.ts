import type { PermissionsConfigId, SkillId } from './common'
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

export type AgentRuntime = 'standard' | 'claude-code'
export type ClaudeCodeModel = 'sonnet' | 'opus' | 'haiku'

export interface ClaudeCodeTestResult {
  ok: boolean
  error?: string
  model?: string
  latencyMs?: number
}

export interface GlobalSettings {
  providers: Record<string, ProviderEntry>
  defaultModel?: AgentModelConfig
  theme: ThemeMode
  speechToText?: SpeechToTextSettings
  agentRuntime?: AgentRuntime
}

export interface ProjectConfig {
  maxConcurrentAgents: number
  permissionsConfigId?: PermissionsConfigId
  agentRuntime?: AgentRuntime
  skillIds?: SkillId[]
}

export interface AgentModelConfig {
  provider: string
  model: string
}
