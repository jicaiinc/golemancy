import { createMCPClient } from '@ai-sdk/mcp'
import type { ToolSet } from 'ai'
import type { MCPServerConfig, PermissionsConfig, ProjectId, ResolvedPermissionsConfig, SandboxConfig, SupportedPlatform } from '@golemancy/shared'
import { isSandboxRuntimeSupported } from '@golemancy/shared'
import { sanitizeToolName } from './sub-agent'
import { sandboxPool } from './sandbox-pool'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:mcp' })

interface MCPClientHandle {
  tools: ToolSet
  cleanup: () => Promise<void>
}

export interface MCPSandboxOptions {
  projectId: ProjectId
  resolvedPermissions: ResolvedPermissionsConfig
}

export async function loadAgentMcpTools(
  mcpServers: MCPServerConfig[],
  sandboxOptions?: MCPSandboxOptions,
): Promise<MCPClientHandle | null> {
  const enabled = mcpServers.filter(s => s.enabled)
  if (enabled.length === 0) return null

  const clients: Array<{ close: () => Promise<void> }> = []
  const allTools: ToolSet = {}

  // Determine if stdio MCP commands should be sandbox-wrapped
  const platform = process.platform as SupportedPlatform
  const shouldSandbox = !!(
    sandboxOptions
    && sandboxOptions.resolvedPermissions.config.applyToMCP
    && sandboxOptions.resolvedPermissions.mode === 'sandbox'
    && isSandboxRuntimeSupported(platform)
  )

  for (const server of enabled) {
    try {
      let transport: Parameters<typeof createMCPClient>[0]['transport']

      if (server.transportType === 'stdio') {
        if (!server.command) {
          log.warn({ name: server.name }, 'stdio MCP server missing command, skipping')
          continue
        }

        let effectiveCommand = server.command
        let effectiveArgs = server.args ?? []

        if (shouldSandbox) {
          try {
            const sandboxConfig = permissionsToSandboxConfig(sandboxOptions!.resolvedPermissions.config)
            const handle = await sandboxPool.getHandle(sandboxOptions!.projectId, {
              mode: 'sandbox',
              sandbox: sandboxConfig,
              usesDedicatedWorker: true,
            })

            // Build full command string and wrap with sandbox runtime
            const fullCommand = buildShellCommand(server.command, server.args)
            const wrappedCommand = await handle.wrapWithSandbox(fullCommand)

            log.info(
              {
                name: server.name,
                originalCommand: server.command,
                originalArgs: server.args,
                wrappedCommand,
              },
              'MCP server command wrapped with sandbox',
            )

            effectiveCommand = 'bash'
            effectiveArgs = ['-c', wrappedCommand]
          } catch (err) {
            log.warn(
              { err, name: server.name },
              'failed to wrap MCP command with sandbox, proceeding without sandbox',
            )
          }
        }

        log.info(
          { name: server.name, command: effectiveCommand, args: effectiveArgs },
          'starting stdio MCP server',
        )

        const { Experimental_StdioMCPTransport } = await import('@ai-sdk/mcp/mcp-stdio')
        transport = new Experimental_StdioMCPTransport({
          command: effectiveCommand,
          args: effectiveArgs,
          env: server.env ? { ...process.env, ...server.env } as Record<string, string> : undefined,
        })
      } else if (server.transportType === 'http' || server.transportType === 'sse') {
        if (!server.url) {
          log.warn({ name: server.name, type: server.transportType }, 'MCP server missing url, skipping')
          continue
        }

        log.info(
          { name: server.name, type: server.transportType, url: server.url },
          'connecting to remote MCP server',
        )

        transport = {
          type: server.transportType,
          url: server.url,
          headers: server.headers,
        }
      } else {
        log.warn({ name: server.name, type: server.transportType }, 'unknown MCP transport type, skipping')
        continue
      }

      const client = await createMCPClient({ transport })
      clients.push(client)

      const tools = await client.tools()
      // Sanitize tool names — some providers (e.g. Google Gemini) enforce strict naming rules
      for (const [toolName, toolDef] of Object.entries(tools)) {
        const rawName = enabled.length > 1 ? `${server.name}_${toolName}` : toolName
        allTools[sanitizeToolName(rawName)] = toolDef
      }

      log.debug({ name: server.name, toolCount: Object.keys(tools).length }, 'loaded MCP server tools')
    } catch (err) {
      log.error({ err, name: server.name }, 'failed to connect to MCP server')
    }
  }

  if (Object.keys(allTools).length === 0 && clients.length === 0) return null

  return {
    tools: allTools,
    cleanup: async () => {
      await Promise.all(clients.map(c => c.close().catch(() => {})))
    },
  }
}

/**
 * Build a shell-safe command string from command + args.
 * Escapes arguments that contain shell-special characters.
 */
function buildShellCommand(command: string, args?: string[]): string {
  const parts = [shellEscape(command)]
  if (args) {
    parts.push(...args.map(shellEscape))
  }
  return parts.join(' ')
}

/**
 * Shell-escape a string. Simple strings pass through; others get single-quoted.
 */
function shellEscape(s: string): string {
  if (/^[a-zA-Z0-9._\-/=:@]+$/.test(s)) return s
  return `'${s.replace(/'/g, "'\\''")}'`
}

/**
 * Bridge PermissionsConfig to SandboxConfig for sandboxPool.getHandle().
 * Duplicated from builtin-tools.ts to avoid heavy transitive dependencies.
 */
function permissionsToSandboxConfig(pc: PermissionsConfig): SandboxConfig {
  return {
    filesystem: {
      allowWrite: pc.allowWrite,
      denyRead: pc.denyRead,
      denyWrite: pc.denyWrite,
      allowGitConfig: false,
    },
    network: {
      allowedDomains: pc.allowedDomains,
    },
    enablePython: true,
    deniedCommands: pc.deniedCommands,
  }
}
