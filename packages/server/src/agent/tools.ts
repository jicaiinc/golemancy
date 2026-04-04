import path from 'node:path'
import type { ToolSet } from 'ai'
import type { Agent, AgentId, GlobalSettings, PermissionMode, PermissionsConfigId, ProjectId, ConversationId, SupportedPlatform, IMCPService, IConversationService, IPermissionsConfigService, TeamMember } from '@golemancy/shared'
import { DEFAULT_MEMORY_AUTO_LOAD, isSandboxRuntimeSupported } from '@golemancy/shared'
import type { SqliteConversationTaskStorage } from '../storage/tasks'
import type { SqliteMemoryStorage } from '../storage/memories'
import type { TokenRecordStorage } from '../storage/token-records'
import type { OAuthManager } from '../auth/oauth-manager'
import { loadAgentSkillTools } from './skills'
import { loadAgentMcpTools } from './mcp'
import { loadBuiltinTools, type ModeDegradation } from './builtin-tools'
import { createSubAgentToolSet } from './sub-agent'
import { createTaskTools, buildTaskInstructions } from './builtin-tools/task-tools'
import { createMemoryTools, buildMemoryBaseInstructions, buildMemoryContextInstructions } from './builtin-tools/memory-tools'
import { buildBashInstructions } from './builtin-tools/bash-tools'
import { buildBrowserInstructions } from './builtin-tools/browser-tools'
import { buildEnvironmentInstructions } from './builtin-tools/env-info'
import { createOpenTools, buildOpenInstructions } from './builtin-tools/open-tools'
import { resolvePermissionsConfig } from './resolve-permissions'
import { getProjectPath } from '../utils/paths'
import { runtimeEnvManager } from '../runtime/runtime-env-manager'
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
  oauthManager?: OAuthManager
}

export interface AgentToolsResult {
  tools: ToolSet
  /** Instruction sections to append to the system prompt. Join with '\n\n' when assembling. */
  instructions: string[]
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
  let actualMode: PermissionMode | undefined
  let degradation: ModeDegradation | undefined

  // Instruction sections — collected during tool loading, assembled in semantic order at the end.
  let instr_skills: string | undefined
  let instr_mcp: string | undefined
  let instr_bash: string | undefined
  let instr_toolPriority: string | undefined
  let instr_browser: string | undefined
  let instr_env: string | undefined
  let instr_delegation: string | undefined
  let instr_fileOpening: string | undefined
  let instr_task: string | undefined
  let instr_memoryBase: string | undefined
  let instr_memoryContext: string | undefined
  let instr_teamRaw: string | undefined  // raw user instruction (without heading)

  // 1. Skills — returns only the `skill` selector tool
  if (agent.skillIds?.length > 0) {
    const skillResult = await loadAgentSkillTools(projectId, agent.skillIds)
    if (skillResult) {
      Object.assign(tools, skillResult.tools)  // only { skill }
      if (skillResult.instructions) {
        instr_skills = skillResult.instructions
      }
      cleanups.push(skillResult.cleanup)
    }
  }

  // 2. MCP — resolve name references to full configs, then load
  //    Resolve permissions early so MCP sandbox wrapping can use it
  if (agent.mcpServers?.length > 0) {
    const mcpConfigs = await mcpStorage.resolveNames(projectId as ProjectId, agent.mcpServers)
    if (mcpConfigs.length > 0) {
      // Resolve permissions and workspace dir for MCP loading
      const workspaceDir = path.join(getProjectPath(projectId), 'workspace')
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
      if (mcpResult.instructions) {
        instr_mcp = mcpResult.instructions
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
        instr_bash = buildBashInstructions(builtinResult.actualMode, !!projectId, process.platform as SupportedPlatform, runtimeEnvManager.getRuntimeInfo())

        // Tool priority — prefer dedicated tools over bash equivalents
        if (builtinResult.tools['readFile'] || builtinResult.tools['writeFile']) {
          instr_toolPriority = buildToolPriorityInstructions()
        }
      }

      // Browser instructions — brief guidance on browser capabilities
      if (agent.builtinTools?.browser) {
        instr_browser = buildBrowserInstructions()
      }
    }
  }

  // 3.5. Environment info — platform, date, model, per-mode safety guidance
  {
    // restricted mode: agent sees /workspace, not the host path
    const workspaceDir = projectId
      ? (actualMode === 'restricted' ? '/workspace' : path.join(getProjectPath(projectId), 'workspace'))
      : undefined
    // Mirror resolveModel fallback so prompt shows the actual model, not the stale config
    const effectiveConfig = (agent.modelConfig?.provider && settings.providers?.[agent.modelConfig.provider])
      ? agent.modelConfig
      : settings.defaultModel ?? agent.modelConfig
    instr_env = buildEnvironmentInstructions({
      agentName: agent.name,
      workspaceDir,
      platform: process.platform,
      permissionMode: actualMode,
      model: effectiveConfig?.model,
      provider: effectiveConfig?.provider,
    })
  }

