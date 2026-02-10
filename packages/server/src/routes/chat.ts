import { Hono } from 'hono'
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai'
import type {
  AgentId, ProjectId, ConversationId,
  IAgentService, IConversationService, ISettingsService,
} from '@solocraft/shared'
import { resolveModel } from '../agent/model'

export interface ChatRouteDeps {
  agentStorage: IAgentService
  conversationStorage: IConversationService
  settingsStorage: ISettingsService
}

export function createChatRoutes(deps: ChatRouteDeps) {
  const app = new Hono()

  app.post('/', async (c) => {
    const body = await c.req.json<{
      messages: UIMessage[]
      projectId: string
      agentId?: string
      conversationId?: string
    }>()

    const { messages, projectId, conversationId } = body
    let { agentId } = body

    if (!projectId) {
      return c.json({ error: 'projectId is required' }, 400)
    }
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return c.json({ error: 'messages is required' }, 400)
    }

    // Validate message structure and reject system role injection
    for (const msg of messages) {
      if (!msg.role || !msg.parts) {
        return c.json({ error: 'Each message must have role and parts' }, 400)
      }
      if (msg.role === 'system') {
        return c.json({ error: 'Messages with role "system" are not allowed' }, 400)
      }
    }

    // Resolve agentId — from body or from conversation lookup
    if (!agentId && conversationId) {
      const conv = await deps.conversationStorage.getById(
        projectId as ProjectId,
        conversationId as ConversationId,
      )
      if (conv) {
        agentId = conv.agentId
      }
    }

    if (!agentId) {
      return c.json({ error: 'agentId or conversationId is required' }, 400)
    }

    // Look up agent config
    const agent = await deps.agentStorage.getById(
      projectId as ProjectId,
      agentId as AgentId,
    )
    if (!agent) {
      return c.json({ error: `Agent ${agentId} not found` }, 404)
    }

    // Get global settings for model resolution
    const settings = await deps.settingsStorage.get()
    const model = await resolveModel(settings, agent.modelConfig)

    const modelMessages = await convertToModelMessages(messages)

    const result = streamText({
      model,
      system: agent.systemPrompt,
      messages: modelMessages,
      stopWhen: stepCountIs(10),
      temperature: agent.modelConfig.temperature,
      maxOutputTokens: agent.modelConfig.maxTokens,
    })

    return result.toUIMessageStreamResponse()
  })

  return app
}
