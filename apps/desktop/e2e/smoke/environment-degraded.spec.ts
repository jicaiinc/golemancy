import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

// Note: These tests verify runtime status and navigation stability but do NOT
// simulate actual degraded conditions (e.g., missing Python/Node). True degraded-mode
// tests require environment manipulation (removing binaries or mocking PATH) which
// is not practical in the current E2E fixture setup.
test.describe('Environment Degraded Mode', () => {
  let projectId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()
    const project = await helper.createProjectViaApi('Environment Degraded Test')
    projectId = project.id
  })

  test('GET /runtime/status returns complete structure with python and node', async ({ helper }) => {
    const status = await helper.apiGet(`/api/projects/${projectId}/runtime/status`)

    // Both keys must be present
    expect(status).toHaveProperty('python')
    expect(status).toHaveProperty('node')

    // Node should always have basic structure
    expect(status.node).toHaveProperty('available')

    // Python status should have basic structure
    expect(status.python).toHaveProperty('available')
  })

  test('app does not crash when navigating with missing runtimes', async ({ window, helper }) => {
    // Navigate through several pages to verify no crash
    await helper.navigateTo(`/projects/${projectId}`)
    await window.waitForSelector('#root > *', { state: 'attached', timeout: TIMEOUTS.PAGE_LOAD })

    await helper.navigateTo(`/projects/${projectId}/agents`)
    await window.waitForSelector('#root > *', { state: 'attached', timeout: TIMEOUTS.PAGE_LOAD })

    await helper.navigateTo(`/projects/${projectId}/chat`)
    await window.waitForSelector('#root > *', { state: 'attached', timeout: TIMEOUTS.PAGE_LOAD })

    // If we get here without error, the app survived navigation
    expect(helper.hasNoErrors()).toBe(true)
  })

  test('health endpoint remains accessible regardless of runtime state', async ({ helper }) => {
    const health = await helper.apiGet('/api/health')
    expect(health.status).toBe('ok')
    expect(health).toHaveProperty('timestamp')
  })
})
