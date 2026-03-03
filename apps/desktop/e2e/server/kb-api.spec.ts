import { test, expect } from '../fixtures'

test.describe('Knowledge Base API', () => {
  let projectId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()
    const project = await helper.createProjectViaApi('KB API Test')
    projectId = project.id
  })

  // ===== Collections =====

  let collectionId: string

  test('POST /knowledge-base creates a collection', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/knowledge-base`, {
      name: 'Test Collection',
      description: 'API test collection',
      tier: 'hot',
    })
    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.id).toBeDefined()
    expect(data.name).toBe('Test Collection')
    expect(data.tier).toBe('hot')
    collectionId = data.id
  })

  test('GET /knowledge-base lists collections', async ({ helper }) => {
    const list = await helper.apiGet(`/api/projects/${projectId}/knowledge-base`)
    expect(Array.isArray(list)).toBe(true)
    const found = list.find((c: any) => c.id === collectionId)
    expect(found).toBeDefined()
    expect(found.name).toBe('Test Collection')
  })

  test('PATCH /knowledge-base/:id updates collection', async ({ helper }) => {
    const updated = await helper.apiPatch(`/api/projects/${projectId}/knowledge-base/${collectionId}`, {
      name: 'Updated Collection',
      description: 'Updated description',
    })
    expect(updated.name).toBe('Updated Collection')
    expect(updated.description).toBe('Updated description')
  })

  // ===== Documents =====

  let documentId: string

  test('POST /knowledge-base/:collectionId/documents ingests a document', async ({ helper }) => {
    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/knowledge-base/${collectionId}/documents`,
      {
        title: 'Test Document',
        content: 'This is test content for the knowledge base document.',
        sourceType: 'manual',
        sourceName: 'e2e-test',
      },
    )
    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.id).toBeDefined()
    expect(data.title).toBe('Test Document')
    expect(data.charCount).toBeGreaterThan(0)
    documentId = data.id
  })

  test('GET /knowledge-base/:collectionId/documents lists documents', async ({ helper }) => {
    const list = await helper.apiGet(
      `/api/projects/${projectId}/knowledge-base/${collectionId}/documents`,
    )
    expect(Array.isArray(list)).toBe(true)
    const found = list.find((d: any) => d.id === documentId)
    expect(found).toBeDefined()
    expect(found.title).toBe('Test Document')
  })

  test('GET /knowledge-base/:collectionId/documents/:docId returns document', async ({ helper }) => {
    const doc = await helper.apiGet(
      `/api/projects/${projectId}/knowledge-base/${collectionId}/documents/${documentId}`,
    )
    expect(doc.id).toBe(documentId)
    expect(doc.content).toBe('This is test content for the knowledge base document.')
  })

  // ===== Search =====

  test('POST /knowledge-base/search returns results', async ({ helper }) => {
    const results = await helper.apiPost(`/api/projects/${projectId}/knowledge-base/search`, {
      query: 'test content',
    })
    expect(Array.isArray(results)).toBe(true)
    // Hot tier uses FTS5 — should find our document
    expect(results.length).toBeGreaterThan(0)
  })

  // ===== Utilities =====

  test('GET /knowledge-base/hot-content returns hot content', async ({ helper }) => {
    const result = await helper.apiGet(`/api/projects/${projectId}/knowledge-base/hot-content`)
    expect(result.content).toBeDefined()
    expect(typeof result.content).toBe('string')
    // Should contain our test document content
    expect(result.content).toContain('test content')
  })

  test('GET /knowledge-base/has-vector-data returns boolean', async ({ helper }) => {
    const result = await helper.apiGet(`/api/projects/${projectId}/knowledge-base/has-vector-data`)
    expect(result.hasVectorData).toBeDefined()
    expect(typeof result.hasVectorData).toBe('boolean')
    // Hot tier only — no vector data
    expect(result.hasVectorData).toBe(false)
  })

  // ===== Cleanup =====

  test('DELETE /knowledge-base/:collectionId/documents/:docId removes document', async ({ helper }) => {
    const result = await helper.apiDelete(
      `/api/projects/${projectId}/knowledge-base/${collectionId}/documents/${documentId}`,
    )
    expect(result.ok).toBe(true)
  })

  test('DELETE /knowledge-base/:collectionId removes collection', async ({ helper }) => {
    const result = await helper.apiDelete(`/api/projects/${projectId}/knowledge-base/${collectionId}`)
    expect(result.ok).toBe(true)
  })

  test('GET /knowledge-base returns empty list after deletion', async ({ helper }) => {
    const list = await helper.apiGet(`/api/projects/${projectId}/knowledge-base`)
    expect(list.length).toBe(0)
  })
})
