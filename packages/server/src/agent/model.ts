import type { LanguageModel } from 'ai'
import type { GlobalSettings, AgentModelConfig } from '@solocraft/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:model' })

const DEFAULT_MODELS: Record<string, string> = {
  google: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5',
}

export async function resolveModel(settings: GlobalSettings, agentConfig?: AgentModelConfig): Promise<LanguageModel> {
  const provider = agentConfig?.provider ?? settings.defaultProvider

  // Gateway mode — user can set provider to 'custom' with a gateway model string like 'google/gemini-2.5-flash'
  if (agentConfig?.model?.includes('/') && provider === 'custom') {
    log.debug({ model: agentConfig.model }, 'resolving gateway model')
    const { gateway } = await import('ai')
    return gateway(agentConfig.model)
  }

  // Direct provider SDK
  const providerConfig = settings.providers.find(p => p.provider === provider)
  if (!providerConfig) throw new Error(`Provider "${provider}" not configured in settings`)

  const modelId = agentConfig?.model ?? providerConfig.defaultModel ?? DEFAULT_MODELS[provider] ?? 'gemini-2.5-flash'

  log.debug({ provider, modelId }, 'resolving model')

  switch (provider) {
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic')
      return createAnthropic({ apiKey: providerConfig.apiKey, baseURL: providerConfig.baseUrl })(modelId)
    }
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai')
      return createOpenAI({ apiKey: providerConfig.apiKey, baseURL: providerConfig.baseUrl })(modelId)
    }
    case 'google': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
      return createGoogleGenerativeAI({ apiKey: providerConfig.apiKey, baseURL: providerConfig.baseUrl })(modelId)
    }
    case 'custom': {
      const { createOpenAI } = await import('@ai-sdk/openai')
      return createOpenAI({ apiKey: providerConfig.apiKey, baseURL: providerConfig.baseUrl })(modelId)
    }
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}
