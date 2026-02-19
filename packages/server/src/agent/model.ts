import type { LanguageModel } from 'ai'
import type { GlobalSettings, AgentModelConfig } from '@golemancy/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:model' })

export async function resolveModel(
  settings: GlobalSettings,
  agentConfig: AgentModelConfig,
): Promise<LanguageModel> {
  const { provider, model } = agentConfig
  const entry = settings.providers[provider]
  if (!entry) throw new Error(`Provider "${provider}" not configured in settings`)

  log.debug({ provider, model, sdkType: entry.sdkType }, 'resolving model')

  switch (entry.sdkType) {
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic')
      return createAnthropic({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model)
    }
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai')
      return createOpenAI({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model)
    }
    case 'google': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
      return createGoogleGenerativeAI({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model)
    }
    case 'openai-compatible':
    default: {
      const { createOpenAI } = await import('@ai-sdk/openai')
      return createOpenAI({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model)
    }
  }
}
