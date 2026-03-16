import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Cron Chat Navigation', () => {
  let projectId: string
  let agentId: string
  let cronJobId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()
    const project = await helper.createProjectViaApi('Cron Chat Nav Test')
    projectId = project.id

    const agent = await helper.createAgentViaApi(projectId, 'Cron Nav Agent')
    agentId = agent.id

    const cronJob = await helper.apiPost(`/api/projects/${projectId}/cron-jobs`, {
      name: 'Nav Test Cron',
      agentId,
      scheduleType: 'cron',
      cronExpression: '0 0 * * *',
      instruction: 'Say hello',
      enabled: false,
    })
    cronJobId = cronJob.id
  })

  test('triggered cron creates a run record', async ({ helper }) => {
    // Trigger the cron manually — this will attempt to run the agent.
    // Without an AI API key the run will likely fail, but a run record
    // should still be created.
    const triggerResp = await helper.apiPostRaw(
      `/api/projects/${projectId}/cron-jobs/${cronJobId}/trigger`,
      {},
    )
    // Trigger itself should succeed (it queues the job)
    expect(triggerResp.status()).toBe(200)

    // Poll for a run to appear (even a failed run counts)
    const runs = await helper.pollUntil(
      () => helper.apiGet(`/api/projects/${projectId}/cron-jobs/${cronJobId}/runs`),
      (runs: any[]) => runs.length > 0,
      { intervalMs: 1000, timeoutMs: 30_000 },
    )
    expect(runs.length).toBeGreaterThan(0)
    expect(runs[0]).toHaveProperty('status')
  })

  test.fixme('navigate from cron run to its conversation', async () => {
    // This test requires a successful cron run that creates a conversation.
    // Without an AI API key, the cron run fails before creating a conversation.
    //
    // When AI keys are available, this test should:
    // 1. Get the run's conversationId from the run record
    // 2. Navigate to /projects/:pid/chat with that conversationId
    // 3. Verify the chat page loads with the conversation
  })
})
