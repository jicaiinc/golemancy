import type { LanguageModel, streamText } from 'ai'
import type { GlobalSettings, AgentModelConfig } from '@golemancy/shared'
import type { OAuthManager } from '../auth/oauth-manager'
import { logger } from '../logger'
import { ConfigurationError } from './errors'

const log = logger.child({ component: 'agent:model' })

export interface ResolvedModel {
  model: LanguageModel
  /** Provider options to pass to streamText/generateText (e.g. store:false for Codex) */
  providerOptions?: Parameters<typeof streamText>[0]['providerOptions']
  /**
   * When true, system prompt must be passed via providerOptions.openai.instructions
   * instead of the `system` parameter. Required by the Codex Responses API.
   */
  useInstructionsParam?: boolean
}

/**
 * Build the `system` + `providerOptions` fields for streamText/generateText,
 * handling the Codex Responses API which requires `instructions` in providerOptions.
 */
export function buildSystemPromptOptions(
  resolved: ResolvedModel,
  systemPrompt: string | undefined,
): { system?: string; providerOptions?: ResolvedModel['providerOptions'] } {
  if (resolved.useInstructionsParam) {
    return {
      // Don't pass `system` — Codex ignores system messages in input
      providerOptions: {
        ...resolved.providerOptions,
        openai: {
          ...(resolved.providerOptions as Record<string, Record<string, unknown>> | undefined)?.openai,
          instructions: systemPrompt || 'You are a helpful assistant.',
        },
      },
    }
  }
  return {
    system: systemPrompt,
    providerOptions: resolved.providerOptions,
  }
}

export async function resolveModel(
  settings: GlobalSettings,
  agentConfig: AgentModelConfig,
  oauthManager?: OAuthManager,
): Promise<ResolvedModel> {
  const { provider, model } = agentConfig
  const entry = settings.providers[provider]
  if (!entry) {
    throw new ConfigurationError(
      `Provider "${provider}" is not configured. Go to Settings → Providers to add it.`,
      'PROVIDER_NOT_CONFIGURED',
    )
  }

  // OAuth path: use access token when OAuth is configured and connected
  if (entry.oauth?.accessToken && entry.oauthConfig) {
    const accessToken = oauthManager
      ? await oauthManager.getValidToken(provider)
      : entry.oauth.accessToken
    const { createOpenAI } = await import('@ai-sdk/openai')
    log.info({ provider, model, sdkType: entry.sdkType, auth: 'oauth', apiPath: 'responses' }, 'resolving model via OAuth (Responses API)')
    return {
      model: createOpenAI({
        apiKey: accessToken,
        baseURL: entry.oauthConfig.apiBaseUrl,
        headers: entry.oauth.accountId
          ? { 'ChatGPT-Account-Id': entry.oauth.accountId }
          : undefined,
      }).responses(model),
      // Codex API does not support store parameter — must be false
      providerOptions: { openai: { store: false } },
      // Codex Responses API requires system prompt via `instructions` providerOption
      useInstructionsParam: true,
    }
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
      return { model: createAnthropic({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model) }
    }
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai')
      return { model: createOpenAI({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model) }
    }
    case 'google': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
      return { model: createGoogleGenerativeAI({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model) }
    }
    case 'deepseek': {
      const { createDeepSeek } = await import('@ai-sdk/deepseek')
      return { model: createDeepSeek({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model) }
    }
    case 'xai': {
      const { createXai } = await import('@ai-sdk/xai')
      return { model: createXai({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model) }
    }
    case 'groq': {
      const { createGroq } = await import('@ai-sdk/groq')
      return { model: createGroq({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model) }
    }
    case 'mistral': {
      const { createMistral } = await import('@ai-sdk/mistral')
      return { model: createMistral({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model) }
    }
    case 'moonshot': {
      const { createMoonshotAI } = await import('@ai-sdk/moonshotai')
      return { model: createMoonshotAI({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model) }
    }
    case 'alibaba': {
      const { createAlibaba } = await import('@ai-sdk/alibaba')
      return { model: createAlibaba({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model) }
    }
    case 'openai-compatible':
    default: {
      const { createOpenAI } = await import('@ai-sdk/openai')
      return { model: createOpenAI({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model) }
    }
  }
}
