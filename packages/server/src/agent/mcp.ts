import { createMCPClient } from '@ai-sdk/mcp'
import type { ToolSet } from 'ai'
import type { MCPServerConfig } from '@solocraft/shared'
import { sanitizeToolName } from './sub-agent'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:mcp' })

interface MCPClientHandle {
  tools: ToolSet
  cleanup: () => Promise<void>
}

export async function loadAgentMcpTools(
  mcpServers: MCPServerConfig[],
): Promise<MCPClientHandle | null> {
  const enabled = mcpServers.filter(s => s.enabled)
  if (enabled.length === 0) return null

  const clients: Array<{ close: () => Promise<void> }> = []
  const allTools: ToolSet = {}

  for (const server of enabled) {
    try {
      let transport: Parameters<typeof createMCPClient>[0]['transport']

      if (server.transportType === 'stdio') {
        if (!server.command) {
          log.warn({ name: server.name }, 'stdio MCP server missing command, skipping')
          continue
        }
        const { Experimental_StdioMCPTransport } = await import('@ai-sdk/mcp/mcp-stdio')
        transport = new Experimental_StdioMCPTransport({
          command: server.command,
          args: server.args,
          env: server.env ? { ...process.env, ...server.env } as Record<string, string> : undefined,
        })
      } else if (server.transportType === 'http' || server.transportType === 'sse') {
        if (!server.url) {
          log.warn({ name: server.name, type: server.transportType }, 'MCP server missing url, skipping')
          continue
        }
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
