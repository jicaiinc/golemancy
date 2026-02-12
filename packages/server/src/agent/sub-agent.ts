import { tool, generateText, stepCountIs, type ToolSet } from 'ai'
import { z } from 'zod'
import type { Agent, GlobalSettings } from '@solocraft/shared'
import { resolveModel } from './model'
import { loadAgentSkillTools } from './skills'
import { loadAgentMcpTools } from './mcp'
import { loadBuiltinTools } from './builtin-tools'
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

/**
 * Load tools for a single agent (skills + MCP + built-in).
 * Used to equip sub-agents with their own tool chain.
 */
async function loadChildAgentTools(
  childAgent: Agent,
  projectId: string,
): Promise<{ tools: ToolSet; cleanup: () => Promise<void> }> {
  const tools: ToolSet = {}
  const cleanups: Array<() => Promise<void>> = []

  // Skills
  if (childAgent.skillIds?.length > 0) {
    const skillResult = await loadAgentSkillTools(projectId, childAgent.skillIds)
    if (skillResult) {
      Object.assign(tools, skillResult.tools)
      cleanups.push(skillResult.cleanup)
    }
  }

  // MCP
  if (childAgent.mcpServers?.length > 0) {
    const mcpResult = await loadAgentMcpTools(childAgent.mcpServers)
    if (mcpResult) {
      Object.assign(tools, mcpResult.tools)
      cleanups.push(mcpResult.cleanup)
    }
  }

  // Built-in
  if (childAgent.builtinTools) {
    const builtinResult = await loadBuiltinTools(childAgent.builtinTools)
    if (builtinResult) {
      Object.assign(tools, builtinResult.tools)
      cleanups.push(builtinResult.cleanup)
    }
  }

  return {
    tools,
    cleanup: async () => {
      await Promise.all(cleanups.map(fn => fn().catch(() => {})))
    },
  }
}

export function createSubAgentTool(
  childAgent: Agent,
  settings: GlobalSettings,
  childTools?: ToolSet,
) {
  return tool({
    description: `Delegate task to sub-agent "${childAgent.name}": ${childAgent.description}`,
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

export interface SubAgentToolsResult {
  tools: ToolSet
  cleanup: () => Promise<void>
}

/**
 * Load sub-agent tools for an agent.
 * For each sub-agent, loads its own tool chain (skills/MCP/built-in)
 * and wraps it as a delegate tool for the parent agent.
 */
export async function loadSubAgentTools(
  agent: Agent,
  allAgents: Agent[],
  settings: GlobalSettings,
  projectId: string,
): Promise<SubAgentToolsResult> {
  const tools: ToolSet = {}
  const cleanups: Array<() => Promise<void>> = []

  for (const subRef of agent.subAgents) {
    const childAgent = allAgents.find(a => a.id === subRef.agentId)
    if (!childAgent) {
      log.warn({ agentId: subRef.agentId }, 'sub-agent not found, skipping')
      continue
    }

    // Load the child agent's own tools so it can use them during execution
    const childResult = await loadChildAgentTools(childAgent, projectId)
    const childTools = Object.keys(childResult.tools).length > 0 ? childResult.tools : undefined
    cleanups.push(childResult.cleanup)

    // Use agent ID for tool name (always ASCII-safe), human name goes in description
    const toolName = sanitizeToolName(`delegate_to_${childAgent.id}`)
    tools[toolName] = createSubAgentTool(childAgent, settings, childTools)

    log.debug(
      { childAgent: childAgent.name, toolName, childToolCount: Object.keys(childResult.tools).length },
      'registered sub-agent tool with its own tools',
    )
  }

  return {
    tools,
    cleanup: async () => {
      await Promise.all(cleanups.map(fn => fn().catch(() => {})))
    },
  }
}
