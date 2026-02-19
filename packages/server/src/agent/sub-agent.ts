import { tool, streamText, stepCountIs, type ToolSet } from 'ai'
import { z } from 'zod'
import type { Agent, GlobalSettings, IMCPService, IPermissionsConfigService, SubAgentStreamState } from '@golemancy/shared'
import type { SqliteConversationTaskStorage } from '../storage/tasks'
import { resolveModel } from './model'
import type { LoadAgentToolsParams, AgentToolsResult } from './tools'
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
  taskStorage?: SqliteConversationTaskStorage,
) {
  return tool({
    description: `Delegate task to sub-agent "${childAgent.name}": ${childAgent.description}`,
    inputSchema: z.object({
      task: z.string().describe('The task to delegate'),
      context: z.string().optional().describe('Additional context'),
    }),
    execute: async function*({ task, context }, { abortSignal }) {
      log.debug({ childAgentId: childAgent.id, childAgentName: childAgent.name }, 'delegating to sub-agent')

      const childToolsResult = await loadTools({
        agent: childAgent,
        projectId,
        settings,
        allAgents,
        mcpStorage,
        permissionsConfigStorage,
        conversationId,
        taskStorage,
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
        }
        yield state

        const result = streamText({
          model: childModel,
          system: systemPrompt,
          tools: hasTools ? childToolsResult.tools : undefined,
          stopWhen: hasTools ? stepCountIs(10) : undefined,
          prompt: context ? `${task}\n\nContext: ${context}` : task,
          abortSignal,
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
        state.usage = {
          inputTokens: childUsage.inputTokens ?? 0,
          outputTokens: childUsage.outputTokens ?? 0,
          totalTokens: childUsage.totalTokens ?? 0,
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
  taskStorage?: SqliteConversationTaskStorage,
): { tools: ToolSet } {
  const tools: ToolSet = {}

  for (const subRef of agent.subAgents) {
    const childAgent = allAgents.find(a => a.id === subRef.agentId)
    if (!childAgent) {
      log.warn({ agentId: subRef.agentId }, 'sub-agent not found, skipping')
      continue
    }

    const toolName = sanitizeToolName(`delegate_to_${childAgent.id}`)
    tools[toolName] = createSubAgentTool(childAgent, allAgents, settings, projectId, loadTools, mcpStorage, permissionsConfigStorage, conversationId, taskStorage)

    log.debug(
      { childAgent: childAgent.name, toolName },
      'registered sub-agent delegate tool (lazy loading)',
    )
  }

  return { tools }
}
