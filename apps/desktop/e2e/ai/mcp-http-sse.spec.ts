import { test, expect } from '../fixtures'
import { LocalHttpTestServer } from '../fixtures/local-servers'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('MCP HTTP & SSE Transport', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string
  let localServer: LocalHttpTestServer

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('MCP HTTP SSE Transport')
    projectId = project.id

    // Start local server to act as a mock MCP endpoint
    localServer = new LocalHttpTestServer()
    await localServer.start()
  })

  test.afterAll(async () => {
    await localServer?.stop()
  })

  test('can create MCP server config with HTTP transport type', async ({ helper }) => {
    test.setTimeout(60_000)

    const mcpServer = await helper.apiPost(`/api/projects/${projectId}/mcp-servers`, {
      name: 'http-mcp-test',
      transportType: 'http',
      url: localServer.url('/mcp/http'),
      description: 'Test HTTP MCP transport config',
    })

    expect(mcpServer).toBeDefined()
    expect(mcpServer.name).toBeDefined()
    expect(mcpServer.name).toBe('http-mcp-test')
    expect(mcpServer.transportType).toBe('http')

    // Verify via GET that the config persists
    const fetched = await helper.apiGet(`/api/projects/${projectId}/mcp-servers/http-mcp-test`)
    expect(fetched.transportType).toBe('http')
  })

  test('can create MCP server config with SSE transport type', async ({ helper }) => {
    test.setTimeout(60_000)

    const mcpServer = await helper.apiPost(`/api/projects/${projectId}/mcp-servers`, {
      name: 'sse-mcp-test',
      transportType: 'sse',
      url: localServer.url('/mcp/sse'),
      description: 'Test SSE MCP transport config',
    })

    expect(mcpServer).toBeDefined()
    expect(mcpServer.name).toBeDefined()
    expect(mcpServer.name).toBe('sse-mcp-test')
    expect(mcpServer.transportType).toBe('sse')

    // Verify via GET
    const fetched = await helper.apiGet(`/api/projects/${projectId}/mcp-servers/sse-mcp-test`)
    expect(fetched.transportType).toBe('sse')
  })

  test('HTTP transport connectivity test returns a result', async ({ helper }) => {
    test.setTimeout(60_000)

    // Ensure http-mcp-test exists (created in earlier test or recreate)
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

    // Test connectivity — the local server doesn't implement MCP protocol,
    // so it will fail, but the endpoint should return a structured response
    const result = await helper.apiPost(
      `/api/projects/${projectId}/mcp-servers/http-mcp-test/test`,
      {},
    )

    // The test endpoint should return a result object (ok: true/false)
    expect(result).toBeDefined()
    expect(typeof result.ok).toBe('boolean')
    // Our mock server doesn't implement MCP protocol, so expect failure
    expect(result.ok).toBe(false)
  })

  test.fixme('HTTP transport MCP tool call via AI agent', async () => {
    // Full MCP HTTP protocol compliance requires implementing the MCP spec
    // (initialize handshake, tools/list, tools/call) over HTTP streaming.
    // Local HTTP test server does not implement this protocol.
    // Needs a dedicated MCP HTTP test fixture or a real MCP HTTP server.
  })

  test.fixme('SSE transport MCP tool call via AI agent', async () => {
    // Full MCP SSE protocol compliance requires implementing SSE-based
    // MCP message framing. Local HTTP test server does not support this.
    // Needs a dedicated MCP SSE test fixture.
  })
})
