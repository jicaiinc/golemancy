import { streamText, stepCountIs, type ModelMessage, type ToolSet } from 'ai'
import type { Agent, ConversationId, GlobalSettings } from '@golemancy/shared'
import { DEFAULT_MAX_STEPS } from '@golemancy/shared'
import { resolveModel } from './model'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:runtime' })

export interface AgentEvent {
  type: 'tool_call' | 'token_usage' | 'step_finish'
  toolName?: string
  input?: unknown
  usage?: { inputTokens: number; outputTokens: number }
}

export interface RunAgentParams {
  agent: Agent
  settings: GlobalSettings
  messages: ModelMessage[]
  conversationId: ConversationId
  tools?: ToolSet
  abortSignal?: AbortSignal
  onEvent?: (event: AgentEvent) => void
}

export async function runAgent(params: RunAgentParams) {
  const { agent, settings, messages, tools, abortSignal, onEvent } = params

  log.info({ agentId: agent.id, conversationId: params.conversationId, messageCount: messages.length }, 'running agent')

  const model = await resolveModel(settings, agent.modelConfig)

  const result = streamText({
    model,
    system: agent.systemPrompt,
    messages,
    tools,
    stopWhen: stepCountIs(DEFAULT_MAX_STEPS),
    abortSignal,
    onStepFinish: ({ toolCalls, usage }) => {
      if (onEvent) {
        if (toolCalls) {
          for (const tc of toolCalls) {
            onEvent({ type: 'tool_call', toolName: tc.toolName, input: tc.input })
          }
        }
        if (usage) {
          onEvent({
            type: 'token_usage',
            usage: { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 },
          })
        }
      }
    },
  })

  return result
}
