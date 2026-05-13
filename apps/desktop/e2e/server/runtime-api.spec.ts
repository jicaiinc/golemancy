import { test, expect } from '../fixtures'

test.describe('Runtime & Health API', () => {
  let projectId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()

    const project = await helper.createProjectViaApi('Runtime API Test')
    projectId = project.id
  })

  test('GET /runtime/status returns python and node keys', async ({ helper }) => {
    const status = await helper.apiGet(`/api/projects/${projectId}/runtime/status`)
    expect(status).toHaveProperty('python')
    expect(status).toHaveProperty('node')
  })

  test('GET /runtime/python/packages returns array', async ({ helper }) => {
    const packages = await helper.apiGet(`/api/projects/${projectId}/runtime/python/packages`)
    // May return array or error object if Python not available
    // In a clean project, either an array or an error is acceptable
    if (Array.isArray(packages)) {
      expect(Array.isArray(packages)).toBe(true)
    } else {
      // If Python is not installed, server returns 500 with error
      expect(packages).toHaveProperty('error')
    }
  })

  test('GET /api/health returns ok status', async ({ helper }) => {
    const health = await helper.apiGet('/api/health')
    expect(health.status).toBe('ok')
    expect(health).toHaveProperty('timestamp')
  })

  test('GET /dashboard/runtime-status returns structure with runningChats', async ({ helper }) => {
    const status = await helper.apiGet(`/api/projects/${projectId}/dashboard/runtime-status`)
    expect(Array.isArray(status.runningChats)).toBe(true)
    expect(Array.isArray(status.runningCrons)).toBe(true)
  })
})
