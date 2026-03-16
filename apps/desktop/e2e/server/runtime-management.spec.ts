import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

/**
 * Runtime management E2E tests — verifies agent runtime configuration
 * through the UI (model config, provider settings).
 *
 * Model config is accessed through Agent detail (Model Config tab).
 * Project general settings show basic info + default agent/team.
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

  test('model config tab shows MODEL CONFIG section', async ({
    window,
    helper,
  }) => {
    // Navigate to agent detail page directly via URL
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)

    // Wait for tabs to render — actual tab id is "model-config"
    await expect(window.locator('[data-testid="tab-model-config"]')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Switch to Model Config tab
    await window.locator('[data-testid="tab-model-config"]').click()

    // Should show MODEL CONFIG section
    await expect(window.getByText('MODEL CONFIG')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    // Should show PROVIDER and MODEL labels
    await expect(window.getByText('PROVIDER', { exact: true })).toBeVisible()
  })

  test('model config tab shows provider selector', async ({
    window,
    helper,
  }) => {
    // Ensure we're on Model Config tab (re-navigate for resilience)
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)
    await window.locator('[data-testid="tab-model-config"]').click()
    await expect(window.getByText('MODEL CONFIG')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Provider select should be visible
    const providerSelect = window.locator('select').first()
    await expect(providerSelect).toBeVisible()
  })

  test('model config tab shows compact threshold', async ({
    window,
    helper,
  }) => {
    // Navigate to Model Config tab
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)
    await window.locator('[data-testid="tab-model-config"]').click()
    await expect(window.getByText('MODEL CONFIG')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Should show COMPACT THRESHOLD section
    await expect(window.getByText('COMPACT THRESHOLD')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('project settings general tab shows basic info', async ({
    window,
    helper,
  }) => {
    // Navigate to project settings
    await helper.navigateTo(`/projects/${projectId}/settings`)

    await expect(window.getByText('Project Settings')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // General tab is active by default (testIdPrefix="project-settings")
    await expect(window.getByText('BASIC INFO')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.getByText('PROJECT NAME')).toBeVisible()
    await expect(window.getByText('DESCRIPTION')).toBeVisible()
    await expect(window.getByText('ICON')).toBeVisible()
  })

  test('project settings shows default agent/team selector', async ({
    window,
    helper,
  }) => {
    // Ensure on project settings general tab
    await helper.navigateTo(`/projects/${projectId}/settings`)
    await expect(window.getByText('BASIC INFO')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Should show default agent/team selector
    await expect(window.getByText('DEFAULT AGENT / TEAM')).toBeVisible()
    const select = window.locator('select').first()
    await expect(select).toBeVisible()
  })
})
