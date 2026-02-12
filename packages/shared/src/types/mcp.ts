export type MCPTransportType = 'stdio' | 'sse' | 'http'

export interface MCPServerConfig {
  /** Unique name for this MCP server */
  name: string
  /** Transport type */
  transportType: MCPTransportType
  /** Human-readable description */
  description?: string
  /** For stdio: command to run */
  command?: string
  /** For stdio: command arguments */
  args?: string[]
  /** For stdio: environment variables */
  env?: Record<string, string>
  /** For stdio: working directory */
  cwd?: string
  /** For sse/http: server URL */
  url?: string
  /** For sse/http: custom headers */
  headers?: Record<string, string>
  /** Whether this MCP server is enabled */
  enabled: boolean
}

/** Shape of projects/{projectId}/mcp.json */
export interface MCPProjectFile {
  mcpServers: Record<string, Omit<MCPServerConfig, 'name'>>
}

export type MCPServerCreateData = Omit<MCPServerConfig, 'enabled'> & { enabled?: boolean }
export type MCPServerUpdateData = Partial<Omit<MCPServerConfig, 'name'>>
