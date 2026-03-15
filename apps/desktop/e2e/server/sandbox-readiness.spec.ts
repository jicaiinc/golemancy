import { test, expect } from '../fixtures'

test.describe('Sandbox Readiness API', () => {
  let projectId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()

    const project = await helper.createProjectViaApi('Sandbox Readiness Test')
    projectId = project.id
  })

  test('GET /sandbox/readiness returns correct structure', async ({ helper }) => {
    const result = await helper.apiGet(`/api/sandbox/readiness`)

    // Must have 'available' boolean and 'issues' array
    expect(result).toHaveProperty('available')
    expect(typeof result.available).toBe('boolean')
    expect(result).toHaveProperty('issues')
    expect(Array.isArray(result.issues)).toBe(true)
  })

  test('GET /sandbox/readiness with projectId returns structure', async ({ helper }) => {
    const result = await helper.apiGet(`/api/sandbox/readiness?projectId=${projectId}`)

    expect(result).toHaveProperty('available')
    expect(typeof result.available).toBe('boolean')
    expect(result).toHaveProperty('issues')
    expect(Array.isArray(result.issues)).toBe(true)
  })

  test('issues array items have correct shape when present', async ({ helper }) => {
    const result = await helper.apiGet(`/api/sandbox/readiness?projectId=${projectId}`)

    // Each issue (if any) should have component + message
    for (const issue of result.issues) {
      expect(issue).toHaveProperty('component')
      expect(typeof issue.component).toBe('string')
      expect(issue).toHaveProperty('message')
      expect(typeof issue.message).toBe('string')
      // 'fix' is optional but if present must be a string
      if (issue.fix !== undefined) {
        expect(typeof issue.fix).toBe('string')
      }
    }
  })

  test('available is true when no issues', async ({ helper }) => {
    const result = await helper.apiGet(`/api/sandbox/readiness`)

    // If issues is empty, available must be true (and vice versa)
    if (result.issues.length === 0) {
      expect(result.available).toBe(true)
    } else {
      expect(result.available).toBe(false)
    }
  })

  test('readiness with non-existent projectId still returns structure', async ({ helper }) => {
    const result = await helper.apiGet(`/api/sandbox/readiness?projectId=non-existent-project-id`)

    // Should still return valid structure (may have workspace issue)
    expect(result).toHaveProperty('available')
    expect(result).toHaveProperty('issues')
    expect(Array.isArray(result.issues)).toBe(true)
  })
})
