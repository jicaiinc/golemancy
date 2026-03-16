import { test, expect } from '../fixtures'

test.describe('MCP Error Handling', () => {
  let projectId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()
    const project = await helper.createProjectViaApi('MCP Error Handling Test')
    projectId = project.id
  })

  test('invalid command MCP server returns ok:false on test', async ({ helper }) => {
    // Create an MCP server with an invalid/nonexistent command
    const createResp = await helper.apiPostRaw(`/api/projects/${projectId}/mcp-servers`, {
      name: 'bad-command-mcp',
      transportType: 'stdio',
      command: '/nonexistent/binary/that/does/not/exist',
      args: [],
      description: 'MCP with invalid command',
    })
    expect(createResp.status()).toBe(201)

    // Test connectivity — should fail
    const testResult = await helper.apiPost(
      `/api/projects/${projectId}/mcp-servers/bad-command-mcp/test`,
      {},
    )
    expect(testResult.ok).toBe(false)
    // Error message should be present and meaningful
    expect(testResult.error).toBeDefined()
    expect(typeof testResult.error).toBe('string')
    expect(testResult.error.length).toBeGreaterThan(0)
  })

  test('duplicate MCP server name returns 409', async ({ helper }) => {
    // Create first server
    const resp1 = await helper.apiPostRaw(`/api/projects/${projectId}/mcp-servers`, {
      name: 'duplicate-test',
      transportType: 'stdio',
      command: 'echo',
      args: ['test'],
    })
    expect(resp1.status()).toBe(201)

    // Try to create another with the same name
    const resp2 = await helper.apiPostRaw(`/api/projects/${projectId}/mcp-servers`, {
      name: 'duplicate-test',
      transportType: 'stdio',
      command: 'echo',
      args: ['test2'],
    })
    expect(resp2.status()).toBe(409)

    const body = await resp2.json()
    expect(body.error).toBe('MCP_SERVER_DUPLICATE')
  })

  test('invalid transport type returns 400', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/mcp-servers`, {
      name: 'bad-transport',
      transportType: 'websocket', // not a valid type
      command: 'echo',
    })
    expect(response.status()).toBe(400)

    const body = await response.json()
    expect(body.error).toBe('INVALID_TRANSPORT_TYPE')
  })

  test('test non-existent MCP server returns 404', async ({ helper }) => {
    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/mcp-servers/does-not-exist/test`,
      {},
    )
    expect(response.status()).toBe(404)
  })

  test('empty name returns 400', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/mcp-servers`, {
      name: '',
      transportType: 'stdio',
      command: 'echo',
    })
    expect(response.status()).toBe(400)

    const body = await response.json()
    expect(body.error).toBe('NAME_REQUIRED')
  })
})
