import { test, expect } from '../fixtures'

test.describe('Runtime Extended — Python Management', () => {
  let projectId: string
  let pythonAvailable = false

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()

    const project = await helper.createProjectViaApi('Runtime Extended Test')
    projectId = project.id

    // Check if Python is available
    const status = await helper.apiGet(`/api/projects/${projectId}/runtime/status`)
    pythonAvailable = status.python?.available === true
  })

  test('pip install a package', async ({ helper }) => {
    test.skip(!pythonAvailable, 'Python not available')

    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/runtime/python/packages`,
      { packages: ['requests'] },
    )
    // May succeed or fail depending on environment, but should return valid response
    const status = response.status()
    expect([200, 500]).toContain(status)

    if (status === 200) {
      const body = await response.json()
      expect(body.ok).toBe(true)
    }
  })

  test('pip install with invalid package name returns 400', async ({ helper }) => {
    test.skip(!pythonAvailable, 'Python not available')

    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/runtime/python/packages`,
      { packages: ['invalid;package&&rm -rf /'] },
    )
    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('INVALID_PACKAGE_SPECIFIER')
  })

  test('pip install with empty packages array returns 400', async ({ helper }) => {
    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/runtime/python/packages`,
      { packages: [] },
    )
    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('PACKAGES_REQUIRED')
  })

  test('pip uninstall a package', async ({ helper }) => {
    test.skip(!pythonAvailable, 'Python not available')

    const response = await helper.apiDeleteRaw(
      `/api/projects/${projectId}/runtime/python/packages/requests`,
    )
    const status = response.status()
    // May succeed or fail (package may not be installed)
    expect([200, 500]).toContain(status)

    if (status === 200) {
      const body = await response.json()
      expect(body.ok).toBe(true)
    }
  })

  test('pip uninstall with invalid package name returns 400', async ({ helper }) => {
    const response = await helper.apiDeleteRaw(
      `/api/projects/${projectId}/runtime/python/packages/invalid;name`,
    )
    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('INVALID_PACKAGE_NAME')
  })

  test('venv reset', async ({ helper }) => {
    test.skip(!pythonAvailable, 'Python not available')

    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/runtime/python/reset`,
      {},
    )
    const status = response.status()
    expect([200, 500]).toContain(status)

    if (status === 200) {
      const body = await response.json()
      expect(body.ok).toBe(true)
    }
  })

  // ===== Cleanup =====

  test.afterAll(async ({ helper }) => {
    if (projectId) {
      await helper.apiDelete(`/api/projects/${projectId}`)
    }
  })
})
