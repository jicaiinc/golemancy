import { Hono } from 'hono'
import { streamText, stepCountIs, convertToModelMessages, type UIMessage, type ToolSet } from 'ai'
import type {
  AgentId, ProjectId, ConversationId, MessageId,
  IAgentService, IConversationService, ISettingsService,
} from '@solocraft/shared'
import { resolveModel } from '../agent/model'
import { loadAgentSkillTools } from '../agent/skills'
import { loadSubAgentTools } from '../agent/sub-agent'
import { loadAgentMcpTools } from '../agent/mcp'
import { loadBuiltinTools } from '../agent/builtin-tools'
import { generateId } from '../utils/ids'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:chat' })

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

    log.debug({ projectId, agentId, conversationId, messageCount: messages.length }, 'starting chat stream')

    // Save user's latest message before streaming
    if (conversationId) {
      const lastUserMsg = messages.filter(m => m.role === 'user').at(-1)
      if (lastUserMsg) {
        const textContent = lastUserMsg.parts
          .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map(p => p.text)
          .join('')
        if (textContent) {
          await deps.conversationStorage.saveMessage(
            projectId as ProjectId,
            conversationId as ConversationId,
            {
              id: lastUserMsg.id as MessageId,
              role: 'user',
              content: textContent,
            },
          )
        }
      }
    }

    // --- Load tools from all 4 sources ---

    // 1. Skill tools (existing)
    let skillTools: Awaited<ReturnType<typeof loadAgentSkillTools>> = null
    if (agent.skillIds?.length > 0) {
      skillTools = await loadAgentSkillTools(projectId, agent.skillIds)
    }

    // 2. Sub-agent tools (each sub-agent gets its own skills/MCP/built-in tools)
    let subAgentResult: Awaited<ReturnType<typeof loadSubAgentTools>> | null = null
    if (agent.subAgents?.length > 0) {
      const allAgents = await deps.agentStorage.list(projectId as ProjectId)
      subAgentResult = await loadSubAgentTools(agent, allAgents, settings, projectId)
    }

    // 3. MCP tools
    let mcpTools: Awaited<ReturnType<typeof loadAgentMcpTools>> = null
    if (agent.mcpServers?.length > 0) {
      mcpTools = await loadAgentMcpTools(agent.mcpServers)
    }

    // 4. Built-in tools
    let builtinToolsResult: Awaited<ReturnType<typeof loadBuiltinTools>> = null
    if (agent.builtinTools) {
      builtinToolsResult = await loadBuiltinTools(agent.builtinTools)
    }

    // Merge all tools
    const allTools: ToolSet = {
      ...(skillTools?.tools ?? {}),
      ...(subAgentResult?.tools ?? {}),
      ...(mcpTools?.tools ?? {}),
      ...(builtinToolsResult?.tools ?? {}),
    }

    // Build system prompt
    const systemPrompt = skillTools?.instructions
      ? agent.systemPrompt + '\n\n' + skillTools.instructions
      : agent.systemPrompt

    const modelMessages = await convertToModelMessages(messages)
    const hasTools = Object.keys(allTools).length > 0

    const result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      tools: hasTools ? allTools : undefined,
      stopWhen: hasTools ? stepCountIs(10) : undefined,
      temperature: agent.modelConfig.temperature,
      maxOutputTokens: agent.modelConfig.maxTokens,
      onFinish: async ({ text }) => {
        // Clean up all tool sources (including sub-agent child tools)
        await skillTools?.cleanup()
        await subAgentResult?.cleanup()
        await mcpTools?.cleanup()
        await builtinToolsResult?.cleanup()

        try {
          if (conversationId && text) {
            await deps.conversationStorage.saveMessage(
              projectId as ProjectId,
              conversationId as ConversationId,
              {
                id: generateId('msg') as MessageId,
                role: 'assistant',
                content: text,
              },
            )
            log.debug({ conversationId, role: 'assistant' }, 'saved assistant message in onFinish')
          }
        } catch (err) {
          log.error({ err, conversationId }, 'failed to save assistant message')
        }
      },
    })

    return result.toUIMessageStreamResponse()
  })

  return app
}
