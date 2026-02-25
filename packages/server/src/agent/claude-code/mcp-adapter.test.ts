import { describe, it, expect } from 'vitest'
import { convertMcpServers } from './mcp-adapter'
import type { MCPServerConfig } from '@golemancy/shared'

function makeMcpConfig(overrides: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    name: 'test-server',
    enabled: true,
    transportType: 'stdio',
    command: 'node',
    args: ['server.js'],
    ...overrides,
  } as MCPServerConfig
}

describe('convertMcpServers', () => {
  it('returns empty object for empty array', () => {
    expect(convertMcpServers([])).toEqual({})
  })

  it('skips disabled servers', () => {
    const configs = [makeMcpConfig({ enabled: false })]
    expect(convertMcpServers(configs)).toEqual({})
  })

  it('converts stdio server with command and args', () => {
    const configs = [makeMcpConfig({
      name: 'my-mcp',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
    })]
    const result = convertMcpServers(configs)
    expect(result).toEqual({
      'my-mcp': {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
      },
    })
  })

  it('includes env for stdio server when present', () => {
    const configs = [makeMcpConfig({
      name: 'mcp-env',
      transportType: 'stdio',
      command: 'node',
      args: [],
      env: { API_KEY: 'secret' },
    })]
    const result = convertMcpServers(configs)
    expect(result['mcp-env']).toEqual({
      type: 'stdio',
      command: 'node',
      env: { API_KEY: 'secret' },
    })
  })

  it('omits args when empty array', () => {
    const configs = [makeMcpConfig({
      name: 'no-args',
      transportType: 'stdio',
      command: 'node',
      args: [],
    })]
    const result = convertMcpServers(configs)
    expect(result['no-args']).toEqual({
      type: 'stdio',
      command: 'node',
    })
    expect(result['no-args']).not.toHaveProperty('args')
  })

  it('omits env when empty object', () => {
    const configs = [makeMcpConfig({
      name: 'no-env',
      transportType: 'stdio',
      command: 'node',
      env: {},
    })]
    const result = convertMcpServers(configs)
    expect(result['no-env']).not.toHaveProperty('env')
  })

  it('converts SSE server with url and headers', () => {
    const configs = [makeMcpConfig({
      name: 'sse-server',
      transportType: 'sse',
      url: 'https://example.com/sse',
      headers: { Authorization: 'Bearer token' },
    })]
    const result = convertMcpServers(configs)
    expect(result['sse-server']).toEqual({
      type: 'sse',
      url: 'https://example.com/sse',
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('converts HTTP server with url', () => {
    const configs = [makeMcpConfig({
      name: 'http-server',
      transportType: 'http',
      url: 'https://example.com/api',
    })]
    const result = convertMcpServers(configs)
    expect(result['http-server']).toEqual({
      type: 'http',
      url: 'https://example.com/api',
    })
  })

  it('omits headers when empty object for SSE', () => {
    const configs = [makeMcpConfig({
      name: 'sse-no-headers',
      transportType: 'sse',
      url: 'https://example.com/sse',
      headers: {},
    })]
    const result = convertMcpServers(configs)
    expect(result['sse-no-headers']).not.toHaveProperty('headers')
  })

  it('skips stdio server without command', () => {
    const configs = [makeMcpConfig({
      name: 'no-cmd',
      transportType: 'stdio',
      command: '',
    })]
    expect(convertMcpServers(configs)).toEqual({})
  })

  it('skips SSE server without url', () => {
    const configs = [makeMcpConfig({
      name: 'no-url',
      transportType: 'sse',
      url: '',
    })]
    expect(convertMcpServers(configs)).toEqual({})
  })

  it('converts multiple servers at once', () => {
    const configs = [
      makeMcpConfig({ name: 'server-a', transportType: 'stdio', command: 'node' }),
      makeMcpConfig({ name: 'server-b', transportType: 'sse', url: 'https://b.com/sse' }),
      makeMcpConfig({ name: 'disabled', transportType: 'stdio', command: 'echo', enabled: false }),
    ]
    const result = convertMcpServers(configs)
    expect(Object.keys(result)).toEqual(['server-a', 'server-b'])
  })
})
