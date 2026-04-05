import { withTracing } from '@posthog/ai/vercel'
import { getLLMAnalyticsClient } from './posthog'

export function wrapModelForAnalytics<T>(
  model: T,
  params: {
    functionId: string
    analyticsEnabled?: boolean
    distinctId?: string
    conversationId?: string
    agentId?: string
  },
): T {
  const client = getLLMAnalyticsClient()
  if (!client || !(params.analyticsEnabled ?? false)) return model

  // withTracing preserves the model type at runtime; cast to satisfy
  // the @posthog/ai LanguageModel union which re-exports from @ai-sdk/provider
  return withTracing(model as Parameters<typeof withTracing>[0], client, {
    posthogDistinctId: params.distinctId,
    posthogPrivacyMode: true,
    posthogProperties: {
      functionId: params.functionId,
      ...(params.conversationId && { conversation_id: params.conversationId }),
      ...(params.agentId && { agent_id: params.agentId }),
    },
  }) as T
}
