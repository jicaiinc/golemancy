import { Hono } from 'hono'
import {
  streamText, stepCountIs, convertToModelMessages,
  createUIMessageStream, createUIMessageStreamResponse,
  type UIMessage, type ModelMessage,
} from 'ai'
import type {
  AgentId, ProjectId, ConversationId, MessageId, TeamId, TargetType, CompactRecord, Message, TeamMember,
  IAgentService, IProjectService, IConversationService, ISettingsService, IMCPService, IPermissionsConfigService, ITeamService,
  AgentStatus,
} from '@golemancy/shared'
import { DEFAULT_COMPACT_THRESHOLD, DEFAULT_MAX_STEPS, resolveAgentId } from '@golemancy/shared'
import { getAITelemetryConfig } from '../telemetry/ai-telemetry'
import type { SqliteConversationTaskStorage } from '../storage/tasks'
import type { SqliteMemoryStorage } from '../storage/memories'
import type { TokenRecordStorage } from '../storage/token-records'
import type { CompactRecordStorage } from '../storage/compact-records'
import type { ActiveChatRegistry } from '../agent/active-chat-registry'
import type { WebSocketManager } from '../ws/handler'
import type { OAuthManager } from '../auth/oauth-manager'
import { resolveModel, buildSystemPromptOptions } from '../agent/model'
import { ConfigurationError } from '../agent/errors'
import { loadAgentTools, buildBehaviorDirective } from '../agent/tools'
import { buildMessagesForModel, compactConversation } from '../agent/compact'
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
  memoryStorage: SqliteMemoryStorage
  tokenRecordStorage: TokenRecordStorage
  compactRecordStorage: CompactRecordStorage
  activeChatRegistry?: ActiveChatRegistry
  wsManager?: WebSocketManager
  teamStorage: ITeamService
  oauthManager?: OAuthManager
}

