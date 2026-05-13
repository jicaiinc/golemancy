import { test, expect } from '../fixtures'

test.describe('Dashboard Full API', () => {
  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()

    const project = await helper.createProjectViaApi('Dashboard Full Test')
    projectId = project.id

    const agent = await helper.createAgentViaApi(projectId, 'Dashboard Agent')
    agentId = agent.id

    // Create a conversation and save messages with token data
    const conv = await helper.createConversationViaApi(projectId, agentId, 'Dashboard Conv')

    await helper.saveMessageViaApi(projectId, conv.id, {
      role: 'user',
      content: 'Hello',
      inputTokens: 100,
      outputTokens: 0,
    })
    await helper.saveMessageViaApi(projectId, conv.id, {
      role: 'assistant',
      content: 'Hi there',
      inputTokens: 0,
      outputTokens: 150,
    })
    await helper.saveMessageViaApi(projectId, conv.id, {
      role: 'user',
      content: 'Thanks',
      inputTokens: 80,
      outputTokens: 0,
    })
  })

  // ===== Project Dashboard: Summary × TimeRange =====

  test('GET summary with timeRange=today', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/summary?timeRange=today`)
    expect(data.todayTokens).toBeDefined()
    expect(data.todayTokens.total).toBeGreaterThanOrEqual(0)
    expect(data.todayTokens.input).toBeGreaterThanOrEqual(0)
    expect(data.todayTokens.output).toBeGreaterThanOrEqual(0)
  })

  test('GET summary with timeRange=7d', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/summary?timeRange=7d`)
    expect(data.todayTokens).toBeDefined()
    expect(data).toHaveProperty('totalAgents')
  })

  test('GET summary with timeRange=30d', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/summary?timeRange=30d`)
    expect(data.todayTokens).toBeDefined()
    expect(data).toHaveProperty('activeChats')
  })

  test('GET summary with no timeRange param', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/summary`)
    expect(data.todayTokens).toBeDefined()
    expect(data).toHaveProperty('totalChats')
  })

  // ===== Project Dashboard: Token by Model × TimeRange =====

  test('GET token-by-model with timeRange=today', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/token-by-model?timeRange=today`)
    expect(Array.isArray(data)).toBe(true)
  })

  test('GET token-by-model with timeRange=7d', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/token-by-model?timeRange=7d`)
    expect(Array.isArray(data)).toBe(true)
  })

  test('GET token-by-model with timeRange=30d', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/token-by-model?timeRange=30d`)
    expect(Array.isArray(data)).toBe(true)
  })

  test('GET token-by-model with no timeRange', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/token-by-model`)
    expect(Array.isArray(data)).toBe(true)
  })

  // ===== Project Dashboard: Token by Agent × TimeRange =====

  test('GET token-by-agent with timeRange=today', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/token-by-agent?timeRange=today`)
    expect(Array.isArray(data)).toBe(true)
  })

  test('GET token-by-agent with timeRange=7d', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/token-by-agent?timeRange=7d`)
    expect(Array.isArray(data)).toBe(true)
  })

  test('GET token-by-agent with timeRange=30d', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/token-by-agent?timeRange=30d`)
    expect(Array.isArray(data)).toBe(true)
  })

  test('GET token-by-agent with no timeRange', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/token-by-agent`)
    expect(Array.isArray(data)).toBe(true)
  })

  // ===== Project Dashboard: Uncovered Endpoints =====

  test('GET agent-stats returns array', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/agent-stats`)
    expect(Array.isArray(data)).toBe(true)
  })

  test('GET agent-stats with timeRange=7d', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/agent-stats?timeRange=7d`)
    expect(Array.isArray(data)).toBe(true)
  })

  test('GET recent-chats returns array', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/recent-chats`)
    expect(Array.isArray(data)).toBe(true)
  })

  test('GET recent-chats with limit respects limit', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/recent-chats?limit=5`)
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeLessThanOrEqual(5)
  })

  // ===== Project Dashboard: Token Trend =====

  test('GET token-trend with timeRange=today returns 24 entries', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/token-trend?timeRange=today`)
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBe(24)
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('date')
      expect(data[0]).toHaveProperty('inputTokens')
      expect(data[0]).toHaveProperty('outputTokens')
    }
  })

  test('GET token-trend with timeRange=7d', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/token-trend?timeRange=7d`)
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBe(7)
  })

  test('GET token-trend with timeRange=30d', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/token-trend?timeRange=30d`)
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBe(30)
  })

  // ===== Global Dashboard =====

  test('GET /api/dashboard/token-by-model returns array', async ({ helper }) => {
    const data = await helper.apiGet('/api/dashboard/token-by-model')
    expect(Array.isArray(data)).toBe(true)
  })

  test('GET /api/dashboard/token-by-agent returns array', async ({ helper }) => {
    const data = await helper.apiGet('/api/dashboard/token-by-agent')
    expect(Array.isArray(data)).toBe(true)
  })

  test('GET /api/dashboard/token-trend with timeRange=7d returns array', async ({ helper }) => {
    const data = await helper.apiGet('/api/dashboard/token-trend?timeRange=7d')
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBe(7)
  })
})
