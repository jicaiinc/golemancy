import { tool, generateText, stepCountIs, type ToolSet } from 'ai'
import { z } from 'zod'
import type { Agent, GlobalSettings } from '@solocraft/shared'
import { resolveModel } from './model'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:sub-agent' })

/**
 * Sanitize a string into a valid tool name.
 * Must start with a letter or underscore, contain only [a-zA-Z0-9_.\-:], max 64 chars.
 * Required by providers like Google Gemini that enforce strict tool naming.
 */
export function sanitizeToolName(name: string): string {
  // Replace any non-allowed characters with underscores
  let sanitized = name.replace(/[^a-zA-Z0-9_.\-:]/g, '_')
  // Ensure it starts with a letter or underscore
  if (sanitized && !/^[a-zA-Z_]/.test(sanitized)) {
    sanitized = '_' + sanitized
  }
  // Collapse consecutive underscores
  sanitized = sanitized.replace(/_+/g, '_')
  // Trim trailing underscores
  sanitized = sanitized.replace(/_$/, '')
  // Max 64 chars
  return sanitized.slice(0, 64) || 'unnamed_tool'
}

export function createSubAgentTool(
  childAgent: Agent,
  settings: GlobalSettings,
  childTools?: ToolSet,
) {
  return tool({
    description: `Delegate task to ${childAgent.name}: ${childAgent.description}`,
    inputSchema: z.object({
      task: z.string().describe('The task to delegate'),
      context: z.string().optional().describe('Additional context'),
    }),
    execute: async ({ task, context }, { abortSignal }) => {
      log.debug({ childAgentId: childAgent.id, childAgentName: childAgent.name }, 'delegating to sub-agent')
      const childModel = await resolveModel(settings, childAgent.modelConfig)

      const result = await generateText({
        model: childModel,
        system: childAgent.systemPrompt,
        prompt: context ? `${task}\n\nContext: ${context}` : task,
        tools: childTools,
        stopWhen: stepCountIs(10),
        abortSignal,
      })

      return result.text
    },
  })
}

/**
 * Load sub-agent tools for an agent.
 * Creates a delegate tool for each sub-agent reference.
 */
export function loadSubAgentTools(
  agent: Agent,
  allAgents: Agent[],
  settings: GlobalSettings,
): ToolSet {
  const tools: ToolSet = {}

  for (const subRef of agent.subAgents) {
    const childAgent = allAgents.find(a => a.id === subRef.agentId)
    if (!childAgent) {
      log.warn({ agentId: subRef.agentId }, 'sub-agent not found, skipping')
      continue
    }

    const toolName = sanitizeToolName(`delegate_to_${childAgent.name.toLowerCase()}`)
    tools[toolName] = createSubAgentTool(childAgent, settings)
  }

  return tools
}
