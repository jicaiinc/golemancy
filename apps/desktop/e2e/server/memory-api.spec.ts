import { test, expect } from '../fixtures'

test.describe('Memory API', () => {
  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()
    const project = await helper.createProjectViaApi('Memory API Test')
    projectId = project.id
    const agent = await helper.createAgentViaApi(projectId, 'Memory API Agent')
    agentId = agent.id
  })

  // ===== CRUD =====

  let memoryId: string

  test('POST /memories creates a memory with required fields', async ({ helper }) => {
    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/agents/${agentId}/memories`,
      { content: 'The user prefers dark mode' },
    )
    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.id).toBeDefined()
    expect(data.content).toBe('The user prefers dark mode')
    memoryId = data.id
  })

  test('POST /memories creates a memory with all optional fields', async ({ helper }) => {
    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/agents/${agentId}/memories`,
      {
        content: 'User likes TypeScript',
        pinned: true,
        priority: 4,
        tags: ['preference', 'tech'],
      },
    )
    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.content).toBe('User likes TypeScript')
    expect(data.pinned).toBe(true)
    expect(data.priority).toBe(4)
    expect(data.tags).toContain('preference')
    expect(data.tags).toContain('tech')
  })

  test('GET /memories lists memories for agent', async ({ helper }) => {
    const list = await helper.apiGet(
      `/api/projects/${projectId}/agents/${agentId}/memories`,
    )
    expect(Array.isArray(list)).toBe(true)
    expect(list.length).toBeGreaterThanOrEqual(2)
    const found = list.find((m: any) => m.id === memoryId)
    expect(found).toBeDefined()
  })

  test('PATCH /memories/:id updates content', async ({ helper }) => {
    const updated = await helper.apiPatch(
      `/api/projects/${projectId}/agents/${agentId}/memories/${memoryId}`,
      { content: 'The user strongly prefers dark mode' },
    )
    expect(updated.content).toBe('The user strongly prefers dark mode')
  })

  test('PATCH /memories/:id updates tags', async ({ helper }) => {
    const updated = await helper.apiPatch(
      `/api/projects/${projectId}/agents/${agentId}/memories/${memoryId}`,
      { tags: ['ui', 'preference'] },
    )
    expect(updated.tags).toContain('ui')
    expect(updated.tags).toContain('preference')
  })

  // ===== Pin / Unpin =====

  test('PATCH /memories/:id pins a memory', async ({ helper }) => {
    const updated = await helper.apiPatch(
      `/api/projects/${projectId}/agents/${agentId}/memories/${memoryId}`,
      { pinned: true },
    )
    expect(updated.pinned).toBe(true)
  })

  test('PATCH /memories/:id unpins a memory', async ({ helper }) => {
    const updated = await helper.apiPatch(
      `/api/projects/${projectId}/agents/${agentId}/memories/${memoryId}`,
      { pinned: false },
    )
    expect(updated.pinned).toBe(false)
  })

  // ===== Priority =====

  test('POST /memories with priority 0 succeeds', async ({ helper }) => {
    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/agents/${agentId}/memories`,
      { content: 'Low priority note', priority: 0 },
    )
    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.priority).toBe(0)
  })

  test('POST /memories with priority 5 succeeds', async ({ helper }) => {
    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/agents/${agentId}/memories`,
      { content: 'Max priority note', priority: 5 },
    )
    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.priority).toBe(5)
  })

  test('POST /memories with priority 6 returns 400', async ({ helper }) => {
    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/agents/${agentId}/memories`,
      { content: 'Invalid priority', priority: 6 },
    )
    expect(response.status()).toBe(400)
  })

  test('POST /memories with negative priority returns 400', async ({ helper }) => {
    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/agents/${agentId}/memories`,
      { content: 'Invalid priority', priority: -1 },
    )
    expect(response.status()).toBe(400)
  })

  // ===== Validation =====

  test('POST /memories with empty content returns 400', async ({ helper }) => {
    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/agents/${agentId}/memories`,
      { content: '' },
    )
    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('CONTENT_REQUIRED')
  })

  test('POST /memories with whitespace-only content returns 400', async ({ helper }) => {
    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/agents/${agentId}/memories`,
      { content: '   ' },
    )
    expect(response.status()).toBe(400)
  })

  // ===== Delete =====

  test('DELETE /memories/:id removes a memory', async ({ helper }) => {
    // Create a disposable memory
    const resp = await helper.apiPostRaw(
      `/api/projects/${projectId}/agents/${agentId}/memories`,
      { content: 'To be deleted' },
    )
    const mem = await resp.json()

    const result = await helper.apiDelete(
      `/api/projects/${projectId}/agents/${agentId}/memories/${mem.id}`,
    )
    expect(result.ok).toBe(true)

    // Verify it's gone from the list
    const list = await helper.apiGet(
      `/api/projects/${projectId}/agents/${agentId}/memories`,
    )
    const found = list.find((m: any) => m.id === mem.id)
    expect(found).toBeUndefined()
  })
})
