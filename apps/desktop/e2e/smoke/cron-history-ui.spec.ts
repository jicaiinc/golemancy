import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Cron History UI', () => {
  let projectId: string
  let agentId: string
  let cronJobId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Cron History UI Test')

    // Create agent and cron job via API
    const agent = await helper.createAgentViaApi(projectId, 'Cron History Agent')
    agentId = agent.id

    const cronJob = await helper.apiPost(`/api/projects/${projectId}/cron-jobs`, {
      name: 'History Test Job',
      agentId,
      scheduleType: 'cron',
      cronExpression: '0 0 * * *',
      instruction: 'Say hello',
      enabled: false, // Don't auto-trigger
    })
    cronJobId = cronJob.id
  })

  test('cron card shows history button after creation', async ({ window, helper }) => {
    // Force store refresh
    await window.evaluate(() => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (store) store.getState().clearProject()
    })
    await helper.navigateTo(`/projects/${projectId}/cron`)

    await expect(window.locator(SELECTORS.CRON_PAGE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Cron card should be visible
    await expect(window.locator(SELECTORS.CRON_CARD).first()).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // History button should be visible on the card
    await expect(window.locator(SELECTORS.CRON_HISTORY_BTN).first()).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('trigger button is visible on cron card', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/cron`)

    await expect(window.locator(SELECTORS.CRON_PAGE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    await expect(window.locator(SELECTORS.CRON_TRIGGER_BTN).first()).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('cron runs API returns array (empty initially)', async ({ helper }) => {
    const runs = await helper.apiGet(
      `/api/projects/${projectId}/cron-jobs/${cronJobId}/runs`,
    )
    expect(Array.isArray(runs)).toBe(true)
    expect(runs.length).toBe(0)
  })
})