export function createChatRoutes(deps: ChatRouteDeps) {
  const app = new Hono()

  app.post('/', async (c) => {
    const body = await c.req.json<{
      messages: UIMessage[]
      projectId: string
      targetType?: string
      targetId?: string
      conversationId?: string
    }>()

    const { messages, projectId, conversationId } = body
    let targetType = body.targetType as TargetType | undefined
    let targetId = body.targetId as (AgentId | TeamId) | undefined

    if (!projectId) {
      return c.json({ error: 'PROJECT_ID_REQUIRED' }, 400)
    }
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return c.json({ error: 'MESSAGES_REQUIRED' }, 400)
    }

    // Validate message structure and whitelist allowed roles
    for (const msg of messages) {
      if (!msg.role || !Array.isArray(msg.parts)) {
        return c.json({ error: 'INVALID_MESSAGE_FORMAT' }, 400)
      }
      if (msg.role !== 'user' && msg.role !== 'assistant') {
        return c.json({ error: 'INVALID_MESSAGE_ROLE' }, 400)
      }
    }

    // Resolve target from body or from conversation lookup
    if (!targetType && conversationId) {
      const conv = await deps.conversationStorage.getById(
        projectId as ProjectId,
        conversationId as ConversationId,
      )
      if (conv) {
        targetType = conv.targetType
        targetId = conv.targetId
      }
    }

    if (!targetType || !targetId) {
      return c.json({ error: 'TARGET_REQUIRED' }, 400)
    }
    if (targetType !== 'agent' && targetType !== 'team') {
      return c.json({ error: 'INVALID_TARGET_TYPE' }, 400)
    }

    // Resolve team for sub-agent orchestration
    let team: import('@golemancy/shared').Team | undefined
    let teamMembers: TeamMember[] | undefined
    let teamInstruction: string | undefined
    if (targetType === 'team') {
      const t = await deps.teamStorage.getById(projectId as ProjectId, targetId as TeamId)
      if (t) {
        team = t
        teamMembers = t.members
        teamInstruction = t.instruction
      }
    }

    // Resolve agentId from target
    let agentId: AgentId
    try {
      agentId = resolveAgentId(targetType, targetId, team)
    } catch (err) {
      log.warn({ err, targetType, targetId }, 'failed to resolve agent from target')
      return c.json({ error: 'AGENT_RESOLVE_FAILED' }, 400)
    }

    // Look up agent config
    const agent = await deps.agentStorage.getById(
      projectId as ProjectId,
      agentId,
    )
    if (!agent) {
      return c.json({ error: 'AGENT_NOT_FOUND' }, 404)
    }

    // Get project config for permissions config reference
    const project = await deps.projectStorage.getById(projectId as ProjectId)
    const chatConvId = conversationId ?? `ephemeral-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    let chatMarkedRunning = false

    // AbortController for this chat — allows project deletion to abort in-flight streams.
    // Forward the request signal so that client disconnect also aborts.
    const chatAbortController = new AbortController()
    if (c.req.raw.signal.aborted) {
      chatAbortController.abort()
    } else {
      c.req.raw.signal.addEventListener('abort', () => chatAbortController.abort(), { once: true })
    }

    const setAgentStatus = async (status: AgentStatus) => {
      await deps.agentStorage.update(projectId as ProjectId, agentId as AgentId, { status })
      if (deps.wsManager) {
        deps.wsManager.emit(`project:${projectId}`, { event: 'agent:status_changed', agentId: agentId as AgentId, status })
      }
    }

    const markChatRunning = async () => {
      if (deps.activeChatRegistry) {
        deps.activeChatRegistry.register(chatConvId, { agentId, projectId, abortController: chatAbortController })
      }
      chatMarkedRunning = true
      await setAgentStatus('running')
      if (deps.wsManager) {
        deps.wsManager.emit(`project:${projectId}`, { event: 'runtime:chat_started', projectId, agentId: agentId as AgentId, conversationId: conversationId as ConversationId | undefined })
      }
    }

    const persistErrorMessage = async (errorMessage: string) => {
      if (!conversationId) return
      try {
        await deps.conversationStorage.saveMessage(
          projectId as ProjectId,
          conversationId as ConversationId,
          {
            id: generateId('msg'),
            role: 'assistant',
            parts: [{ type: 'text', text: errorMessage }],
            content: errorMessage,
            provider: agent.modelConfig.provider,
            model: agent.modelConfig.model,
            metadata: { status: 'error', error: errorMessage },
          },
        )
      } catch (persistErr) {
        log.warn({ err: persistErr, conversationId }, 'failed to persist chat error message')
      }
    }

    const markChatEnded = async (finalStatus: AgentStatus = 'idle') => {
      try {
        if (deps.activeChatRegistry) {
          deps.activeChatRegistry.unregister(chatConvId)
          const remaining = deps.activeChatRegistry.countByAgent(agentId!)
          if (remaining === 0) {
            await setAgentStatus(finalStatus)
          }
        } else if (chatMarkedRunning || finalStatus === 'error') {
          await setAgentStatus(finalStatus)
        }
        if (deps.wsManager && chatMarkedRunning) {
          deps.wsManager.emit(`project:${projectId}`, { event: 'runtime:chat_ended', projectId, agentId: agentId as AgentId, conversationId: conversationId as ConversationId | undefined })
        }
      } catch (err) {
        log.warn({ err, agentId, finalStatus }, 'failed to finalize agent chat status')
      }
    }

    try {
      // Get global settings for model resolution
      const settings = await deps.settingsStorage.get()
      const resolved = await resolveModel(settings, agent.modelConfig, deps.oauthManager)

      log.debug({
        projectId, agentId, conversationId, messageCount: messages.length,
        provider: agent.modelConfig.provider,
        model: agent.modelConfig.model,
        useInstructionsParam: resolved.useInstructionsParam ?? false,
      }, 'starting chat stream')

      // --- Agent status lifecycle: mark running ---
      try {
        await markChatRunning()
      } catch (err) {
        log.warn({ err, agentId }, 'failed to set agent running status')
      }

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
      const allAgents = (teamMembers && teamMembers.length > 0)
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
      conversationStorage: deps.conversationStorage,
      taskStorage: deps.taskStorage,
      memoryStorage: deps.memoryStorage,
      tokenRecordStorage: deps.tokenRecordStorage,
      teamMembers,
      teamInstruction,
      oauthManager: deps.oauthManager,
      onTokenUsage: (usage) => {
        streamWriter?.write({
          type: 'data-usage' as `data-${string}`,
          data: usage,
        })
      },
    })

    const allTools = agentToolsResult.tools
    const systemPromptParts = [agent.systemPrompt, buildBehaviorDirective(), agentToolsResult.instructions].filter(Boolean)
    const systemPrompt = systemPromptParts.join('\n\n')

    // Rehydrate upload references/HTTP URLs back to data URLs for AI consumption
    const rehydratedMessages = await Promise.all(
      messages.map(async (msg) => ({
        ...msg,
        parts: (await rehydrateUploadsForAI(projectId, msg.parts)) as UIMessage['parts'],
      })),
    )

    // --- Auto-compact: prepare inputs (actual execution happens inside SSE stream) ---
    let compactInputs: { allModelMsgs: ModelMessage[]; lastAssistant: Message; totalTokens: number; threshold: number } | null = null
    if (conversationId) {
      const threshold = agent.compactThreshold ?? DEFAULT_COMPACT_THRESHOLD
      if (threshold > 0) {
        const conv = await deps.conversationStorage.getById(
          projectId as ProjectId, conversationId as ConversationId,
        )
        if (conv) {
          const lastAssistant = conv.messages.filter(m => m.role === 'assistant').at(-1)
          const totalTokens = lastAssistant?.contextTokens ?? 0

          log.debug({ conversationId, totalTokens, threshold, hasLastAssistant: !!lastAssistant }, 'auto-compact check')

          if (totalTokens >= threshold && lastAssistant) {
            const boundaryIdx = conv.messages.indexOf(lastAssistant)
            const messagesToCompact = conv.messages.slice(0, boundaryIdx + 1)
            const allUiMsgs: UIMessage[] = messagesToCompact.map(m => ({
              id: m.id, role: m.role, parts: m.parts as UIMessage['parts'],
            }))
            const allModelMsgs = await convertToModelMessages(allUiMsgs, { ignoreIncompleteToolCalls: true })
            compactInputs = { allModelMsgs, lastAssistant, totalTokens, threshold }
          }
        }
      }
    }

    const hasTools = Object.keys(allTools).length > 0

    let cleaned = false
    const ensureCleanup = async () => {
      if (cleaned) return
      cleaned = true
      await agentToolsResult.cleanup()
      await markChatEnded()
    }

    const toolWarnings = agentToolsResult.warnings
    const modeDegradation = agentToolsResult.degradation
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
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

        // --- Auto-compact: run inside SSE stream so we can send progress events ---
        let compactPerformed: CompactRecord | null = null
        if (compactInputs) {
          log.info({ conversationId, totalTokens: compactInputs.totalTokens, threshold: compactInputs.threshold }, 'auto-compact triggered (pre-processing)')
          writer.write({ type: 'data-compact' as `data-${string}`, data: { status: 'started' } })

          try {
            const compactResult = await compactConversation({
              messages: compactInputs.allModelMsgs,
              resolved,
              systemPrompt: agent.systemPrompt,
              signal: chatAbortController.signal,
              analyticsEnabled: settings.productAnalyticsEnabled ?? true,
              onProgress: (info) => {
                writer.write({ type: 'data-compact' as `data-${string}`, data: { status: 'progress', generatedChars: info.generatedChars } })
              },
            })

            compactPerformed = await deps.compactRecordStorage.save(projectId as ProjectId, {
              conversationId: conversationId as ConversationId,
              summary: compactResult.summary,
              boundaryMessageId: compactInputs.lastAssistant.id as MessageId,
              inputTokens: compactResult.inputTokens,
              outputTokens: compactResult.outputTokens,
              trigger: 'auto',
            })

            deps.tokenRecordStorage.save(projectId as ProjectId, {
              conversationId, agentId: agentId as string,
              provider: agent.modelConfig.provider, model: agent.modelConfig.model,
              inputTokens: compactResult.inputTokens, outputTokens: compactResult.outputTokens,
              source: 'compact',
            })

            log.info({ conversationId, compactId: compactPerformed.id }, 'auto-compact completed')
            writer.write({ type: 'data-compact' as `data-${string}`, data: { status: 'completed', record: compactPerformed } })
            writer.write({ type: 'data-usage' as `data-${string}`, data: { inputTokens: compactResult.inputTokens, outputTokens: compactResult.outputTokens } })
          } catch (err) {
            // If abort triggered during compact, bail out entirely
            if (chatAbortController.signal.aborted) {
              log.info({ conversationId }, 'auto-compact aborted by user, ending chat')
              writer.write({ type: 'data-compact' as `data-${string}`, data: { status: 'aborted' } })
              await ensureCleanup()
              return
            }
            log.error({ err, conversationId, totalTokens: compactInputs.totalTokens, threshold: compactInputs.threshold }, 'auto-compact failed, skipping — will use full message history')
            writer.write({ type: 'data-compact' as `data-${string}`, data: { status: 'failed' } })
          }
        }

        // --- Build messages for model (depends on compact result) ---
        const latestCompact = compactPerformed
          ?? (conversationId
            ? await deps.compactRecordStorage.getLatest(projectId as ProjectId, conversationId as ConversationId)
            : null)
        const messagesForModel = buildMessagesForModel(rehydratedMessages, latestCompact)

        // ignoreIncompleteToolCalls: AI SDK built-in defense — silently drops tool-call
        // parts that lack a corresponding tool-result (left over from previous aborts).
        const modelMessages = await convertToModelMessages(messagesForModel, { ignoreIncompleteToolCalls: true })

        // --- Chat stream ---
        const toolNames = hasTools ? Object.keys(allTools) : []
        log.debug({
          conversationId, toolCount: toolNames.length, toolNames,
          provider: agent.modelConfig.provider, model: agent.modelConfig.model,
          useInstructionsParam: resolved.useInstructionsParam ?? false,
        }, 'calling streamText')

        let stepIndex = 0
        let lastFinishReason: string | undefined
        const result = streamText({
          model: resolved.model,
          ...buildSystemPromptOptions(resolved, systemPrompt),
          messages: modelMessages,
          tools: hasTools ? allTools : undefined,
          stopWhen: hasTools ? stepCountIs(DEFAULT_MAX_STEPS) : undefined,
          abortSignal: chatAbortController.signal,
          experimental_telemetry: getAITelemetryConfig({
            functionId: 'chat',
            analyticsEnabled: settings.productAnalyticsEnabled ?? true,
            distinctId: settings.analyticsDistinctId,
            conversationId,
            agentId: agent.id,
            model: agent.modelConfig?.model,
          }),
          onStepFinish: ({ usage, finishReason, toolCalls }) => {
            stepIndex++
            lastFinishReason = finishReason
            const calledTools = toolCalls?.map(tc => tc.toolName) ?? []
            log.debug({
              conversationId, step: stepIndex, finishReason,
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
              totalTokens: usage.totalTokens ?? 0,
              ...(calledTools.length > 0 ? { toolCalls: calledTools } : {}),
            }, 'step finished')

            // Warn when model had tools available but chose not to call any
            if (stepIndex === 1 && finishReason === 'stop' && hasTools && calledTools.length === 0) {
              log.warn({
                conversationId, provider: agent.modelConfig.provider, model: agent.modelConfig.model,
                availableToolCount: toolNames.length,
              }, 'model finished without calling any tools despite tools being available — the model may not support tool calling properly')
            }
          },
          onFinish: ensureCleanup,
          onAbort: async ({ steps }) => {
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
              if (deps.wsManager) {
                deps.wsManager.emit(`project:${projectId}`, { event: 'token:recorded', projectId, agentId: agentId as AgentId, model: agent.modelConfig.model, inputTokens, outputTokens })
              }
              log.debug({ conversationId, inputTokens, outputTokens, completedSteps: steps.length }, 'saved abort token record')
            } catch (err) {
              log.error({ err, conversationId }, 'failed to save abort token record')
            }
            await ensureCleanup()
          },
        })

        // --- Per-step token usage tracking via messageMetadata ---
        let currentStepToolCallIds: string[] = []
        let allToolUsages: Record<string, { inputTokens: number; outputTokens: number }> = {}

        writer.merge(result.toUIMessageStream({
          originalMessages: rehydratedMessages,
          generateMessageId: () => generateId('msg'),
          messageMetadata: ({ part }) => {
            if (part.type === 'tool-call') {
              currentStepToolCallIds.push(part.toolCallId)
            }
            if (part.type === 'finish-step') {
              const ids = [...currentStepToolCallIds]
              currentStepToolCallIds = []
              if (ids.length === 0) return undefined
              const stepUsage = {
                inputTokens: part.usage.inputTokens ?? 0,
                outputTokens: part.usage.outputTokens ?? 0,
              }
              const entries = Object.fromEntries(ids.map(id => [id, stepUsage]))
              Object.assign(allToolUsages, entries)
              return { toolUsages: entries }
            }
          },
          onFinish: async ({ responseMessage, isAborted }) => {
            // AI SDK v6 calls this even on aborted streams.
            // Skip persistence to avoid saving partial messages and double token records.
            if (isAborted) {
              log.debug({ conversationId }, 'skipping assistant persistence — chat was aborted')
              return
            }
            try {
              const lastStepUsage = await result.usage
              const billingUsage = await result.totalUsage
              const contextTokens = lastStepUsage.totalTokens ?? 0
              const billingInput = billingUsage.inputTokens ?? 0
              const billingOutput = billingUsage.outputTokens ?? 0

              if (conversationId) {
                const extractedParts = await extractUploads(projectId, responseMessage.parts)
                await deps.conversationStorage.saveMessage(
                  projectId as ProjectId,
                  conversationId as ConversationId,
                  {
                    id: responseMessage.id as MessageId,
                    role: 'assistant',
                    parts: extractedParts,
                    content: extractTextContent(responseMessage.parts),
                    contextTokens,
                    provider: agent.modelConfig.provider,
                    model: agent.modelConfig.model,
                    ...(Object.keys(allToolUsages).length > 0 ? { metadata: { toolUsages: allToolUsages } } : {}),
                  },
                )
                log.info({ conversationId, agentId, inputTokens: billingInput, outputTokens: billingOutput }, 'agent response complete')
                log.debug({ conversationId, role: 'assistant', contextTokens, billingInput, billingOutput }, 'saved assistant message in onFinish')
              }

              deps.tokenRecordStorage.save(projectId as ProjectId, {
                conversationId,
                messageId: responseMessage.id,
                agentId: agentId as string,
                provider: agent.modelConfig.provider,
                model: agent.modelConfig.model,
                inputTokens: billingInput,
                outputTokens: billingOutput,
                source: 'chat',
              })

              if (deps.wsManager) {
                deps.wsManager.emit(`project:${projectId}`, { event: 'token:recorded', projectId, agentId: agentId as AgentId, model: agent.modelConfig.model, inputTokens: billingInput, outputTokens: billingOutput })
              }

              writer.write({
                type: 'data-usage' as `data-${string}`,
                data: { contextTokens, inputTokens: billingInput, outputTokens: billingOutput },
              })

              // Notify client when agent was cut off by max steps limit
              if (stepIndex >= DEFAULT_MAX_STEPS && lastFinishReason === 'tool-calls') {
                log.info({ conversationId, stepIndex, maxSteps: DEFAULT_MAX_STEPS }, 'agent hit max steps limit')
                writer.write({
                  type: 'data-max_steps_reached' as `data-${string}`,
                  data: { steps: stepIndex, maxSteps: DEFAULT_MAX_STEPS },
                })
              }

            } catch (err) {
              log.error({ err, conversationId }, 'failed to save assistant message')
            }
          },
        }))
      },
    })

      return createUIMessageStreamResponse({ stream })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      log.error({ err, projectId, agentId, conversationId }, 'chat route failed')
      await persistErrorMessage(errorMessage)
      await markChatEnded('error')
      throw err
    }
  })

  return app
}