  // 4. Sub-agents — derived from Team members (direct children of current agent)
  const directChildren = params.teamMembers
    ?.filter(m => m.parentAgentId === agent.id)
  if (directChildren && directChildren.length > 0) {
    const subAgentResult = createSubAgentToolSet(
      agent, allAgents, settings, projectId, loadAgentTools, mcpStorage, permissionsConfigStorage,
      conversationId, conversationStorage, taskStorage, tokenRecordStorage, onTokenUsage,
      directChildren, params.teamMembers, memoryStorage, params.oauthManager,
    )
    Object.assign(tools, subAgentResult.tools)

    // Delegation guidance — help parent agent write effective sub-agent prompts
    instr_delegation = buildDelegationGuidelines()
  }

  // 5. Open file tool — sandbox-only: `open` is blocked by Seatbelt, so we provide IPC bypass
  //    Only on platforms with OS-level sandbox (GuardedSandbox doesn't block `open`)
  if (agent.builtinTools?.bash !== false && actualMode === 'sandbox' && projectId
    && isSandboxRuntimeSupported(process.platform as SupportedPlatform)) {
    const workspaceDir = path.join(getProjectPath(projectId), 'workspace')
    const openTools = createOpenTools({ workspaceRoot: workspaceDir })
    Object.assign(tools, openTools)

    instr_fileOpening = buildOpenInstructions()

    log.debug('loaded open file built-in tools')
  }

  // 6. Task tools — conversation-scoped task management
  if (agent.builtinTools?.task !== false && conversationId && taskStorage) {
    const taskTools = createTaskTools({
      projectId: projectId as ProjectId,
      conversationId: conversationId as ConversationId,
      taskStorage,
    })
    Object.assign(tools, taskTools)

    instr_task = buildTaskInstructions()

    log.debug('loaded task built-in tools')
  }

  // 7. Memory tools — agent-scoped persistent memory with auto-loading
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
    instr_memoryBase = buildMemoryBaseInstructions()

    // Memory context (status + loaded memories) — only when memories exist
    try {
      const { pinned, autoLoaded, totalCount } = await memoryStorage.loadForContext(
        projectId as ProjectId,
        agent.id as AgentId,
        maxAutoLoad,
      )
      if (totalCount > 0 || pinned.length > 0) {
        instr_memoryContext = buildMemoryContextInstructions({
          pinned: pinned.map(m => ({ id: m.id, content: m.content, priority: m.priority, tags: m.tags })),
          autoLoaded: autoLoaded.map(m => ({ id: m.id, content: m.content, priority: m.priority, tags: m.tags })),
          totalCount,
          maxAutoLoad,
        })
      }
    } catch (err) {
      log.warn({ err, agentId: agent.id }, 'failed to load agent memories')
    }

    log.debug({ agentId: agent.id, agentName: agent.name }, 'loaded memory built-in tools')
  }

  // 8. Team instruction — injected into leader agent context
  if (params.teamInstruction) {
    instr_teamRaw = params.teamInstruction
  }

  // ── Assemble instructions in semantic order ──────────────────
  // HEAD: identity & context (high primacy weight)
  // MIDDLE: tool capabilities (reference material)
  // TAIL: workflow & memory (high recency weight for loaded memories)

  // Combine team instruction + delegation under a single ## Your Team heading
  let instr_team: string | undefined
  if (instr_teamRaw || instr_delegation) {
    const parts: string[] = ['# Your Team']
    // Teammates intro — list names so agent knows who delegate_to_* tools correspond to
    if (directChildren && directChildren.length > 0) {
      const names = directChildren
        .map(c => allAgents.find(a => a.id === c.agentId)?.name)
        .filter(Boolean)
      parts.push(`You have ${names.length} teammate${names.length === 1 ? '' : 's'} (sub-agents): ${names.join(', ')}.\nUse the corresponding \`delegate_to_*\` tools to assign them tasks.`)
    }
    if (instr_teamRaw) parts.push(`## Team Instruction\n\n${instr_teamRaw}`)
    if (instr_delegation) parts.push(instr_delegation)
    instr_team = parts.join('\n\n')
  }

  const instructionParts = [
    // HEAD — identity & context
    instr_env,
    instr_team,
    // MIDDLE — tool capabilities
    instr_bash,
    instr_toolPriority,
    instr_fileOpening,
    instr_browser,
    instr_mcp,
    instr_skills,
    // TAIL — workflow & memory
    instr_task,
    instr_memoryBase,
    instr_memoryContext,
  ].filter((s): s is string => !!s)

  log.debug(
    { agentId: agent.id, agentName: agent.name, toolCount: Object.keys(tools).length },
    'loaded agent tools',
  )

  return {
    tools,
    instructions: instructionParts,
    warnings,
    actualMode,
    degradation,
    cleanup: async () => {
      await Promise.all(cleanups.map(fn => fn().catch(() => {})))
    },
  }
}

function buildToolPriorityInstructions(): string {
  return `# Tool Priority

- To read files, use \`readFile\` instead of \`cat\` or \`head\` in bash.
- To write files, use \`writeFile\` instead of \`echo >\` or heredoc in bash.
- Reserve bash for commands that require shell execution (installing packages, running scripts, git operations).`
}

function buildDelegationGuidelines(): string {
  return `## Delegating to Sub-agents

When delegating a task:
- Provide sufficient context — the sub-agent does not share your conversation history.
- Include specific file paths (absolute), known constraints, and what you have already tried or ruled out.
- State the expected output format (e.g., a code change, a summary, a file path).
- Avoid single-sentence prompts — a well-scoped task description saves round trips.`
}
