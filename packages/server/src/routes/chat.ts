import { Hono } from 'hono'
import {
  streamText, stepCountIs, convertToModelMessages,
  createUIMessageStream, createUIMessageStreamResponse,
  type UIMessage,
} from 'ai'
import type {
  AgentId, ProjectId, ConversationId, MessageId,
  IAgentService, IProjectService, IConversationService, ISettingsService, IMCPService, IPermissionsConfigService,
} from '@golemancy/shared'
import type { SqliteConversationTaskStorage } from '../storage/tasks'
import type { TokenRecordStorage } from '../storage/token-records'
import { resolveModel } from '../agent/model'
import { loadAgentTools } from '../agent/tools'
import { generateId } from '../utils/ids'
import { extractUploads, rehydrateUploadsForAI } from '../utils/message-parts'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:chat' })

function extractTextContent(parts: UIMessage['parts']): string {
  return parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map(p => p.text)
    .join('\n')
}

export interface ChatRouteDeps {
  agentStorage: IAgentService
  projectStorage: IProjectService
  conversationStorage: IConversationService
  settingsStorage: ISettingsService
  mcpStorage: IMCPService
  permissionsConfigStorage: IPermissionsConfigService
  taskStorage: SqliteConversationTaskStorage
  tokenRecordStorage: TokenRecordStorage
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

    // Validate message structure and whitelist allowed roles
    for (const msg of messages) {
      if (!msg.role || !Array.isArray(msg.parts)) {
        return c.json({ error: 'Each message must have role and parts' }, 400)
      }
      if (msg.role !== 'user' && msg.role !== 'assistant') {
        return c.json({ error: `Invalid message role: "${msg.role}"` }, 400)
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

    // Get project config for permissions config reference
    const project = await deps.projectStorage.getById(projectId as ProjectId)

    // Get global settings for model resolution
    const settings = await deps.settingsStorage.get()
    const model = await resolveModel(settings, agent.modelConfig)

    log.debug({ projectId, agentId, conversationId, messageCount: messages.length }, 'starting chat stream')

    // Save user's latest message before streaming (extract base64 uploads to disk)
    if (conversationId) {
      try {
        const lastUserMsg = messages.filter(m => m.role === 'user').at(-1)
        if (lastUserMsg) {
          const extractedParts = await extractUploads(projectId, lastUserMsg.parts)
          // Update in-place so the extracted references are used for AI rehydration below
          lastUserMsg.parts = extractedParts as UIMessage['parts']
          await deps.conversationStorage.saveMessage(
            projectId as ProjectId,
            conversationId as ConversationId,
            {
              id: lastUserMsg.id as MessageId,
              role: 'user',
              parts: extractedParts,
              content: extractTextContent(lastUserMsg.parts),
            },
          )
        }
      } catch (err) {
        log.error({ err, conversationId }, 'failed to save user message')
      }
    }

    // Load all tools via unified entry point (skills, MCP, built-in, sub-agents)
    const allAgents = agent.subAgents?.length > 0
      ? await deps.agentStorage.list(projectId as ProjectId)
      : []

    // Late-bound writer reference — assigned inside createUIMessageStream execute(),
    // but sub-agent tools only invoke during streaming so writer is always available.
    let streamWriter: Parameters<Parameters<typeof createUIMessageStream>[0]['execute']>[0]['writer'] | undefined

    const agentToolsResult = await loadAgentTools({
      agent, projectId, settings, allAgents,
      mcpStorage: deps.mcpStorage,
      permissionsConfigId: project?.config.permissionsConfigId,
      permissionsConfigStorage: deps.permissionsConfigStorage,
      conversationId,
      taskStorage: deps.taskStorage,
      tokenRecordStorage: deps.tokenRecordStorage,
      onTokenUsage: (usage) => {
        streamWriter?.write({
          type: 'data-usage' as `data-${string}`,
          data: usage,
        })
      },
    })

    const allTools = agentToolsResult.tools
    const systemPrompt = agentToolsResult.instructions
      ? agent.systemPrompt + '\n\n' + agentToolsResult.instructions
      : agent.systemPrompt

    // Rehydrate upload references/HTTP URLs back to data URLs for AI consumption
    const rehydratedMessages = await Promise.all(
      messages.map(async (msg) => ({
        ...msg,
        parts: (await rehydrateUploadsForAI(projectId, msg.parts)) as UIMessage['parts'],
      })),
    )

    const modelMessages = await convertToModelMessages(rehydratedMessages)
    const hasTools = Object.keys(allTools).length > 0

    let cleaned = false
    const ensureCleanup = async () => {
      if (cleaned) return
      cleaned = true
      await agentToolsResult.cleanup()
    }

    const result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      tools: hasTools ? allTools : undefined,
      stopWhen: hasTools ? stepCountIs(10) : undefined,
      abortSignal: c.req.raw.signal,
      onFinish: ensureCleanup,
      onAbort: async ({ steps }) => {
        // Sum usage from completed steps (empty for single-step abort)
        let inputTokens = 0, outputTokens = 0
        for (const step of steps) {
          inputTokens += step.usage?.inputTokens ?? 0
          outputTokens += step.usage?.outputTokens ?? 0
        }
        try {
          deps.tokenRecordStorage.save(projectId as ProjectId, {
            conversationId,
            agentId: agentId as string,
            provider: agent.modelConfig.provider,
            model: agent.modelConfig.model,
            inputTokens,
            outputTokens,
            source: 'chat',
            aborted: true,
          })
          log.debug({ conversationId, inputTokens, outputTokens, completedSteps: steps.length }, 'saved abort token record')
        } catch (err) {
          log.error({ err, conversationId }, 'failed to save abort token record')
        }
        await ensureCleanup()
      },
    })

