import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CronJob, ProjectId, AgentId, CronJobId } from '@golemancy/shared'
import { createTestApp, makeRequest, type MockStorage } from '../test/route-helpers'
import type { Hono } from 'hono'

const projId = 'proj-1' as ProjectId
const agentId = 'agent-1' as AgentId
const cronId = 'cron-1' as CronJobId

function makeCronJob(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: cronId,
    projectId: projId,
    agentId,
    name: 'Daily Report',
    description: 'Generate daily summary',
    cronExpression: '0 9 * * *',
    enabled: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('CronJobs routes', () => {
  let app: Hono
  let mocks: MockStorage

  beforeEach(() => {
    ({ app, mocks } = createTestApp())
  })

  describe('GET /api/projects/:projectId/cron-jobs', () => {
    it('returns empty list', async () => {
      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/cron-jobs`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })

    it('returns cron jobs list', async () => {
      vi.mocked(mocks.cronJobStorage.list).mockResolvedValue([makeCronJob()])

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/cron-jobs`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].name).toBe('Daily Report')
    })
  })

  describe('GET /api/projects/:projectId/cron-jobs/:id', () => {
    it('returns cron job when found', async () => {
      vi.mocked(mocks.cronJobStorage.getById).mockResolvedValue(makeCronJob())

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/cron-jobs/${cronId}`)
      expect(res.status).toBe(200)
      expect((await res.json()).cronExpression).toBe('0 9 * * *')
    })

    it('returns 404 when not found', async () => {
      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/cron-jobs/missing`)
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/projects/:projectId/cron-jobs', () => {
    it('creates cron job and returns 201', async () => {
      const created = makeCronJob()
      vi.mocked(mocks.cronJobStorage.create).mockResolvedValue(created)

      const res = await makeRequest(app, 'POST', `/api/projects/${projId}/cron-jobs`, {
        agentId,
        name: 'Daily Report',
        description: 'Generate daily summary',
        cronExpression: '0 9 * * *',
        enabled: true,
      })
      expect(res.status).toBe(201)
      expect((await res.json()).name).toBe('Daily Report')
    })
  })

  describe('PATCH /api/projects/:projectId/cron-jobs/:id', () => {
    it('updates cron job', async () => {
      const updated = makeCronJob({ enabled: false })
      vi.mocked(mocks.cronJobStorage.update).mockResolvedValue(updated)

      const res = await makeRequest(app, 'PATCH', `/api/projects/${projId}/cron-jobs/${cronId}`, {
        enabled: false,
      })
      expect(res.status).toBe(200)
      expect((await res.json()).enabled).toBe(false)
    })
  })

  describe('DELETE /api/projects/:projectId/cron-jobs/:id', () => {
    it('deletes cron job', async () => {
      const res = await makeRequest(app, 'DELETE', `/api/projects/${projId}/cron-jobs/${cronId}`)
      expect(res.status).toBe(200)
      expect((await res.json()).ok).toBe(true)
      expect(mocks.cronJobStorage.delete).toHaveBeenCalledWith(projId, cronId)
    })
  })
})
