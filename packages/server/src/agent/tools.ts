import type { ToolSet } from 'ai'
import type { Agent, GlobalSettings, PermissionsConfigId, ProjectId, SupportedPlatform, IMCPService, IPermissionsConfigService } from '@golemancy/shared'
import { loadAgentSkillTools } from './skills'
import { loadAgentMcpTools } from './mcp'
import { loadBuiltinTools } from './builtin-tools'
import { createSubAgentToolSet } from './sub-agent'
import { resolvePermissionsConfig } from './resolve-permissions'
import { getProjectPath } from '../utils/paths'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:tools' })

export interface LoadAgentToolsParams {
  agent: Agent
  projectId: string
  /** Global settings — passed through to sub-agents for model resolution */
  settings: GlobalSettings
  allAgents: Agent[]
  mcpStorage: IMCPService
  permissionsConfigId?: PermissionsConfigId
  permissionsConfigStorage: IPermissionsConfigService
}

export interface AgentToolsResult {
  tools: ToolSet
  instructions: string
  cleanup: () => Promise<void>
}

/**
 * Unified entry point: load all tools for an agent (skills, MCP, built-in, sub-agents).
 *
 * Sub-agent tools are lightweight shells — they only load their own tools
 * when actually invoked via `execute()`. This function is passed into
 * `createSubAgentToolSet` via dependency injection, enabling infinite
 * recursive nesting controlled purely by agent configuration.
 */
export async function loadAgentTools(params: LoadAgentToolsParams): Promise<AgentToolsResult> {
  const { agent, projectId, settings, allAgents, mcpStorage, permissionsConfigId, permissionsConfigStorage } = params
  const tools: ToolSet = {}
  const cleanups: Array<() => Promise<void>> = []
  let instructions = ''

  // 1. Skills — returns only the `skill` selector tool
  if (agent.skillIds?.length > 0) {
    const skillResult = await loadAgentSkillTools(projectId, agent.skillIds)
    if (skillResult) {
      Object.assign(tools, skillResult.tools)  // only { skill }
      instructions = skillResult.instructions
      cleanups.push(skillResult.cleanup)
    }
  }

  // 2. MCP — resolve name references to full configs, then load
  //    Resolve permissions early so MCP sandbox wrapping can use it
  if (agent.mcpServers?.length > 0) {
    const mcpConfigs = await mcpStorage.resolveNames(projectId as ProjectId, agent.mcpServers)
    if (mcpConfigs.length > 0) {
      // Resolve permissions for MCP sandbox wrapping (applyToMCP check)
      let sandboxOptions: Parameters<typeof loadAgentMcpTools>[1]
      if (permissionsConfigStorage) {
        try {
          const workspaceDir = getProjectPath(projectId) + '/workspace'
          const platform = process.platform as SupportedPlatform
          const resolvedPermissions = await resolvePermissionsConfig(
            permissionsConfigStorage,
            projectId as ProjectId,
            permissionsConfigId,
            workspaceDir,
            platform,
          )
          sandboxOptions = { projectId: projectId as ProjectId, resolvedPermissions }
        } catch (err) {
          log.warn({ err }, 'failed to resolve permissions for MCP sandbox wrapping')
        }
      }

      const mcpResult = await loadAgentMcpTools(mcpConfigs, sandboxOptions)
      if (mcpResult) {
        Object.assign(tools, mcpResult.tools)
        cleanups.push(mcpResult.cleanup)
      }
    }
  }

  // 3. Built-in tools (bash/readFile/writeFile, browser, etc.)
  if (agent.builtinTools) {
    const builtinResult = await loadBuiltinTools(agent.builtinTools, {
      projectId,
      permissionsConfigId,
      permissionsConfigStorage,
    })
    if (builtinResult) {
      Object.assign(tools, builtinResult.tools)
      cleanups.push(builtinResult.cleanup)
    }
  }

  // 4. Sub-agents (lightweight shells, zero resource cost until invoked)
  if (agent.subAgents?.length > 0) {
    const subAgentResult = createSubAgentToolSet(
      agent, allAgents, settings, projectId, loadAgentTools, mcpStorage, permissionsConfigStorage,
    )
    Object.assign(tools, subAgentResult.tools)
  }

  log.debug(
    { agentId: agent.id, agentName: agent.name, toolCount: Object.keys(tools).length },
    'loaded agent tools',
  )

  return {
    tools,
    instructions,
    cleanup: async () => {
      await Promise.all(cleanups.map(fn => fn().catch(() => {})))
    },
  }
}
