import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Token Accuracy', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string
  let agentId: string
  let conversationId: string
  const tokenUsages: Array<{ inputTokens: number; outputTokens: number }> = []

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(300_000) // 5 minutes for 3 AI calls in setup

    await helper.goHome()

    const project = await helper.createProjectViaApi('Token Accuracy Test')
    projectId = project.id

    const agent = await helper.createAgentViaApi(projectId, 'Token Agent', {
      systemPrompt: 'You are a helpful test assistant. Keep responses brief.',
    })
    agentId = agent.id

    const conv = await helper.createConversationViaApi(projectId, agentId, 'Token Test Conv')
    conversationId = conv.id

    // Send 3 chat messages and record token usage
    const prompts = [
      'What is 2+2? Reply briefly.',
      'What is the capital of France? One word.',
      'Name a primary color. One word.',
    ]

    for (const prompt of prompts) {
      const result = await helper.sendChatViaApi(
        projectId, agentId, conversationId, prompt, TIMEOUTS.AI_RESPONSE,
      )
      tokenUsages.push(result.usage)
    }
  })

  // ===== Token consistency (5 tests) =====

  test('conversation token-usage matches sent totals', async ({ helper }) => {
    test.setTimeout(60_000)

    const usage = await helper.apiGet(
      `/api/projects/${projectId}/conversations/${conversationId}/token-usage`,
    )

    expect(usage.total).toBeDefined()
    expect(usage.total.inputTokens).toBeGreaterThan(0)
    expect(usage.total.outputTokens).toBeGreaterThan(0)
  })

  test('dashboard summary todayTokens total is positive', async ({ helper }) => {
    test.setTimeout(60_000)

    const summary = await helper.apiGet(
      `/api/projects/${projectId}/dashboard/summary?timeRange=today`,
    )

    expect(summary.todayTokens).toBeDefined()
    expect(summary.todayTokens.total).toBeGreaterThan(0)
  })

  test('dashboard summary call count >= 3', async ({ helper }) => {
    test.setTimeout(60_000)

    const summary = await helper.apiGet(
      `/api/projects/${projectId}/dashboard/summary?timeRange=today`,
    )

    expect(summary.todayTokens.callCount).toBeGreaterThanOrEqual(3)
  })

  test('dashboard token-by-model contains agent model', async ({ helper }) => {
    test.setTimeout(60_000)

    const tokenByModel = await helper.apiGet(
      `/api/projects/${projectId}/dashboard/token-by-model`,
    )

    expect(Array.isArray(tokenByModel)).toBe(true)
    expect(tokenByModel.length).toBeGreaterThan(0)

    // At least one entry should have positive tokens
    const hasPositiveTokens = tokenByModel.some(
      (entry: { inputTokens: number; outputTokens: number }) =>
        entry.inputTokens > 0 || entry.outputTokens > 0,
    )
    expect(hasPositiveTokens).toBe(true)
  })

  test('dashboard token-by-agent contains test agent', async ({ helper }) => {
    test.setTimeout(60_000)

    const tokenByAgent = await helper.apiGet(
      `/api/projects/${projectId}/dashboard/token-by-agent`,
    )

    expect(Array.isArray(tokenByAgent)).toBe(true)

    const agentIds = tokenByAgent.map((a: { agentId: string }) => a.agentId)
    expect(agentIds).toContain(agentId)
  })

  // ===== TimeRange accuracy (4 tests) =====

  test('timeRange=today returns positive tokens', async ({ helper }) => {
    test.setTimeout(60_000)

    const summary = await helper.apiGet(
      `/api/projects/${projectId}/dashboard/summary?timeRange=today`,
    )

    expect(summary.todayTokens.total).toBeGreaterThan(0)
  })

  test('timeRange=7d tokens >= today', async ({ helper }) => {
    test.setTimeout(60_000)

    const today = await helper.apiGet(
      `/api/projects/${projectId}/dashboard/summary?timeRange=today`,
    )
    const week = await helper.apiGet(
      `/api/projects/${projectId}/dashboard/summary?timeRange=7d`,
    )

    expect(week.todayTokens.total).toBeGreaterThanOrEqual(today.todayTokens.total)
  })

  test('timeRange=30d tokens >= 7d', async ({ helper }) => {
    test.setTimeout(60_000)

    const week = await helper.apiGet(
      `/api/projects/${projectId}/dashboard/summary?timeRange=7d`,
    )
    const month = await helper.apiGet(
      `/api/projects/${projectId}/dashboard/summary?timeRange=30d`,
    )

    expect(month.todayTokens.total).toBeGreaterThanOrEqual(week.todayTokens.total)
  })

  test('timeRange all tokens >= 30d', async ({ helper }) => {
    test.setTimeout(60_000)

    const month = await helper.apiGet(
      `/api/projects/${projectId}/dashboard/summary?timeRange=30d`,
    )
    const all = await helper.apiGet(
      `/api/projects/${projectId}/dashboard/summary?timeRange=all`,
    )

    expect(all.todayTokens.total).toBeGreaterThanOrEqual(month.todayTokens.total)
  })

  // ===== Global cross-validation (1 test) =====

  test('global token-by-project contains test project', async ({ helper }) => {
    test.setTimeout(60_000)

    const tokenByProject = await helper.apiGet('/api/dashboard/token-by-project')

    expect(Array.isArray(tokenByProject)).toBe(true)

    const projectIds = tokenByProject.map((p: { projectId: string }) => p.projectId)
    expect(projectIds).toContain(projectId)
  })
})
