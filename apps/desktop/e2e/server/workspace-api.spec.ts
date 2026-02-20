import { test, expect } from '../fixtures'

test.describe('Workspace API', () => {
  let projectId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()

    const project = await helper.createProjectViaApi('Workspace API Test')
    projectId = project.id
  })

  // ===== List =====

  test('GET /workspace lists root directory as array', async ({ helper }) => {
    const entries = await helper.apiGet(`/api/projects/${projectId}/workspace`)
    expect(Array.isArray(entries)).toBe(true)
  })

  test('GET /workspace response entries are valid objects', async ({ helper }) => {
    const entries = await helper.apiGet(`/api/projects/${projectId}/workspace`)
    expect(Array.isArray(entries)).toBe(true)
    // Each entry (if any) should have name and type fields
    for (const entry of entries) {
      expect(entry).toHaveProperty('name')
      expect(entry).toHaveProperty('type')
    }
  })

  test('GET /workspace?path=nonexistent returns empty array', async ({ helper }) => {
    const entries = await helper.apiGet(`/api/projects/${projectId}/workspace?path=nonexistent-dir-xyz`)
    expect(Array.isArray(entries)).toBe(true)
    expect(entries.length).toBe(0)
  })

  // ===== File =====

  test('GET /workspace/file without path returns 400', async ({ helper }) => {
    const response = await helper.apiGetRaw(`/api/projects/${projectId}/workspace/file`)
    expect(response.status()).toBe(400)
  })

  test('GET /workspace/file?path=nonexistent.txt returns 404', async ({ helper }) => {
    const response = await helper.apiGetRaw(`/api/projects/${projectId}/workspace/file?path=nonexistent.txt`)
    expect(response.status()).toBe(404)
  })

  // ===== Delete =====

  test('DELETE /workspace/file without path returns 400', async ({ helper }) => {
    const response = await helper.apiDeleteRaw(`/api/projects/${projectId}/workspace/file`)
    expect(response.status()).toBe(400)
  })
})
