import { test, expect } from '../fixtures'

test.describe('Permissions Config API', () => {
  let projectId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()

    const project = await helper.createProjectViaApi('Permissions API Test')
    projectId = project.id
  })

  // ===== Create =====

  let restrictedId: string
  let sandboxId: string
  let unrestrictedId: string

  test('POST creates restricted config', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/permissions-config`, {
      title: 'Restricted',
      mode: 'restricted',
    })
    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.id).toBeDefined()
    expect(data.title).toBe('Restricted')
    expect(data.mode).toBe('restricted')
    restrictedId = data.id
  })

  test('POST creates sandbox config with settings', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/permissions-config`, {
      title: 'Sandbox',
      mode: 'sandbox',
      config: {
        allowWrite: ['/tmp'],
        deniedCommands: ['rm'],
      },
    })
    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.id).toBeDefined()
    expect(data.title).toBe('Sandbox')
    expect(data.mode).toBe('sandbox')
    sandboxId = data.id
  })

  test('POST creates unrestricted config', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/permissions-config`, {
      title: 'Unrestricted',
      mode: 'unrestricted',
    })
    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.mode).toBe('unrestricted')
    unrestrictedId = data.id
  })

  // ===== Read =====

  test('GET / lists all 3 configs', async ({ helper }) => {
    const list = await helper.apiGet(`/api/projects/${projectId}/permissions-config`)
    expect(Array.isArray(list)).toBe(true)
    expect(list.length).toBeGreaterThanOrEqual(3)
    const ids = list.map((c: any) => c.id)
    expect(ids).toContain(restrictedId)
    expect(ids).toContain(sandboxId)
    expect(ids).toContain(unrestrictedId)
  })

  test('GET /:id returns config with correct fields', async ({ helper }) => {
    const config = await helper.apiGet(`/api/projects/${projectId}/permissions-config/${sandboxId}`)
    expect(config.id).toBe(sandboxId)
    expect(config.mode).toBe('sandbox')
    expect(config.title).toBe('Sandbox')
    expect(config).toHaveProperty('config')
  })

  // ===== Update =====

  test('PATCH /:id updates mode', async ({ helper }) => {
    const updated = await helper.apiPatch(
      `/api/projects/${projectId}/permissions-config/${restrictedId}`,
      { mode: 'unrestricted' },
    )
    expect(updated.mode).toBe('unrestricted')
  })

  // ===== Duplicate =====

  test('POST /:id/duplicate creates a copy with new title', async ({ helper }) => {
    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/permissions-config/${sandboxId}/duplicate`,
      { title: 'Sandbox Copy' },
    )
    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.id).toBeDefined()
    expect(data.id).not.toBe(sandboxId)
    expect(data.title).toBe('Sandbox Copy')
    expect(data.mode).toBe('sandbox')
  })

  // ===== Delete =====

  test('DELETE /:id removes config', async ({ helper }) => {
    const result = await helper.apiDelete(`/api/projects/${projectId}/permissions-config/${unrestrictedId}`)
    expect(result.ok).toBe(true)

    const response = await helper.apiGetRaw(`/api/projects/${projectId}/permissions-config/${unrestrictedId}`)
    expect(response.status()).toBe(404)
  })

  // ===== Validation =====

  test('POST with invalid mode returns 400', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/permissions-config`, {
      title: 'Bad Config',
      mode: 'invalid-mode',
    })
    expect(response.status()).toBe(400)
  })
})
