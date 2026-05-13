import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Dashboard API', () => {
  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Dashboard API Test')

    // Navigate to agents page and create an agent
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await helper.createAgent('API Test Agent')
  })

  // ===== Project Dashboard API =====

  test('dashboard summary returns valid structure', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/summary`)
    expect(data.todayTokens).toBeDefined()
    expect(data.todayTokens.total).toBeGreaterThanOrEqual(0)
    expect(data.todayTokens.input).toBeGreaterThanOrEqual(0)
    expect(data.todayTokens.output).toBeGreaterThanOrEqual(0)
    expect(data.todayTokens.callCount).toBeGreaterThanOrEqual(0)
    expect(data.totalAgents).toBeGreaterThanOrEqual(1)
    expect(data.activeChats).toBeGreaterThanOrEqual(0)
    expect(data.totalChats).toBeGreaterThanOrEqual(0)
  })

  test('dashboard summary with timeRange param', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/summary?timeRange=7d`)
    expect(data.todayTokens).toBeDefined()
    expect(data.todayTokens.total).toBeGreaterThanOrEqual(0)
  })

  test('token-by-model returns array', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/token-by-model`)
    expect(Array.isArray(data)).toBe(true)
  })

  test('token-by-agent returns array', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/token-by-agent`)
    expect(Array.isArray(data)).toBe(true)
  })

  test('token-trend returns 24 hourly entries for today', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/token-trend?timeRange=today`)
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBe(24)
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('date')
      expect(data[0]).toHaveProperty('inputTokens')
      expect(data[0]).toHaveProperty('outputTokens')
    }
  })

  test('runtime-status returns valid structure', async ({ helper }) => {
    const data = await helper.apiGet(`/api/projects/${projectId}/dashboard/runtime-status`)
    expect(Array.isArray(data.runningChats)).toBe(true)
    expect(Array.isArray(data.runningCrons)).toBe(true)
    expect(Array.isArray(data.upcoming)).toBe(true)
    expect(Array.isArray(data.recentCompleted)).toBe(true)
  })

  // ===== Global Dashboard API =====
  // Note: global dashboard is mounted at /api/dashboard (not /api/global-dashboard)

  test('global dashboard summary returns valid structure', async ({ helper }) => {
    const data = await helper.apiGet('/api/dashboard/summary')
    expect(data.todayTokens).toBeDefined()
    expect(data.todayTokens.total).toBeGreaterThanOrEqual(0)
    expect(data.totalAgents).toBeGreaterThanOrEqual(1)
  })

  test('global dashboard token-by-project returns array with at least 1 project', async ({ helper }) => {
    const data = await helper.apiGet('/api/dashboard/token-by-project')
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThanOrEqual(1)
  })

  test('global dashboard runtime-status returns valid structure', async ({ helper }) => {
    const data = await helper.apiGet('/api/dashboard/runtime-status')
    expect(Array.isArray(data.runningChats)).toBe(true)
    expect(Array.isArray(data.runningCrons)).toBe(true)
  })
})
