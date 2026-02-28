import type { LanguageModel } from 'ai'
import type { GlobalSettings, AgentModelConfig } from '@golemancy/shared'
import { logger } from '../logger'
import { ConfigurationError } from './errors'

const log = logger.child({ component: 'agent:model' })

export async function resolveModel(
  settings: GlobalSettings,
  agentConfig: AgentModelConfig,
): Promise<LanguageModel> {
  const { provider, model } = agentConfig
  const entry = settings.providers[provider]
  if (!entry) {
    throw new ConfigurationError(
      `Provider "${provider}" is not configured. Go to Settings → Providers to add it.`,
      'PROVIDER_NOT_CONFIGURED',
    )
  }
  if (!entry.apiKey?.trim() && !entry.baseUrl?.includes('localhost')) {
    throw new ConfigurationError(
      `API key for provider "${provider}" is not set. Go to Settings → Providers to configure it.`,
      'API_KEY_MISSING',
    )
  }

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
    case 'deepseek': {
      const { createDeepSeek } = await import('@ai-sdk/deepseek')
      return createDeepSeek({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model)
    }
    case 'xai': {
      const { createXai } = await import('@ai-sdk/xai')
      return createXai({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model)
    }
    case 'groq': {
      const { createGroq } = await import('@ai-sdk/groq')
      return createGroq({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model)
    }
    case 'mistral': {
      const { createMistral } = await import('@ai-sdk/mistral')
      return createMistral({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model)
    }
    case 'moonshot': {
      const { createMoonshotAI } = await import('@ai-sdk/moonshotai')
      return createMoonshotAI({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model)
    }
    case 'alibaba': {
      const { createAlibaba } = await import('@ai-sdk/alibaba')
      return createAlibaba({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model)
    }
    case 'openai-compatible':
    default: {
      const { createOpenAI } = await import('@ai-sdk/openai')
      return createOpenAI({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model)
    }
  }
}
