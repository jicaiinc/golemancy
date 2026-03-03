import { tool, streamText, stepCountIs, convertToModelMessages, type ToolSet, type UIMessage } from 'ai'
import { z } from 'zod'
import type { Agent, GlobalSettings, ProjectId, AgentId, ConversationId, IMCPService, IConversationService, IPermissionsConfigService, SubAgentStreamState } from '@golemancy/shared'
import { DEFAULT_MAX_STEPS } from '@golemancy/shared'
import type { SqliteConversationTaskStorage } from '../storage/tasks'
import type { TokenRecordStorage } from '../storage/token-records'
import { resolveModel } from './model'
import type { LoadAgentToolsParams, AgentToolsResult } from './tools'
import { generateId } from '../utils/ids'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:sub-agent' })

/**
 * Sanitize a string into a valid tool name.
 * Must start with a letter or underscore, contain only [a-zA-Z0-9_.\-:], max 64 chars.
 * Required by providers like Google Gemini that enforce strict tool naming.
 */
export function sanitizeToolName(name: string): string {
  let sanitized = name.replace(/[^a-zA-Z0-9_.\-:]/g, '_')
  if (sanitized && !/^[a-zA-Z_]/.test(sanitized)) {
    sanitized = '_' + sanitized
  }
  sanitized = sanitized.replace(/_+/g, '_')
  sanitized = sanitized.replace(/_$/, '')
  return sanitized.slice(0, 64) || 'unnamed_tool'
}

type LoadToolsFn = (params: LoadAgentToolsParams) => Promise<AgentToolsResult>

const TEXT_THROTTLE_MS = 100

/**
 * Build assistant message parts from SubAgentStreamState.
 * Format matches the tool-invocation part structure used in conversations.
 */
function buildAssistantParts(state: SubAgentStreamState): unknown[] {
  const parts: unknown[] = []

  for (const tc of state.toolCalls) {
    parts.push({
      type: 'tool-invocation',
      toolInvocation: {
        toolCallId: tc.id,
        toolName: tc.name,
        args: tc.input,
        state: tc.state === 'done' ? 'result' : 'call',
        ...(tc.output != null ? { result: tc.output } : {}),
      },
    })
  }

  if (state.text) {
    parts.push({ type: 'text', text: state.text })
  }

  return parts
}

/**
 * Create a single sub-agent delegate tool.
 *
 * The tool is a lightweight shell — it only loads the child agent's tools
 * when `execute()` is called, using the injected `loadTools` function.
 * This enables infinite nesting depth controlled purely by agent config.
 *
 * execute() is an async generator that yields SubAgentStreamState as
 * preliminary tool results, enabling real-time streaming of sub-agent progress.
 */
