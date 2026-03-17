import { test, expect } from '../fixtures'
import { LocalHttpTestServer } from '../fixtures/local-servers'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

/**
 * MCP HTTP/SSE config persistence and test-endpoint validation.
 *
 * COVERAGE GAP: No test in this file exercises actual MCP protocol behavior
 * (initialize handshake, tools/list, tools/call). The local test server does
 * not implement the MCP spec. These tests verify only that config records with
 * transportType 'http'/'sse' can be stored, retrieved, and that the
 * test-connectivity endpoint returns a structured failure when pointed at a
 * non-MCP server.
 *
 * Real MCP transport testing requires either:
 * - A dedicated MCP-compliant test fixture server, or
 * - An integration test against a known MCP server (e.g., mcp-server-fetch).
 */

test.describe('MCP HTTP/SSE Config Persistence', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string
  let localServer: LocalHttpTestServer

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('MCP HTTP SSE Config')
    projectId = project.id

    localServer = new LocalHttpTestServer()
    await localServer.start()
  })

  test.afterAll(async () => {
    await localServer?.stop()
  })

  test('POST /mcp-servers persists HTTP transport config', async ({ helper }) => {
    test.setTimeout(60_000)

    const mcpServer = await helper.apiPost(`/api/projects/${projectId}/mcp-servers`, {
      name: 'http-mcp-test',
      transportType: 'http',
      url: localServer.url('/mcp/http'),
      description: 'Test HTTP MCP transport config',
    })

    expect(mcpServer.name).toBe('http-mcp-test')
    expect(mcpServer.transportType).toBe('http')

    // Verify persistence via GET
    const fetched = await helper.apiGet(`/api/projects/${projectId}/mcp-servers/http-mcp-test`)
    expect(fetched.transportType).toBe('http')
    expect(fetched.url).toBe(localServer.url('/mcp/http'))
  })

  test('POST /mcp-servers persists SSE transport config', async ({ helper }) => {
    test.setTimeout(60_000)

    const mcpServer = await helper.apiPost(`/api/projects/${projectId}/mcp-servers`, {
      name: 'sse-mcp-test',
      transportType: 'sse',
      url: localServer.url('/mcp/sse'),
      description: 'Test SSE MCP transport config',
    })

    expect(mcpServer.name).toBe('sse-mcp-test')
    expect(mcpServer.transportType).toBe('sse')

    const fetched = await helper.apiGet(`/api/projects/${projectId}/mcp-servers/sse-mcp-test`)
    expect(fetched.transportType).toBe('sse')
    expect(fetched.url).toBe(localServer.url('/mcp/sse'))
  })

  test('test-connectivity endpoint returns structured failure for non-MCP server', async ({ helper }) => {
    test.setTimeout(60_000)

    // Ensure config exists
    try {
      await helper.apiGet(`/api/projects/${projectId}/mcp-servers/http-mcp-test`)
    } catch {
      await helper.apiPost(`/api/projects/${projectId}/mcp-servers`, {
        name: 'http-mcp-test',
        transportType: 'http',
        url: localServer.url('/mcp/http'),
        description: 'Test HTTP MCP transport config',
      })
    }

    // Apply unrestricted permissions so connectivity test is allowed
    const config = await helper.createPermissionsConfigViaApi(projectId, {
      title: 'Unrestricted for MCP HTTP',
      mode: 'unrestricted',
      config: {
        allowWrite: [],
        denyRead: [],
        denyWrite: [],
        networkRestrictionsEnabled: false,
        allowedDomains: [],
        deniedDomains: [],
        deniedCommands: [],
        applyToMCP: false,
      },
    })
    await helper.applyPermissionsConfig(projectId, config.id)

    // Local server doesn't implement MCP protocol — verify structured error response
    const result = await helper.apiPost(
      `/api/projects/${projectId}/mcp-servers/http-mcp-test/test`,
      {},
    )

    expect(result).toBeDefined()
    expect(typeof result.ok).toBe('boolean')
    // Non-MCP server → connectivity MUST fail. ok:true here would mean a bug.
    expect(result.ok).toBe(false)
    // Should include an error description
    if (result.error) {
      expect(typeof result.error).toBe('string')
    }
  })
})
