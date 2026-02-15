import type { ToolSet } from 'ai'
import type { MCPServerConfig, ProjectId, SupportedPlatform } from '@golemancy/shared'
import { isSandboxRuntimeSupported } from '@golemancy/shared'
import { sanitizeToolName } from './sub-agent'
import { mcpPool } from './mcp-pool'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:mcp' })

export interface MCPLoadOptions {
  projectId: ProjectId
  /** Project workspace directory — used as default cwd for stdio MCP servers */
  workspaceDir: string
  resolvedPermissions: import('@golemancy/shared').ResolvedPermissionsConfig
}

export interface MCPLoadResult {
  tools: ToolSet
  /** Warnings about servers that failed to load (for UI display, not for agent context). */
  warnings: string[]
}

/**
 * Load all MCP tools for an agent, using the connection pool.
 *
 * - Filters out disabled servers
 * - Restricted mode: blocks all stdio servers (requirement #11)
 * - Delegates to mcpPool.getTools() for each server (pool manages lifecycle)
 * - Prefixes tool names when multiple servers are loaded
 * - Collects warnings for failed connections
 */
export async function loadAgentMcpTools(
  mcpServers: MCPServerConfig[],
  options?: MCPLoadOptions,
): Promise<MCPLoadResult> {
  const warnings: string[] = []
  const enabled = mcpServers.filter(s => s.enabled)
  if (enabled.length === 0) return { tools: {}, warnings }

  const mode = options?.resolvedPermissions.mode
  const platform = process.platform as SupportedPlatform

  // ── Permission Mode Filtering ──────────────────────────
  // Requirement #11: restricted mode → block ALL stdio
  // This is runtime-only filtering — mcp.json is NOT modified.
  let filtered: MCPServerConfig[]
  if (mode === 'restricted') {
    filtered = enabled.filter(s => s.transportType !== 'stdio')
    const blocked = enabled.length - filtered.length
    if (blocked > 0) {
      log.info({ blocked }, 'restricted mode: filtered out stdio MCP servers')
      const blockedNames = enabled.filter(s => s.transportType === 'stdio').map(s => s.name)
      for (const name of blockedNames) {
        warnings.push(`MCP server "${name}" blocked: stdio servers are disabled in restricted mode`)
      }
    }
  } else {
    filtered = enabled
  }

  if (filtered.length === 0) return { tools: {}, warnings }

  // ── shouldSandbox Decision Log (Requirement #22) ────────
  const shouldSandbox = !!(
    options
    && options.resolvedPermissions.config.applyToMCP
    && mode === 'sandbox'
    && isSandboxRuntimeSupported(platform)
  )
  log.debug(
    { shouldSandbox, mode, applyToMCP: options?.resolvedPermissions.config.applyToMCP, platform },
    'MCP sandbox decision',
  )

  // ── Pool-based tool loading ─────────────────────────────
  const allTools: ToolSet = {}

  for (const server of filtered) {
    const result = await mcpPool.getTools(server, options)
    if (result.error) {
      warnings.push(`MCP server "${server.name}" failed to load: ${result.error}`)
    }
    for (const [toolName, toolDef] of Object.entries(result.tools)) {
      const rawName = filtered.length > 1 ? `${server.name}_${toolName}` : toolName
      allTools[sanitizeToolName(rawName)] = toolDef
    }
  }

  return { tools: allTools, warnings }
}
