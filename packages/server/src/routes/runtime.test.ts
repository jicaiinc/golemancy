import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { ProjectId } from '@golemancy/shared'
import { createRuntimeRoutes } from './runtime'

// Mock the runtime managers
vi.mock('../runtime/python-manager', () => ({
  getPythonEnvStatus: vi.fn(),
  listPackages: vi.fn(),
  installPackages: vi.fn(),
  uninstallPackage: vi.fn(),
  resetProjectPythonEnv: vi.fn(),
  initProjectPythonEnv: vi.fn(),
}))

vi.mock('../runtime/node-manager', () => ({
  getNodeRuntimeStatus: vi.fn(),
}))

import { getPythonEnvStatus, listPackages, installPackages, uninstallPackage, resetProjectPythonEnv } from '../runtime/python-manager'
import { getNodeRuntimeStatus } from '../runtime/node-manager'

const projId = 'proj-1' as ProjectId

function createTestRuntimeApp() {
  const app = new Hono()
  app.route('/api/projects/:projectId/runtime', createRuntimeRoutes())
  return app
}

describe('Runtime routes', () => {
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()
    app = createTestRuntimeApp()
  })

  describe('GET /status', () => {
    it('returns combined runtime status', async () => {
      vi.mocked(getPythonEnvStatus).mockResolvedValue({ exists: true, version: '3.12.0', path: '/tmp/venv' })
      vi.mocked(getNodeRuntimeStatus).mockResolvedValue({ available: true, version: '22.0.0', npmVersion: '10.0.0' })

      const res = await app.request(`/api/projects/${projId}/runtime/status`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.python.exists).toBe(true)
      expect(body.node.available).toBe(true)
    })
  })

  describe('GET /python/packages', () => {
    it('returns package list', async () => {
      vi.mocked(listPackages).mockResolvedValue([{ name: 'requests', version: '2.31.0' }])

      const res = await app.request(`/api/projects/${projId}/runtime/python/packages`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].name).toBe('requests')
    })

    it('returns 500 on failure', async () => {
      vi.mocked(listPackages).mockRejectedValue(new Error('venv not found'))

      const res = await app.request(`/api/projects/${projId}/runtime/python/packages`)
      expect(res.status).toBe(500)
      expect((await res.json()).error).toBe('FAILED_TO_LIST_PACKAGES')
    })
  })

  describe('POST /python/packages', () => {
    it('installs packages', async () => {
      vi.mocked(installPackages).mockResolvedValue('Successfully installed requests-2.31.0')

      const res = await app.request(`/api/projects/${projId}/runtime/python/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packages: ['requests'] }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(installPackages).toHaveBeenCalledWith(projId, ['requests'])
    })

    it('returns 400 when packages array is empty', async () => {
      const res = await app.request(`/api/projects/${projId}/runtime/python/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packages: [] }),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid package name', async () => {
      const res = await app.request(`/api/projects/${projId}/runtime/python/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packages: ['req;rm -rf /'] }),
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('INVALID_PACKAGE_SPECIFIER')
    })

    it('returns 500 on install failure', async () => {
      vi.mocked(installPackages).mockRejectedValue(new Error('pip error'))

      const res = await app.request(`/api/projects/${projId}/runtime/python/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packages: ['nonexistent-pkg'] }),
      })
      expect(res.status).toBe(500)
    })
  })

  describe('DELETE /python/packages/:name', () => {
    it('uninstalls package', async () => {
      vi.mocked(uninstallPackage).mockResolvedValue('Successfully uninstalled requests')

      const res = await app.request(`/api/projects/${projId}/runtime/python/packages/requests`, {
        method: 'DELETE',
      })
      expect(res.status).toBe(200)
      expect((await res.json()).ok).toBe(true)
      expect(uninstallPackage).toHaveBeenCalledWith(projId, 'requests')
    })

    it('returns 400 for invalid package name', async () => {
      const res = await app.request(`/api/projects/${projId}/runtime/python/packages/req;evil`, {
        method: 'DELETE',
      })
      expect(res.status).toBe(400)
    })

    it('returns 500 on uninstall failure', async () => {
      vi.mocked(uninstallPackage).mockRejectedValue(new Error('not installed'))

      const res = await app.request(`/api/projects/${projId}/runtime/python/packages/missing-pkg`, {
        method: 'DELETE',
      })
      expect(res.status).toBe(500)
    })
  })

  describe('POST /python/reset', () => {
    it('resets Python venv', async () => {
      vi.mocked(resetProjectPythonEnv).mockResolvedValue(undefined)

      const res = await app.request(`/api/projects/${projId}/runtime/python/reset`, {
        method: 'POST',
      })
      expect(res.status).toBe(200)
      expect((await res.json()).ok).toBe(true)
      expect(resetProjectPythonEnv).toHaveBeenCalledWith(projId)
    })

    it('returns 500 on reset failure', async () => {
      vi.mocked(resetProjectPythonEnv).mockRejectedValue(new Error('reset failed'))

      const res = await app.request(`/api/projects/${projId}/runtime/python/reset`, {
        method: 'POST',
      })
      expect(res.status).toBe(500)
    })
  })
})