export function createSubAgentTool(
  childAgent: Agent,
  allAgents: Agent[],
  settings: GlobalSettings,
  projectId: string,
  loadTools: LoadToolsFn,
  mcpStorage: IMCPService,
  permissionsConfigStorage: IPermissionsConfigService,
  conversationId?: string,
  conversationStorage?: IConversationService,
  taskStorage?: SqliteConversationTaskStorage,
  tokenRecordStorage?: TokenRecordStorage,
  kbStorage?: import('../storage/knowledge-base').KnowledgeBaseStorage,
  onTokenUsage?: (usage: { inputTokens: number; outputTokens: number }) => void,
) {
  return tool({
    description: `Delegate task to sub-agent "${childAgent.name}": ${childAgent.description}. Returns a sessionId in the result — pass it back in subsequent calls to maintain conversation context.`,
    inputSchema: z.object({
      task: z.string().describe('The task to delegate'),
      context: z.string().optional().describe('Additional context'),
      sessionId: z.string().optional().describe('Session ID from a previous call to resume conversation context. Omit for a new session.'),
    }),
    execute: async function*({ task, context, sessionId }, { abortSignal }) {
      log.debug({ childAgentId: childAgent.id, childAgentName: childAgent.name, sessionId }, 'delegating to sub-agent')

      // --- Session resolution ---
      let sessionConvId: string | undefined
      let historyMessages: UIMessage[] = []

      if (conversationStorage) {
        if (sessionId) {
          try {
            const conv = await conversationStorage.getById(projectId as ProjectId, sessionId as ConversationId)
            if (conv && conv.agentId === childAgent.id) {
              sessionConvId = conv.id
              historyMessages = conv.messages.map(m => ({
                id: m.id,
                role: m.role as 'user' | 'assistant',
                parts: m.parts as UIMessage['parts'],
              }))
              log.debug({ sessionId, messageCount: historyMessages.length }, 'resumed sub-agent session')
            } else {
              log.warn({ sessionId, childAgentId: childAgent.id, foundAgentId: conv?.agentId }, 'invalid sessionId or agentId mismatch, creating new session')
            }
          } catch (err) {
            log.warn({ err, sessionId }, 'failed to load session, creating new one')
          }
        }

        if (!sessionConvId) {
          try {
            const conv = await conversationStorage.create(
              projectId as ProjectId,
              childAgent.id as AgentId,
              `[Sub-agent] ${childAgent.name}`,
            )
            sessionConvId = conv.id
            log.debug({ sessionConvId }, 'created new sub-agent session')
          } catch (err) {
            log.warn({ err, childAgentId: childAgent.id }, 'failed to create sub-agent session, falling back to prompt mode')
          }
        }
      }

      // Session conversationId for task tools scope; fallback to parent conversationId
      const childConversationId = sessionConvId ?? conversationId

      const childToolsResult = await loadTools({
        agent: childAgent,
        projectId,
        settings,
        allAgents,
        mcpStorage,
        permissionsConfigStorage,
        conversationId: childConversationId,
        conversationStorage,
        taskStorage,
        tokenRecordStorage,
        kbStorage,
        onTokenUsage,
      })

      try {
        const childModel = await resolveModel(settings, childAgent.modelConfig)

        const systemPrompt = childToolsResult.instructions
          ? childAgent.systemPrompt + '\n\n' + childToolsResult.instructions
          : childAgent.systemPrompt

        const hasTools = Object.keys(childToolsResult.tools).length > 0

        const state: SubAgentStreamState = {
          agentName: childAgent.name,
          text: '',
          toolCalls: [],
          status: 'running',
          sessionId: sessionConvId,
        }
        yield state

        // --- Build user content and optionally model messages ---
        const userContent = context ? `${task}\n\nContext: ${context}` : task
        let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>> | undefined

        if (sessionConvId && conversationStorage) {
          // Session mode: save user message and build full message history
          const userMsgId = generateId('msg')
          await conversationStorage.saveMessage(
            projectId as ProjectId,
            sessionConvId as ConversationId,
            {
              id: userMsgId,
              role: 'user',
              parts: [{ type: 'text', text: userContent }],
              content: userContent,
            },
          )

          const allUIMessages: UIMessage[] = [
            ...historyMessages,
            { id: userMsgId, role: 'user' as const, parts: [{ type: 'text' as const, text: userContent }] },
          ]
          modelMessages = await convertToModelMessages(allUIMessages)
        }

        const result = streamText({
          model: childModel,
          system: systemPrompt,
          tools: hasTools ? childToolsResult.tools : undefined,
          stopWhen: hasTools ? stepCountIs(DEFAULT_MAX_STEPS) : undefined,
          ...(modelMessages ? { messages: modelMessages } : { prompt: userContent }),
          abortSignal,
          onAbort: async ({ steps }) => {
            let inputTokens = 0, outputTokens = 0
            for (const step of steps) {
              inputTokens += step.usage?.inputTokens ?? 0
              outputTokens += step.usage?.outputTokens ?? 0
            }
            try {
              if (tokenRecordStorage) {
                tokenRecordStorage.save(projectId as ProjectId, {
                  conversationId,
                  agentId: childAgent.id,
                  provider: childAgent.modelConfig.provider,
                  model: childAgent.modelConfig.model,
                  inputTokens,
                  outputTokens,
                  source: 'sub-agent',
                  aborted: true,
                })
              }
              if (onTokenUsage) {
                onTokenUsage({ inputTokens, outputTokens })
              }
              log.debug({ childAgentId: childAgent.id, inputTokens, outputTokens, completedSteps: steps.length }, 'saved sub-agent abort token record')
            } catch (err) {
              log.error({ err, childAgentId: childAgent.id }, 'failed to save sub-agent abort token record')
            }
          },
        })

        let lastTextYield = 0
        let pendingTextYield = false

        for await (const chunk of result.fullStream) {
          switch (chunk.type) {
            case 'text-delta': {
              state.text += chunk.text
              const now = Date.now()
              if (now - lastTextYield >= TEXT_THROTTLE_MS) {
                yield { ...state, toolCalls: state.toolCalls.map(tc => ({ ...tc })) }
                lastTextYield = now
                pendingTextYield = false
              } else {
                pendingTextYield = true
              }
              break
            }

            case 'tool-call': {
              if (pendingTextYield) {
                yield { ...state, toolCalls: state.toolCalls.map(tc => ({ ...tc })) }
                pendingTextYield = false
              }
              state.toolCalls.push({
                id: chunk.toolCallId,
                name: chunk.toolName,
                input: chunk.input,
                state: 'running',
              })
              yield { ...state, toolCalls: state.toolCalls.map(tc => ({ ...tc })) }
              lastTextYield = Date.now()
              break
            }

            case 'tool-result': {
              const tc = state.toolCalls.find(t => t.id === chunk.toolCallId)
              if (tc) {
                tc.output = chunk.output
                tc.state = chunk.preliminary ? 'running' : 'done'
              }
              yield { ...state, toolCalls: state.toolCalls.map(tc => ({ ...tc })) }
              lastTextYield = Date.now()
              break
            }
          }
        }

        // Capture child agent token usage
        const childUsage = await result.totalUsage
        const childInputTokens = childUsage.inputTokens ?? 0
        const childOutputTokens = childUsage.outputTokens ?? 0
        state.usage = {
          inputTokens: childInputTokens,
          outputTokens: childOutputTokens,
          totalTokens: childUsage.totalTokens ?? 0,
        }

        // Propagate sub-agent token usage to SSE stream
        if (onTokenUsage) {
          onTokenUsage({ inputTokens: childInputTokens, outputTokens: childOutputTokens })
        }

        // Persist token_record for the sub-agent API call (linked to parent conversation)
        if (tokenRecordStorage) {
          try {
            tokenRecordStorage.save(projectId as ProjectId, {
              conversationId,
              agentId: childAgent.id,
              provider: childAgent.modelConfig.provider,
              model: childAgent.modelConfig.model,
              inputTokens: childInputTokens,
              outputTokens: childOutputTokens,
              source: 'sub-agent',
            })
          } catch (err) {
            log.error({ err, childAgentId: childAgent.id }, 'failed to save sub-agent token record')
          }
        }

        // Save assistant message to session (session mode only)
        if (sessionConvId && conversationStorage) {
          try {
            const assistantMsgId = generateId('msg')
            await conversationStorage.saveMessage(
              projectId as ProjectId,
              sessionConvId as ConversationId,
              {
                id: assistantMsgId,
                role: 'assistant',
                parts: buildAssistantParts(state),
                content: state.text,
                inputTokens: childInputTokens,
                outputTokens: childOutputTokens,
                contextTokens: childUsage.totalTokens ?? 0,
                provider: childAgent.modelConfig.provider,
                model: childAgent.modelConfig.model,
              },
            )
          } catch (err) {
            log.error({ err, sessionConvId, childAgentId: childAgent.id }, 'failed to save sub-agent assistant message')
          }
        }

        // Final yield — becomes the persisted tool output
        state.status = 'done'
        yield state
      } finally {
        await childToolsResult.cleanup()
      }
    },
  })
}

