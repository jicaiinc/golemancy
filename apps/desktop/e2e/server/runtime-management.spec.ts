import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

/**
 * Runtime management E2E tests — verifies agent runtime configuration
 * through the UI (model config in General tab, project settings).
 *
 * Note: Model Config is part of the General tab on AgentDetailPage,
 * not a separate tab. Project Settings has general, agent, permissions tabs.
 */

test.describe('Runtime Management E2E', () => {
  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Runtime Management Test')

    // Create agent via URL navigation for reliability
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    agentId = await helper.createAgent('Runtime Agent')
  })

  test('agent general tab shows model config section', async ({
    window,
    helper,
  }) => {
    // Navigate to agent detail page directly via URL
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)

    // Wait for General tab (default active tab)
    await expect(window.locator('[data-testid="tab-general"]')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Should show MODEL CONFIG section within the General tab
    await expect(window.getByText('MODEL CONFIG')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    // Should show PROVIDER and MODEL labels
    await expect(window.getByText('PROVIDER', { exact: true })).toBeVisible()
    await expect(window.getByText('MODEL', { exact: true })).toBeVisible()
  })

  test('agent general tab shows provider selector', async ({
    window,
    helper,
  }) => {
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)

    await expect(window.getByText('MODEL CONFIG')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Provider select should be visible
    await expect(window.getByText('PROVIDER', { exact: true })).toBeVisible()
    const providerSelect = window.locator('select').first()
    await expect(providerSelect).toBeVisible()
  })

  test('save agent changes and verify persistence', async ({
    window,
    helper,
  }) => {
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)

    await expect(window.getByText('INFO')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Edit agent name
    const nameInput = window.locator('input').first()
    await expect(nameInput).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await nameInput.fill('Runtime Agent Updated')

    // Save
    await window.getByRole('button', { name: 'Save' }).click()

    // Verify in store that name was saved
    await helper.store.waitFor(
      `state.agents.find(a => a.id === "${agentId}")?.name === "Runtime Agent Updated"`,
      TIMEOUTS.PAGE_LOAD,
    )
  })

  test('project settings permissions tab', async ({
    window,
    helper,
  }) => {
    // Navigate to project settings
    await helper.navigateTo(`/projects/${projectId}/settings`)

    // Click Permissions tab (testIdPrefix="project-settings")
    await expect(window.locator('[data-testid="project-settings-tab-permissions"]')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await window.locator('[data-testid="project-settings-tab-permissions"]').click()

    await expect(window.getByText('PERMISSION MODE', { exact: true })).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('project settings general tab shows project info', async ({
    window,
    helper,
  }) => {
    await helper.navigateTo(`/projects/${projectId}/settings`)

    // Click General tab (testIdPrefix="project-settings")
    await window.locator('[data-testid="project-settings-tab-general"]').click()

    await expect(window.getByText('BASIC INFO')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.getByText('PROJECT NAME')).toBeVisible()
    await expect(window.getByText('DESCRIPTION')).toBeVisible()
    await expect(window.getByText('ICON')).toBeVisible()
  })
})
