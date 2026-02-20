import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Cron Jobs Page', () => {
  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Cron Test Project')
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await helper.createAgent('Cron Test Agent')
  })

  test('navigate to cron page via sidebar', async ({ window, helper }) => {
    await helper.clickNav('cron')
    await expect(window.locator(SELECTORS.CRON_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('cron page shows header', async ({ window, helper }) => {
    await helper.clickNav('cron')
    await expect(window.locator(SELECTORS.CRON_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByRole('heading', { name: 'Automations' })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('empty state displayed when no cron jobs', async ({ window, helper }) => {
    await helper.clickNav('cron')
    await expect(window.locator(SELECTORS.CRON_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('No automations yet')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('new button visible', async ({ window, helper }) => {
    await helper.clickNav('cron')
    await expect(window.locator(SELECTORS.CRON_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator(SELECTORS.CRON_NEW_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('open cron form modal', async ({ window, helper }) => {
    await helper.clickNav('cron')
    await expect(window.locator(SELECTORS.CRON_NEW_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    await window.locator(SELECTORS.CRON_NEW_BTN).click()

    // Verify modal fields
    await expect(window.getByRole('heading', { name: 'New Automation' })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('NAME', { exact: true })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('AGENT', { exact: true })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Close modal
    await window.getByText('Cancel').click()
  })

  test('type toggle between recurring and one-time', async ({ window, helper }) => {
    await helper.clickNav('cron')
    await expect(window.locator(SELECTORS.CRON_NEW_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    await window.locator(SELECTORS.CRON_NEW_BTN).click()
    await expect(window.getByRole('heading', { name: 'New Automation' })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Verify toggle buttons exist
    const recurringBtn = window.getByText('Recurring', { exact: true })
    const oneTimeBtn = window.getByText('One-time', { exact: true })
    await expect(recurringBtn).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(oneTimeBtn).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Click One-time and verify it becomes active
    await oneTimeBtn.click()
    // Should now show scheduled-at input instead of cron expression
    await expect(window.getByText('SCHEDULED AT (local time)')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Click Recurring to go back
    await recurringBtn.click()
    await expect(window.getByText('CRON EXPRESSION')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Close modal
    await window.getByText('Cancel').click()
  })

  test('cron expression presets visible', async ({ window, helper }) => {
    await helper.clickNav('cron')
    await expect(window.locator(SELECTORS.CRON_NEW_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    await window.locator(SELECTORS.CRON_NEW_BTN).click()
    await expect(window.getByRole('heading', { name: 'New Automation' })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Verify preset buttons (use getByRole to avoid matching cronstrue description spans)
    await expect(window.getByRole('button', { name: 'Every 5 min' })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByRole('button', { name: 'Every hour' })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByRole('button', { name: 'Daily 9am' })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Close modal
    await window.getByText('Cancel').click()
  })
})
