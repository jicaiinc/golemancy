import type { ToolSet } from 'ai'
import type { Agent, AgentId, GlobalSettings, PermissionMode, PermissionsConfigId, ProjectId, ConversationId, SupportedPlatform, IMCPService, IConversationService, IPermissionsConfigService, TeamMember } from '@golemancy/shared'
import { DEFAULT_MEMORY_AUTO_LOAD } from '@golemancy/shared'
import type { SqliteConversationTaskStorage } from '../storage/tasks'
import type { SqliteMemoryStorage } from '../storage/memories'
import type { TokenRecordStorage } from '../storage/token-records'
import { loadAgentSkillTools } from './skills'
import { loadAgentMcpTools } from './mcp'
import { loadBuiltinTools, type ModeDegradation } from './builtin-tools'
import { createSubAgentToolSet } from './sub-agent'
import { createTaskTools, buildTaskInstructions } from './builtin-tools/task-tools'
import { createMemoryTools, buildMemoryBaseInstructions, buildMemoryContextInstructions } from './builtin-tools/memory-tools'
import { buildBashInstructions } from './builtin-tools/bash-tools'
import { buildBrowserInstructions } from './builtin-tools/browser-tools'
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
  conversationId?: string
  conversationStorage?: IConversationService
  taskStorage?: SqliteConversationTaskStorage
  memoryStorage?: SqliteMemoryStorage
  tokenRecordStorage?: TokenRecordStorage
  onTokenUsage?: (usage: { inputTokens: number; outputTokens: number }) => void
  teamMembers?: TeamMember[]
  teamInstruction?: string
}

export interface AgentToolsResult {
  tools: ToolSet
  instructions: string
  /** Warnings about tools that failed to load (for UI display, not for agent context). */
  warnings: string[]
  /** The actual permission mode used (may differ from configured if degraded) */
  actualMode?: PermissionMode
  /** Present when permission mode was degraded from requested to fallback */
  degradation?: ModeDegradation
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
  const { agent, projectId, settings, allAgents, mcpStorage, permissionsConfigId, permissionsConfigStorage, conversationId, conversationStorage, taskStorage, memoryStorage, tokenRecordStorage, onTokenUsage } = params
  const tools: ToolSet = {}
  const warnings: string[] = []
  const cleanups: Array<() => Promise<void>> = []
  let instructions = ''
  let actualMode: PermissionMode | undefined
  let degradation: ModeDegradation | undefined

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
      // Resolve permissions and workspace dir for MCP loading
      const workspaceDir = getProjectPath(projectId) + '/workspace'
      let mcpOptions: Parameters<typeof loadAgentMcpTools>[1]
      if (permissionsConfigStorage) {
        try {
          const platform = process.platform as SupportedPlatform
          const resolvedPermissions = await resolvePermissionsConfig(
            permissionsConfigStorage,
            projectId as ProjectId,
            permissionsConfigId,
            workspaceDir,
            platform,
          )
          mcpOptions = { projectId: projectId as ProjectId, workspaceDir, resolvedPermissions }
        } catch (err) {
          log.warn({ err }, 'failed to resolve permissions for MCP loading')
        }
      }

