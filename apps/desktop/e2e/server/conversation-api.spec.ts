import { test, expect } from '../fixtures'

test.describe('Conversation API', () => {
  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()

    const project = await helper.createProjectViaApi('Conv API Test')
    projectId = project.id

    const agent = await helper.createAgentViaApi(projectId, 'Conv Test Agent')
    agentId = agent.id
  })

  // ===== CRUD =====

  let conversationId: string

  test('POST /conversations creates a conversation', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/conversations`, {
      agentId,
      title: 'Test Conversation',
    })
    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.id).toBeDefined()
    expect(data.agentId).toBe(agentId)
    expect(data.title).toBe('Test Conversation')
    conversationId = data.id
  })

  test('GET /conversations lists conversations', async ({ helper }) => {
    const list = await helper.apiGet(`/api/projects/${projectId}/conversations`)
    expect(Array.isArray(list)).toBe(true)
    const found = list.find((c: any) => c.id === conversationId)
    expect(found).toBeDefined()
  })

  test('GET /conversations?agentId= filters by agent', async ({ helper }) => {
    // Create a second agent and conversation
    const agent2 = await helper.createAgentViaApi(projectId, 'Other Agent')
    await helper.createConversationViaApi(projectId, agent2.id, 'Other Conv')

    const filtered = await helper.apiGet(
      `/api/projects/${projectId}/conversations?agentId=${agentId}`,
    )
    expect(Array.isArray(filtered)).toBe(true)
    expect(filtered.length).toBeGreaterThanOrEqual(1)
    for (const conv of filtered) {
      expect(conv.agentId).toBe(agentId)
    }
  })

  test('GET /conversations/:id returns single conversation', async ({ helper }) => {
    const conv = await helper.apiGet(`/api/projects/${projectId}/conversations/${conversationId}`)
    expect(conv.id).toBe(conversationId)
    expect(conv.agentId).toBe(agentId)
  })

  test('PATCH /conversations/:id updates title', async ({ helper }) => {
    const updated = await helper.apiPatch(
      `/api/projects/${projectId}/conversations/${conversationId}`,
      { title: 'Updated Title' },
    )
    expect(updated.title).toBe('Updated Title')
  })

  // ===== Messages =====

  test('POST messages saves a user message', async ({ helper }) => {
    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/conversations/${conversationId}/messages`,
      {
        id: 'msg-user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello world' }],
        content: 'Hello world',
      },
    )
    expect(response.status()).toBe(201)
  })

  test('POST messages saves an assistant message with token fields', async ({ helper }) => {
    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/conversations/${conversationId}/messages`,
      {
        id: 'msg-asst-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hi there!' }],
        content: 'Hi there!',
        inputTokens: 10,
        outputTokens: 20,
      },
    )
    expect(response.status()).toBe(201)
  })

  test('GET messages returns paginated results', async ({ helper }) => {
    const result = await helper.apiGet(
      `/api/projects/${projectId}/conversations/${conversationId}/messages?page=1&pageSize=10`,
    )
    expect(result.items).toBeDefined()
    expect(Array.isArray(result.items)).toBe(true)
    expect(typeof result.hasMore).toBe('boolean')
    expect(result.items.length).toBeGreaterThanOrEqual(2)
  })

  test('GET messages returns oldest first', async ({ helper }) => {
    const result = await helper.apiGet(
      `/api/projects/${projectId}/conversations/${conversationId}/messages`,
    )
    const items = result.items as Array<{ role: string }>
    // First message should be user, second assistant (by insert order)
    expect(items[0].role).toBe('user')
    expect(items[1].role).toBe('assistant')
  })

  test('GET /messages/search finds saved message via FTS5', async ({ helper }) => {
    // FTS5 search for a unique word in the user message
    const result = await helper.apiGet(
      `/api/projects/${projectId}/conversations/messages/search?q=Hello`,
    )
    expect(result.items).toBeDefined()
    expect(result.total).toBeGreaterThanOrEqual(1)
  })

  test('GET /token-usage returns usage structure', async ({ helper }) => {
    const usage = await helper.apiGet(
      `/api/projects/${projectId}/conversations/${conversationId}/token-usage`,
    )
    expect(usage).toHaveProperty('total')
    expect(usage).toHaveProperty('byAgent')
    expect(usage).toHaveProperty('byModel')
    expect(Array.isArray(usage.byAgent)).toBe(true)
    expect(Array.isArray(usage.byModel)).toBe(true)
  })

  // ===== Delete =====

  test('DELETE /conversations/:id removes conversation', async ({ helper }) => {
    const delResult = await helper.apiDelete(
      `/api/projects/${projectId}/conversations/${conversationId}`,
    )
    expect(delResult.ok).toBe(true)

    const response = await helper.apiGetRaw(
      `/api/projects/${projectId}/conversations/${conversationId}`,
    )
    expect(response.status()).toBe(404)
  })
})
