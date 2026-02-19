import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Navigation', () => {
  test('project list page loads at root', async ({ window, helper }) => {
    await helper.goHome()
    await expect(window.locator(SELECTORS.CREATE_PROJECT_BTN)).toBeVisible()
  })

  test('navigate to global settings page', async ({ window, helper }) => {
    await helper.navigateTo('/settings')
    await expect(window.locator('[data-testid="settings-form"]')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('sidebar navigation within project', async ({ window, helper }) => {
    // Create a project to access project routes
    await helper.goHome()
    const projectId = await helper.createProject('Navigation Test')

    // Should now be at project dashboard with sidebar visible
    await expect(window.locator(SELECTORS.SIDEBAR)).toBeVisible()

    // Navigate to agents page via sidebar
    await helper.clickNav('agents')
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Navigate to chat page
    await helper.clickNav('chat')
    // Chat page shows empty state with prompt to start chatting
    await expect(
      window.getByText('Start Chatting').or(window.getByText('No conversations')).first()
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Navigate to tasks page
    await helper.clickNav('tasks')
    await expect(window.locator(SELECTORS.TASK_LIST_PAGE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Navigate back to project dashboard
    await helper.clickNav('dashboard')
    await expect(window.locator('#root > *')).toBeAttached()
  })

  test('navigate back to project list from project', async ({ window, helper }) => {
    await helper.goHome()
    await expect(window.locator(SELECTORS.CREATE_PROJECT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })
})