      const mcpResult = await loadAgentMcpTools(mcpConfigs, mcpOptions)
      warnings.push(...mcpResult.warnings)
      if (Object.keys(mcpResult.tools).length > 0) {
        Object.assign(tools, mcpResult.tools)
        // No cleanup pushed — pool manages MCP connections
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
      actualMode = builtinResult.actualMode
      if (builtinResult.degradation) {
        degradation = builtinResult.degradation
        warnings.push(
          `Permission mode degraded: ${builtinResult.degradation.requestedMode} → ${builtinResult.degradation.actualMode} (${builtinResult.degradation.reason})`,
        )
      }

      // Bash instructions — inform agent about sandbox mode and filesystem layout
      if (agent.builtinTools?.bash !== false) {
        const bashInstr = buildBashInstructions(builtinResult.actualMode, !!projectId)
        instructions = instructions ? instructions + '\n\n' + bashInstr : bashInstr
      }

      // Browser instructions — brief guidance on browser capabilities
      if (agent.builtinTools?.browser) {
        const browserInstr = buildBrowserInstructions()
        instructions = instructions ? instructions + '\n\n' + browserInstr : browserInstr
      }
    }
  }

  // 4. Sub-agents — derived from Team members (direct children of current agent)
  const directChildren = params.teamMembers
    ?.filter(m => m.parentAgentId === agent.id)
  if (directChildren && directChildren.length > 0) {
    const subAgentResult = createSubAgentToolSet(
      agent, allAgents, settings, projectId, loadAgentTools, mcpStorage, permissionsConfigStorage,
      conversationId, conversationStorage, taskStorage, tokenRecordStorage, onTokenUsage,
      directChildren, params.teamMembers,
    )
    Object.assign(tools, subAgentResult.tools)
  }

  // 5. Task tools — conversation-scoped task management
  if (agent.builtinTools?.task !== false && conversationId && taskStorage) {
    const taskTools = createTaskTools({
      projectId: projectId as ProjectId,
      conversationId: conversationId as ConversationId,
      taskStorage,
    })
    Object.assign(tools, taskTools)

    // Task instructions — usage guidelines for task management
    const taskInstr = buildTaskInstructions()
    instructions = instructions ? instructions + '\n\n' + taskInstr : taskInstr

    log.debug('loaded task built-in tools')
  }

  // 6. Memory tools — agent-scoped persistent memory with auto-loading
  if (agent.builtinTools?.memory !== false && memoryStorage) {
    const memoryConfig = agent.builtinTools?.memory
    const maxAutoLoad = (typeof memoryConfig === 'object' && memoryConfig !== null && 'maxAutoLoad' in memoryConfig)
      ? (memoryConfig as { maxAutoLoad: number }).maxAutoLoad
      : DEFAULT_MEMORY_AUTO_LOAD

    const memoryTools = createMemoryTools({
      projectId: projectId as ProjectId,
      agentId: agent.id as AgentId,
      memoryStorage,
      maxAutoLoad,
    })
    Object.assign(tools, memoryTools)

    // Base memory guidelines — always injected so agent knows it can save memories
    const memoryBaseInstr = buildMemoryBaseInstructions()
    instructions = instructions ? instructions + '\n\n' + memoryBaseInstr : memoryBaseInstr

    // Memory context (status + loaded memories) — only when memories exist
    try {
      const { pinned, autoLoaded, totalCount } = await memoryStorage.loadForContext(
        projectId as ProjectId,
        agent.id as AgentId,
        maxAutoLoad,
      )
      if (totalCount > 0 || pinned.length > 0) {
        const memoryContextInstr = buildMemoryContextInstructions({
          pinned: pinned.map(m => ({ id: m.id, content: m.content, priority: m.priority, tags: m.tags })),
          autoLoaded: autoLoaded.map(m => ({ id: m.id, content: m.content, priority: m.priority, tags: m.tags })),
          totalCount,
          maxAutoLoad,
        })
        instructions = instructions + '\n\n' + memoryContextInstr
      }
    } catch (err) {
      log.warn({ err, agentId: agent.id }, 'failed to load agent memories')
    }

    log.debug({ agentId: agent.id, agentName: agent.name }, 'loaded memory built-in tools')
  }

  // 7. Team instruction — injected into leader agent context
  if (params.teamInstruction) {
    const teamInstr = `## Team Context\n${params.teamInstruction}`
    instructions = instructions ? instructions + '\n\n' + teamInstr : teamInstr
  }

  log.debug(
    { agentId: agent.id, agentName: agent.name, toolCount: Object.keys(tools).length },
    'loaded agent tools',
  )

  return {
    tools,
    instructions,
    warnings,
    actualMode,
    degradation,
    cleanup: async () => {
      await Promise.all(cleanups.map(fn => fn().catch(() => {})))
    },
  }
}
