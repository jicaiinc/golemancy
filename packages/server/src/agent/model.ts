import { gateway, type LanguageModel } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { GlobalSettings, AgentModelConfig } from '@solocraft/shared'

const DEFAULT_MODELS: Record<string, string> = {
  google: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5',
}

export function resolveModel(settings: GlobalSettings, agentConfig?: AgentModelConfig): LanguageModel {
  const provider = agentConfig?.provider ?? settings.defaultProvider

  // Gateway mode — user can set provider to 'custom' with a gateway model string like 'google/gemini-2.5-flash'
  if (agentConfig?.model?.includes('/') && provider === 'custom') {
    return gateway(agentConfig.model)
  }

  // Direct provider SDK
  const providerConfig = settings.providers.find(p => p.provider === provider)
  if (!providerConfig) throw new Error(`Provider "${provider}" not configured in settings`)

  const modelId = agentConfig?.model ?? providerConfig.defaultModel ?? DEFAULT_MODELS[provider] ?? 'gemini-2.5-flash'

  switch (provider) {
    case 'anthropic':
      return createAnthropic({ apiKey: providerConfig.apiKey, baseURL: providerConfig.baseUrl })(modelId)
    case 'openai':
      return createOpenAI({ apiKey: providerConfig.apiKey, baseURL: providerConfig.baseUrl })(modelId)
    case 'google':
      return createGoogleGenerativeAI({ apiKey: providerConfig.apiKey, baseURL: providerConfig.baseUrl })(modelId)
    case 'custom':
      return createOpenAI({ apiKey: providerConfig.apiKey, baseURL: providerConfig.baseUrl })(modelId)
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}
