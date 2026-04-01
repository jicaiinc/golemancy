import { isLLMAnalyticsInitialized } from './posthog'

export function getAITelemetryConfig(params: {
  functionId: string
  analyticsEnabled?: boolean
  distinctId?: string
  conversationId?: string
  agentId?: string
  model?: string
}) {
  const metadata: Record<string, string> = {}
  if (params.distinctId) metadata.posthog_distinct_id = params.distinctId
  if (params.conversationId) metadata.conversation_id = params.conversationId
  if (params.agentId) metadata.agent_id = params.agentId
  if (params.model) metadata.model = params.model

  return {
    isEnabled: isLLMAnalyticsInitialized() && (params.analyticsEnabled ?? false),
    functionId: params.functionId,
    recordInputs: false,
    recordOutputs: false,
    metadata,
  }
}
