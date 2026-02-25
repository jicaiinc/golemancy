/**
 * Config Mapper — Convert Golemancy Agent config → SDK query options.
 *
 * Translates agent model, system prompt, tools, sub-agents, MCP servers,
 * and permissions into the format expected by @anthropic-ai/claude-agent-sdk.
 */

import type { Agent, MCPServerConfig, PermissionMode } from '@golemancy/shared'
import { convertMcpServers } from './mcp-adapter'
import type { SdkMcpServerConfig } from './mcp-adapter'

// ── SDK Option Types (matching @anthropic-ai/claude-agent-sdk) ──

export interface SdkAgentDefinition {
  description: string
  prompt: string
  tools?: string[]
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit'
}

export type SdkPermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'

export interface SdkQueryOptions {
  model?: string
  systemPrompt?: string
  cwd?: string
  allowedTools?: string[]
  agents?: Record<string, SdkAgentDefinition>
  mcpServers?: Record<string, SdkMcpServerConfig>
  permissionMode?: SdkPermissionMode
  allowDangerouslySkipPermissions?: boolean
  resume?: string
  includePartialMessages?: boolean
  maxTurns?: number
  settingSources?: string[]
}

// ── Model Validation & Fallback ──

const VALID_CLAUDE_CODE_MODELS = new Set(['sonnet', 'opus', 'haiku'])
const DEFAULT_CLAUDE_CODE_MODEL = 'sonnet'

/**
 * Normalize model string for Claude Code SDK.
 * If the model isn't a valid claude-code model (e.g. agent was previously
 * configured for standard runtime with 'gpt-4o'), fall back to 'sonnet'.
 */
function normalizeModel(model?: string): string {
  if (!model) return DEFAULT_CLAUDE_CODE_MODEL
  if (VALID_CLAUDE_CODE_MODELS.has(model)) return model
  return DEFAULT_CLAUDE_CODE_MODEL
}

// ── Built-in Tool Mapping ──

/** Map Golemancy builtinTool IDs to SDK tool names */
const BUILTIN_TOOL_MAP: Record<string, string[]> = {
  bash: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
  browser: ['WebFetch', 'WebSearch'],
  task: ['Task'],
}

// ── Permission Mode Mapping ──

/** Map Golemancy PermissionMode → SDK PermissionMode */
function mapPermissionMode(mode?: PermissionMode | string): SdkPermissionMode {
  switch (mode) {
    case 'restricted':
      return 'plan'
    case 'sandbox':
      return 'default'
    case 'unrestricted':
      return 'bypassPermissions'
    default:
      return 'default'
  }
}

// ── Main Builder ──

export interface BuildSdkOptionsParams {
  agent: Agent
  systemPrompt: string
  cwd?: string
  permissionMode?: PermissionMode | string
  allAgents: Agent[]
  mcpConfigs: MCPServerConfig[]
  sdkSessionId?: string
  hasSkills?: boolean
}

/**
 * Build SDK query options from Golemancy agent config.
 */
export function buildSdkOptions(params: BuildSdkOptionsParams): SdkQueryOptions {
  const { agent, systemPrompt, cwd, permissionMode, allAgents, mcpConfigs, sdkSessionId, hasSkills } = params

  const options: SdkQueryOptions = {
    includePartialMessages: true,
  }

  // Working directory — project workspace
  if (cwd) {
    options.cwd = cwd
  }

  // Model — normalize to valid claude-code model (sonnet/opus/haiku), fallback to sonnet
  options.model = normalizeModel(agent.modelConfig?.model)

  // System prompt
  if (systemPrompt) {
    options.systemPrompt = systemPrompt
  }

  // Allowed tools from builtinTools config
  const allowedTools: string[] = []
  if (agent.builtinTools) {
    for (const [toolId, enabled] of Object.entries(agent.builtinTools)) {
      if (enabled && BUILTIN_TOOL_MAP[toolId]) {
        allowedTools.push(...BUILTIN_TOOL_MAP[toolId])
      }
    }
  }

  // Sub-agents — need Task tool to invoke them
  if (agent.subAgents?.length > 0) {
    if (!allowedTools.includes('Task')) {
      allowedTools.push('Task')
    }

    const agentMap = new Map(allAgents.map(a => [a.id, a]))
    const agents: Record<string, SdkAgentDefinition> = {}

    for (const ref of agent.subAgents) {
      const subAgent = agentMap.get(ref.agentId)
      if (!subAgent) continue

      // Map sub-agent's builtinTools to SDK tool names
      const subAgentTools: string[] = []
      if (subAgent.builtinTools) {
        for (const [toolId, enabled] of Object.entries(subAgent.builtinTools)) {
          if (enabled && BUILTIN_TOOL_MAP[toolId]) {
            subAgentTools.push(...BUILTIN_TOOL_MAP[toolId])
          }
        }
      }

      agents[subAgent.name] = {
        description: subAgent.description || `Sub-agent: ${subAgent.name}`,
        prompt: subAgent.systemPrompt || '',
        ...(subAgentTools.length > 0 ? { tools: subAgentTools } : {}),
        model: normalizeModel(subAgent.modelConfig?.model) as SdkAgentDefinition['model'],
      }
    }

    if (Object.keys(agents).length > 0) {
      options.agents = agents
    }
  }

  // MCP servers — merge agent's named references (resolved externally) with custom tools
  const sdkMcpServers = convertMcpServers(mcpConfigs)

  // Add wildcard allowedTools for each MCP server
  for (const serverName of Object.keys(sdkMcpServers)) {
    allowedTools.push(`mcp__${serverName}__*`)
  }

  if (Object.keys(sdkMcpServers).length > 0) {
    options.mcpServers = sdkMcpServers
  }

  // Skills — enable SDK native skill discovery via file system
  if (hasSkills) {
    options.settingSources = ['project']
    if (!allowedTools.includes('Skill')) {
      allowedTools.push('Skill')
    }
  }

  // Set allowed tools
  if (allowedTools.length > 0) {
    options.allowedTools = allowedTools
  }

  // Permission mode
  const sdkPermMode = mapPermissionMode(permissionMode)
  options.permissionMode = sdkPermMode
  if (sdkPermMode === 'bypassPermissions') {
    options.allowDangerouslySkipPermissions = true
  }

  // Session resume
  if (sdkSessionId) {
    options.resume = sdkSessionId
  }

  return options
}
