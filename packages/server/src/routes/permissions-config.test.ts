import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PermissionsConfigFile, ProjectId, PermissionsConfigId } from '@golemancy/shared'
import { createTestApp, makeRequest, type MockStorage } from '../test/route-helpers'
import type { Hono } from 'hono'

const projId = 'proj-1' as ProjectId
const configId = 'perm-1' as PermissionsConfigId

function makeConfig(overrides: Partial<PermissionsConfigFile> = {}): PermissionsConfigFile {
  return {
    id: configId,
    title: 'Test Config',
    mode: 'sandbox',
    config: {
      allowWrite: ['{{workspaceDir}}'],
      denyRead: [],
      denyWrite: [],
      networkRestrictionsEnabled: false,
      allowedDomains: [],
      deniedDomains: [],
      deniedCommands: [],
      applyToMCP: true,
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('Permissions config routes', () => {
  let app: Hono
  let mocks: MockStorage

  beforeEach(() => {
    ({ app, mocks } = createTestApp())
  })

  describe('GET /api/projects/:projectId/permissions-config', () => {
    it('returns list', async () => {
      vi.mocked(mocks.permissionsConfigStorage.list).mockResolvedValue([makeConfig()])

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/permissions-config`)
      expect(res.status).toBe(200)
      expect(await res.json()).toHaveLength(1)
    })
  })

  describe('GET /api/projects/:projectId/permissions-config/:id', () => {
    it('returns config when found', async () => {
      vi.mocked(mocks.permissionsConfigStorage.getById).mockResolvedValue(makeConfig())

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/permissions-config/${configId}`)
      expect(res.status).toBe(200)
      expect((await res.json()).mode).toBe('sandbox')
    })

    it('returns 404 when not found', async () => {
      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/permissions-config/missing`)
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/projects/:projectId/permissions-config', () => {
    it('creates config and returns 201', async () => {
      vi.mocked(mocks.permissionsConfigStorage.create).mockResolvedValue(makeConfig())

      const res = await makeRequest(app, 'POST', `/api/projects/${projId}/permissions-config`, {
        title: 'Test Config',
        mode: 'sandbox',
        config: { allowWrite: ['{{workspaceDir}}'], denyRead: [], denyWrite: [], networkRestrictionsEnabled: false, allowedDomains: [], deniedDomains: [], deniedCommands: [], applyToMCP: true },
      })
      expect(res.status).toBe(201)
      expect((await res.json()).title).toBe('Test Config')
    })

    it('returns 400 for invalid mode', async () => {
      const res = await makeRequest(app, 'POST', `/api/projects/${projId}/permissions-config`, {
        title: 'Bad',
        mode: 'invalid-mode',
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('Validation failed')
    })

    it('returns 400 for invalid config field types', async () => {
      const res = await makeRequest(app, 'POST', `/api/projects/${projId}/permissions-config`, {
        title: 'Bad',
        mode: 'sandbox',
        config: { allowWrite: 'not-array' },
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for empty title', async () => {
      const res = await makeRequest(app, 'POST', `/api/projects/${projId}/permissions-config`, {
        title: '',
        mode: 'sandbox',
      })
      expect(res.status).toBe(400)
    })
  })

  describe('PATCH /api/projects/:projectId/permissions-config/:id', () => {
    it('updates config', async () => {
      const updated = makeConfig({ mode: 'unrestricted' })
      vi.mocked(mocks.permissionsConfigStorage.update).mockResolvedValue(updated)

      const res = await makeRequest(app, 'PATCH', `/api/projects/${projId}/permissions-config/${configId}`, {
        mode: 'unrestricted',
      })
      expect(res.status).toBe(200)
      expect((await res.json()).mode).toBe('unrestricted')
    })

    it('returns 400 for invalid data', async () => {
      const res = await makeRequest(app, 'PATCH', `/api/projects/${projId}/permissions-config/${configId}`, {
        mode: 'bad-mode',
      })
      expect(res.status).toBe(400)
    })
  })

  describe('DELETE /api/projects/:projectId/permissions-config/:id', () => {
    it('deletes config', async () => {
      const res = await makeRequest(app, 'DELETE', `/api/projects/${projId}/permissions-config/${configId}`)
      expect(res.status).toBe(200)
      expect((await res.json()).ok).toBe(true)
      expect(mocks.permissionsConfigStorage.delete).toHaveBeenCalledWith(projId, configId)
    })
  })

  describe('POST /api/projects/:projectId/permissions-config/:id/duplicate', () => {
    it('duplicates config and returns 201', async () => {
      const dup = makeConfig({ id: 'perm-2' as PermissionsConfigId, title: 'Copy of Test' })
      vi.mocked(mocks.permissionsConfigStorage.duplicate).mockResolvedValue(dup)

      const res = await makeRequest(app, 'POST', `/api/projects/${projId}/permissions-config/${configId}/duplicate`, {
        title: 'Copy of Test',
      })
      expect(res.status).toBe(201)
      expect((await res.json()).title).toBe('Copy of Test')
      expect(mocks.permissionsConfigStorage.duplicate).toHaveBeenCalledWith(projId, configId, 'Copy of Test')
    })

    it('returns 400 when title is empty', async () => {
      const res = await makeRequest(app, 'POST', `/api/projects/${projId}/permissions-config/${configId}/duplicate`, {
        title: '',
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 when title is too long', async () => {
      const res = await makeRequest(app, 'POST', `/api/projects/${projId}/permissions-config/${configId}/duplicate`, {
        title: 'a'.repeat(101),
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 when title is missing', async () => {
      const res = await makeRequest(app, 'POST', `/api/projects/${projId}/permissions-config/${configId}/duplicate`, {})
      expect(res.status).toBe(400)
    })
  })
})