    // Wrap in createUIMessageStream to inject transient warnings before LLM output
    const toolWarnings = agentToolsResult.warnings
    const modeDegradation = agentToolsResult.degradation
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        // Bind writer so sub-agent onTokenUsage callback can emit SSE events
        streamWriter = writer

        // Send mode degradation event if permission mode was downgraded
        if (modeDegradation) {
          writer.write({
            type: 'data-mode_degraded' as `data-${string}`,
            data: {
              requestedMode: modeDegradation.requestedMode,
              actualMode: modeDegradation.actualMode,
              reason: modeDegradation.reason,
            },
            transient: true,
          })
        }

        // Send tool loading warnings as transient data (not persisted in message history)
        for (const warning of toolWarnings) {
          writer.write({
            type: 'data-warning' as `data-${string}`,
            data: { message: warning },
            transient: true,
          })
        }

        // Merge the LLM stream
        writer.merge(result.toUIMessageStream({
          originalMessages: rehydratedMessages,
          generateMessageId: () => generateId('msg'),
          onFinish: async ({ responseMessage }) => {
            try {
              // Capture total token usage from the stream
              const usage = await result.totalUsage
              const inputTokens = usage.inputTokens ?? 0
              const outputTokens = usage.outputTokens ?? 0
              const totalTokens = usage.totalTokens ?? 0

              if (conversationId) {
                // Extract any base64 images from assistant response before saving
                const extractedParts = await extractUploads(projectId, responseMessage.parts)
                await deps.conversationStorage.saveMessage(
                  projectId as ProjectId,
                  conversationId as ConversationId,
                  {
                    id: responseMessage.id as MessageId,
                    role: 'assistant',
                    parts: extractedParts,
                    content: extractTextContent(responseMessage.parts),
                    inputTokens,
                    outputTokens,
                    provider: agent.modelConfig.provider,
                    model: agent.modelConfig.model,
                  },
                )
                log.debug({ conversationId, role: 'assistant', inputTokens, outputTokens }, 'saved assistant message in onFinish')
              }

              // Write token_record for this API call
              deps.tokenRecordStorage.save(projectId as ProjectId, {
                conversationId,
                messageId: responseMessage.id,
                agentId: agentId as string,
                provider: agent.modelConfig.provider,
                model: agent.modelConfig.model,
                inputTokens,
                outputTokens,
                source: 'chat',
              })

              // Send token usage data to client
              writer.write({
                type: 'data-usage' as `data-${string}`,
                data: { inputTokens, outputTokens, totalTokens },
              })
            } catch (err) {
              log.error({ err, conversationId }, 'failed to save assistant message')
            }
          },
        }))
      },
    })

    return createUIMessageStreamResponse({ stream })
  })

  return app
}