/**
 * Create sub-agent tool shells for an agent's configured sub-agents.
 *
 * Returns lightweight delegate tools with zero resource cost.
 * Each tool only loads its child agent's full toolchain when invoked.
 * No cleanup needed — cleanup happens inside each tool's execute().
 */
export function createSubAgentToolSet(
  agent: Agent,
  allAgents: Agent[],
  settings: GlobalSettings,
  projectId: string,
  loadTools: LoadToolsFn,
  mcpStorage: IMCPService,
  permissionsConfigStorage: IPermissionsConfigService,
  conversationId?: string,
  conversationStorage?: IConversationService,
  taskStorage?: SqliteConversationTaskStorage,
  tokenRecordStorage?: TokenRecordStorage,
  kbStorage?: import('../storage/knowledge-base').KnowledgeBaseStorage,
  onTokenUsage?: (usage: { inputTokens: number; outputTokens: number }) => void,
): { tools: ToolSet } {
  const tools: ToolSet = {}

  for (const subRef of agent.subAgents) {
    const childAgent = allAgents.find(a => a.id === subRef.agentId)
    if (!childAgent) {
      log.warn({ agentId: subRef.agentId }, 'sub-agent not found, skipping')
      continue
    }

    const toolName = sanitizeToolName(`delegate_to_${childAgent.id}`)
    tools[toolName] = createSubAgentTool(childAgent, allAgents, settings, projectId, loadTools, mcpStorage, permissionsConfigStorage, conversationId, conversationStorage, taskStorage, tokenRecordStorage, kbStorage, onTokenUsage)

    log.debug(
      { childAgent: childAgent.name, toolName },
      'registered sub-agent delegate tool (lazy loading)',
    )
  }

  return { tools }
}
