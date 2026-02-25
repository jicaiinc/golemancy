/**
 * MCP Adapter — Convert Golemancy MCPServerConfig → SDK McpServerConfig format.
 *
 * The SDK expects a Record<name, config> where each config matches one of:
 * - stdio: { type?: "stdio", command, args?, env? }
 * - sse:   { type: "sse", url, headers? }
 * - http:  { type: "http", url, headers? }
 */

import type { MCPServerConfig } from '@golemancy/shared'

/** SDK McpServerConfig union (matches @anthropic-ai/claude-agent-sdk types) */
export type SdkMcpServerConfig =
  | { type?: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'sse'; url: string; headers?: Record<string, string> }
  | { type: 'http'; url: string; headers?: Record<string, string> }

/**
 * Convert an array of Golemancy MCPServerConfig into the SDK's
 * `Record<name, McpServerConfig>` format.
 *
 * Only enabled servers with valid config are included.
 */
export function convertMcpServers(
  configs: MCPServerConfig[],
): Record<string, SdkMcpServerConfig> {
  const result: Record<string, SdkMcpServerConfig> = {}

  for (const cfg of configs) {
    if (!cfg.enabled) continue

    if (cfg.transportType === 'stdio' && cfg.command) {
      result[cfg.name] = {
        type: 'stdio',
        command: cfg.command,
        ...(cfg.args?.length ? { args: cfg.args } : {}),
        ...(cfg.env && Object.keys(cfg.env).length > 0 ? { env: cfg.env } : {}),
      }
    } else if (cfg.transportType === 'sse' && cfg.url) {
      result[cfg.name] = {
        type: 'sse',
        url: cfg.url,
        ...(cfg.headers && Object.keys(cfg.headers).length > 0 ? { headers: cfg.headers } : {}),
      }
    } else if (cfg.transportType === 'http' && cfg.url) {
      result[cfg.name] = {
        type: 'http',
        url: cfg.url,
        ...(cfg.headers && Object.keys(cfg.headers).length > 0 ? { headers: cfg.headers } : {}),
      }
    }
  }

  return result
}
