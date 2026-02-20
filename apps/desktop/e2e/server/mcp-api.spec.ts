import { test, expect } from '../fixtures'

test.describe('MCP API', () => {
  let projectId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()

    const project = await helper.createProjectViaApi('MCP API Test')
    projectId = project.id
  })

  // ===== CRUD =====

  test('POST /mcp-servers creates a stdio server', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/mcp-servers`, {
      name: 'test-stdio',
      transportType: 'stdio',
      command: 'echo',
      args: ['hello'],
      description: 'Test stdio server',
    })
    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.name).toBe('test-stdio')
    expect(data.transportType).toBe('stdio')
  })

  test('POST /mcp-servers creates an SSE server', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/mcp-servers`, {
      name: 'test-sse',
      transportType: 'sse',
      url: 'http://localhost:9999/sse',
      description: 'Test SSE server',
    })
    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.name).toBe('test-sse')
    expect(data.transportType).toBe('sse')
  })

  test('GET /mcp-servers lists both servers', async ({ helper }) => {
    const list = await helper.apiGet(`/api/projects/${projectId}/mcp-servers`)
    expect(Array.isArray(list)).toBe(true)
    const names = list.map((s: any) => s.name)
    expect(names).toContain('test-stdio')
    expect(names).toContain('test-sse')
  })

  test('GET /mcp-servers/:name returns server by name', async ({ helper }) => {
    const server = await helper.apiGet(`/api/projects/${projectId}/mcp-servers/test-stdio`)
    expect(server.name).toBe('test-stdio')
    expect(server.transportType).toBe('stdio')
    expect(server.command).toBe('echo')
    expect(server.description).toBe('Test stdio server')
  })

  test('PATCH /mcp-servers/:name updates description', async ({ helper }) => {
    const updated = await helper.apiPatch(`/api/projects/${projectId}/mcp-servers/test-stdio`, {
      description: 'Updated stdio server description',
    })
    expect(updated.description).toBe('Updated stdio server description')
  })

  test('POST /mcp-servers/:name/test tests connectivity', async ({ helper }) => {
    // The dummy echo server won't be a real MCP — expect ok:false or an error field
    const result = await helper.apiPost(`/api/projects/${projectId}/mcp-servers/test-stdio/test`, {})
    expect(result).toHaveProperty('ok')
    // A fake echo command is not a valid MCP server, so ok should be false
    expect(result.ok).toBe(false)
  })

  test('POST /mcp-servers with duplicate name returns 409', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/mcp-servers`, {
      name: 'test-stdio',
      transportType: 'stdio',
      command: 'echo',
      args: ['dup'],
    })
    expect(response.status()).toBe(409)
  })

  test('DELETE /mcp-servers/:name deletes unreferenced server', async ({ helper }) => {
    const result = await helper.apiDelete(`/api/projects/${projectId}/mcp-servers/test-stdio`)
    expect(result.ok).toBe(true)
  })

  test('DELETE /mcp-servers/:name returns 409 when referenced by agent', async ({ helper }) => {
    // Create an agent then PATCH to add MCP reference
    // (POST /agents always initializes mcpServers to [], so we must PATCH after creation)
    const agent = await helper.createAgentViaApi(projectId, 'MCP Ref Agent')
    await helper.apiPatch(`/api/projects/${projectId}/agents/${agent.id}`, {
      mcpServers: ['test-sse'],
    })

    const response = await helper.apiDeleteRaw(`/api/projects/${projectId}/mcp-servers/test-sse`)
    expect(response.status()).toBe(409)
    const body = await response.json()
    expect(body.error).toBeDefined()
    expect(body.agents).toBeDefined()
    expect(body.agents.length).toBeGreaterThanOrEqual(1)
  })
})
