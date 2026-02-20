import { test, expect } from '../fixtures'

test.describe('Memory API', () => {
  let projectId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()

    const project = await helper.createProjectViaApi('Memory API Test')
    projectId = project.id
  })

  // ===== CRUD =====

  let memoryId: string

  test('POST /memories creates a memory entry', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/memories`, {
      content: 'User prefers dark theme',
      source: 'manual',
      tags: ['preference', 'ui'],
    })
    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.id).toBeDefined()
    memoryId = data.id
  })

  test('GET /memories lists memories including created one', async ({ helper }) => {
    const list = await helper.apiGet(`/api/projects/${projectId}/memories`)
    expect(Array.isArray(list)).toBe(true)
    const found = list.find((m: any) => m.id === memoryId)
    expect(found).toBeDefined()
  })

  test('GET /memories returns correct structure', async ({ helper }) => {
    const list = await helper.apiGet(`/api/projects/${projectId}/memories`)
    const entry = list.find((m: any) => m.id === memoryId)
    expect(entry).toBeDefined()
    expect(entry.content).toBe('User prefers dark theme')
    expect(entry.source).toBe('manual')
    expect(entry.tags).toEqual(['preference', 'ui'])
    expect(entry.createdAt).toBeDefined()
  })

  test('PATCH /memories/:id updates content and tags', async ({ helper }) => {
    const updated = await helper.apiPatch(`/api/projects/${projectId}/memories/${memoryId}`, {
      content: 'User prefers light theme',
      tags: ['preference', 'ui', 'updated'],
    })
    expect(updated.content).toBe('User prefers light theme')
  })

  test('GET /memories/:id reflects updated fields', async ({ helper }) => {
    const list = await helper.apiGet(`/api/projects/${projectId}/memories`)
    const entry = list.find((m: any) => m.id === memoryId)
    expect(entry.content).toBe('User prefers light theme')
    expect(entry.tags).toEqual(['preference', 'ui', 'updated'])
  })

  test('DELETE /memories/:id removes the entry', async ({ helper }) => {
    const result = await helper.apiDelete(`/api/projects/${projectId}/memories/${memoryId}`)
    expect(result.ok).toBe(true)
  })

  test('GET /memories no longer includes deleted entry', async ({ helper }) => {
    const list = await helper.apiGet(`/api/projects/${projectId}/memories`)
    const found = list.find((m: any) => m.id === memoryId)
    expect(found).toBeUndefined()
  })
})
