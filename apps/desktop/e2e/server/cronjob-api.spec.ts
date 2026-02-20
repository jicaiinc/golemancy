import { test, expect } from '../fixtures'

test.describe('Cron Job API', () => {
  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()

    const project = await helper.createProjectViaApi('CronJob API Test')
    projectId = project.id

    const agent = await helper.createAgentViaApi(projectId, 'CronJob Agent')
    agentId = agent.id
  })

  // ===== Create =====

  let recurringId: string
  let oneTimeId: string

  test('POST /cron-jobs creates a recurring cron job', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/cron-jobs`, {
      name: 'Every 5 Minutes',
      agentId,
      scheduleType: 'cron',
      cronExpression: '*/5 * * * *',
      instruction: 'Run periodic check',
      enabled: true,
    })
    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.id).toBeDefined()
    expect(data.name).toBe('Every 5 Minutes')
    expect(data.scheduleType).toBe('cron')
    expect(data.cronExpression).toBe('*/5 * * * *')
    recurringId = data.id
  })

  test('POST /cron-jobs creates a one-time cron job', async ({ helper }) => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/cron-jobs`, {
      name: 'One-Time Task',
      agentId,
      scheduleType: 'once',
      scheduledAt: futureDate,
      instruction: 'Run once',
      enabled: true,
    })
    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.id).toBeDefined()
    expect(data.scheduleType).toBe('once')
    oneTimeId = data.id
  })

  // ===== Read =====

  test('GET /cron-jobs lists both cron jobs', async ({ helper }) => {
    const list = await helper.apiGet(`/api/projects/${projectId}/cron-jobs`)
    expect(Array.isArray(list)).toBe(true)
    expect(list.length).toBeGreaterThanOrEqual(2)
    const ids = list.map((j: any) => j.id)
    expect(ids).toContain(recurringId)
    expect(ids).toContain(oneTimeId)
  })

  test('GET /cron-jobs/:id returns cron job with expected structure', async ({ helper }) => {
    const job = await helper.apiGet(`/api/projects/${projectId}/cron-jobs/${recurringId}`)
    expect(job.id).toBe(recurringId)
    expect(job.name).toBe('Every 5 Minutes')
    expect(job.enabled).toBe(true)
    expect(job.scheduleType).toBe('cron')
    expect(job).toHaveProperty('cronExpression')
  })

  // ===== Update =====

  test('PATCH /cron-jobs/:id updates cron expression', async ({ helper }) => {
    const updated = await helper.apiPatch(`/api/projects/${projectId}/cron-jobs/${recurringId}`, {
      cronExpression: '0 * * * *',
    })
    expect(updated.cronExpression).toBe('0 * * * *')
  })

  test('PATCH /cron-jobs/:id toggles enabled to false', async ({ helper }) => {
    const updated = await helper.apiPatch(`/api/projects/${projectId}/cron-jobs/${recurringId}`, {
      enabled: false,
    })
    expect(updated.enabled).toBe(false)
  })

  // ===== Validation =====

  test('POST /cron-jobs with invalid cron expression returns 400', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/cron-jobs`, {
      name: 'Bad Cron',
      agentId,
      scheduleType: 'cron',
      cronExpression: 'not-a-cron',
    })
    expect(response.status()).toBe(400)
  })

  test('POST /cron-jobs one-time without valid scheduledAt returns 400', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/cron-jobs`, {
      name: 'Bad One-Time',
      agentId,
      scheduleType: 'once',
      // missing scheduledAt
    })
    expect(response.status()).toBe(400)
  })

  // ===== Runs =====

  test('GET /cron-jobs/runs returns empty array initially', async ({ helper }) => {
    const runs = await helper.apiGet(`/api/projects/${projectId}/cron-jobs/runs`)
    expect(Array.isArray(runs)).toBe(true)
    expect(runs.length).toBe(0)
  })

  test('GET /cron-jobs/:id/runs returns empty array initially', async ({ helper }) => {
    const runs = await helper.apiGet(`/api/projects/${projectId}/cron-jobs/${recurringId}/runs`)
    expect(Array.isArray(runs)).toBe(true)
    expect(runs.length).toBe(0)
  })

  // ===== Delete =====

  test('DELETE /cron-jobs/:id removes cron job and GET returns 404', async ({ helper }) => {
    const delResult = await helper.apiDelete(`/api/projects/${projectId}/cron-jobs/${recurringId}`)
    expect(delResult.ok).toBe(true)

    const response = await helper.apiGetRaw(`/api/projects/${projectId}/cron-jobs/${recurringId}`)
    expect(response.status()).toBe(404)
  })
})
