import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

/** Poll a condition with interval until timeout */
async function pollUntil<T>(
  fn: () => Promise<T>,
  predicate: (result: T) => boolean,
  intervalMs: number,
  timeoutMs: number,
): Promise<T> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const result = await fn()
    if (predicate(result)) return result
    await new Promise(r => setTimeout(r, intervalMs))
  }
  return fn() // Final attempt
}

test.describe('Cron Job Execution', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('Cron Job Execution Test')
    projectId = project.id

    const agent = await helper.createAgentViaApi(projectId, 'Cron Agent', {
      systemPrompt: 'You are a test assistant. When given an instruction, follow it exactly. Keep responses under 20 words.',
    })
    agentId = agent.id
  })

  // ===== Manual trigger (3 tests) =====

  test('create and manually trigger cron job', async ({ helper, window }) => {
    test.setTimeout(120_000)

    // Create a cron job
    const job = await helper.apiPost(`/api/projects/${projectId}/cron-jobs`, {
      name: 'Manual Trigger Test',
      agentId,
      cronExpression: '0 0 1 1 *', // once a year — won't auto-fire
      enabled: false,
      instruction: 'Reply with exactly: MANUAL_TRIGGER_OK',
    })
    expect(job.id).toBeTruthy()

    // Refresh store so ProjectLayout recognizes the API-created project
    await helper.page.evaluate(async () => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (store) await store.getState().loadProjects()
    })
    await helper.navigateTo(`/projects/${projectId}/cron`)
    await window.waitForSelector(SELECTORS.CRON_PAGE, { state: 'visible', timeout: TIMEOUTS.PAGE_LOAD })
    await window.click(SELECTORS.CRON_TRIGGER_BTN)

    // Wait for the run to appear
    const runs = await pollUntil(
      () => helper.apiGet(`/api/projects/${projectId}/cron-jobs/${job.id}/runs`),
      (r: any[]) => r.length > 0,
      2000,
      TIMEOUTS.CRON_EXECUTION,
    )

    expect(runs.length).toBeGreaterThan(0)
    expect(runs[0].triggeredBy).toBe('manual')
  })

  test('verify cron job run completed successfully', async ({ helper, window }) => {
    test.setTimeout(120_000)

    // Create and trigger a job
    const job = await helper.apiPost(`/api/projects/${projectId}/cron-jobs`, {
      name: 'Run Completion Test',
      agentId,
      cronExpression: '0 0 1 1 *',
      enabled: false,
      instruction: 'Reply with OK',
    })

    // Refresh store so ProjectLayout recognizes the API-created project
    await helper.page.evaluate(async () => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (store) await store.getState().loadProjects()
    })
    await helper.navigateTo(`/projects/${projectId}/cron`)
    await window.waitForSelector(SELECTORS.CRON_PAGE, { state: 'visible', timeout: TIMEOUTS.PAGE_LOAD })
    await window.click(SELECTORS.CRON_TRIGGER_BTN)

    // Poll until run completes (not 'running' anymore)
    const runs = await pollUntil(
      () => helper.apiGet(`/api/projects/${projectId}/cron-jobs/${job.id}/runs`),
      (r: any[]) => r.length > 0 && r[0].status !== 'running',
      2000,
      TIMEOUTS.CRON_EXECUTION,
    )

    expect(runs.length).toBeGreaterThan(0)
    expect(runs[0].status).toBe('success')
    expect(runs[0].conversationId).toBeTruthy()
  })

  test('verify triggered conversation has messages', async ({ helper, window }) => {
    test.setTimeout(120_000)

    // Create and trigger a job
    const job = await helper.apiPost(`/api/projects/${projectId}/cron-jobs`, {
      name: 'Conversation Messages Test',
      agentId,
      cronExpression: '0 0 1 1 *',
      enabled: false,
      instruction: 'Reply with CRON_MESSAGE_TEST',
    })

    // Refresh store so ProjectLayout recognizes the API-created project
    await helper.page.evaluate(async () => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (store) await store.getState().loadProjects()
    })
    await helper.navigateTo(`/projects/${projectId}/cron`)
    await window.waitForSelector(SELECTORS.CRON_PAGE, { state: 'visible', timeout: TIMEOUTS.PAGE_LOAD })
    await window.click(SELECTORS.CRON_TRIGGER_BTN)

    // Poll until run completes
    const runs = await pollUntil(
      () => helper.apiGet(`/api/projects/${projectId}/cron-jobs/${job.id}/runs`),
      (r: any[]) => r.length > 0 && r[0].status !== 'running',
      2000,
      TIMEOUTS.CRON_EXECUTION,
    )

    const conversationId = runs[0].conversationId
    expect(conversationId).toBeTruthy()

    // Verify conversation has messages
    const messages = await helper.apiGet(
      `/api/projects/${projectId}/conversations/${conversationId}/messages`,
    )

    expect(messages.items).toBeDefined()
    expect(messages.items.length).toBeGreaterThan(0)

    const roles = messages.items.map((m: { role: string }) => m.role)
    expect(roles).toContain('user')
    expect(roles).toContain('assistant')
  })

  // ===== Scheduled execution (3 tests) =====

  test('create cron job with every-minute schedule', async ({ helper }) => {
    test.setTimeout(180_000)

    const job = await helper.apiPost(`/api/projects/${projectId}/cron-jobs`, {
      name: 'Every Minute Test',
      agentId,
      cronExpression: '* * * * *',
      enabled: true,
      instruction: 'Reply with SCHEDULED_OK',
    })

    expect(job.id).toBeTruthy()
    expect(job.enabled).toBe(true)
    expect(job.cronExpression).toBe('* * * * *')
  })

  test('wait for scheduled execution and verify', async ({ helper }) => {
    test.setTimeout(180_000)

    // Find the every-minute job we just created
    const jobs = await helper.apiGet(`/api/projects/${projectId}/cron-jobs`)
    const everyMinuteJob = jobs.find(
      (j: { name: string; cronExpression: string }) =>
        j.name === 'Every Minute Test' && j.cronExpression === '* * * * *',
    )
    expect(everyMinuteJob).toBeTruthy()

    // Poll for scheduled run — cron fires every minute, start checking after 30s
    await new Promise(r => setTimeout(r, 30_000))

    const runs = await pollUntil(
      () => helper.apiGet(`/api/projects/${projectId}/cron-jobs/${everyMinuteJob.id}/runs`),
      (r: any[]) => r.length > 0,
      3000,
      60_000, // poll up to 60s more after initial 30s wait
    )

    expect(runs.length).toBeGreaterThan(0)

    // Verify at least one run was triggered by schedule
    const scheduledRun = runs.find((r: { triggeredBy: string }) => r.triggeredBy === 'schedule')
    expect(scheduledRun).toBeTruthy()
  })

  test('verify scheduled run created conversation', async ({ helper }) => {
    test.setTimeout(120_000)

    // Find the every-minute job
    const jobs = await helper.apiGet(`/api/projects/${projectId}/cron-jobs`)
    const everyMinuteJob = jobs.find(
      (j: { name: string }) => j.name === 'Every Minute Test',
    )
    expect(everyMinuteJob).toBeTruthy()

    // Get runs
    const runs = await helper.apiGet(
      `/api/projects/${projectId}/cron-jobs/${everyMinuteJob.id}/runs`,
    )

    // Find a completed run with a conversation
    const completedRun = runs.find(
      (r: { status: string; conversationId?: string }) =>
        r.status !== 'running' && r.conversationId,
    )

    if (completedRun) {
      // Verify conversation exists and has messages
      const messages = await helper.apiGet(
        `/api/projects/${projectId}/conversations/${completedRun.conversationId}/messages`,
      )
      expect(messages.items).toBeDefined()
      expect(messages.items.length).toBeGreaterThan(0)
    }

    // Cleanup: disable the cron job
    await helper.apiPatch(`/api/projects/${projectId}/cron-jobs/${everyMinuteJob.id}`, {
      enabled: false,
    })

    // Verify disabled
    const updated = await helper.apiGet(
      `/api/projects/${projectId}/cron-jobs/${everyMinuteJob.id}`,
    )
    expect(updated.enabled).toBe(false)
  })
})
