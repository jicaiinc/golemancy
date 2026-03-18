import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

/**
 * Runtime management E2E tests — verifies agent runtime configuration
 * through the UI (model config, provider settings, effective config display).
 *
 * Note: There is no dedicated Runtime page in the current UI.
 * Runtime management is accessed through Agent detail (Model Config tab)
 * and Project Settings (General tab).
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

  test('model config tab shows provider and model selectors', async ({
    window,
    helper,
  }) => {
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)

    await expect(window.locator('[data-testid="tab-model-config"]')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await window.locator('[data-testid="tab-model-config"]').click()

    // MODEL CONFIG section title
    await expect(window.getByText('MODEL CONFIG', { exact: true })).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.getByText('PROVIDER')).toBeVisible()
    await expect(window.getByText('MODEL', { exact: true })).toBeVisible()
  })

  test('model config tab shows provider select and compact threshold', async ({
    window,
    helper,
  }) => {
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)
    await window.locator('[data-testid="tab-model-config"]').click()
    await expect(window.getByText('MODEL CONFIG', { exact: true })).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Provider select is visible
    const providerSelect = window.locator('select').first()
    await expect(providerSelect).toBeVisible()

    // Compact threshold section
    await expect(window.getByText('COMPACT THRESHOLD')).toBeVisible()
  })

  test('save model config changes and verify persistence', async ({
    window,
    helper,
  }) => {
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)
    await window.locator('[data-testid="tab-model-config"]').click()
    await expect(window.getByText('MODEL CONFIG', { exact: true })).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Read current compactThreshold from API
    const before = await helper.apiGet(`/api/projects/${projectId}/agents/${agentId}`)
    const originalThreshold = before.compactThreshold

    // Change compactThreshold via slider to a distinct value
    const newThreshold = originalThreshold === 50000 ? 80000 : 50000
    const slider = window.locator('input[type="range"]')
    await slider.fill(String(newThreshold))

    // Save
    const saveBtn = window.getByRole('button', { name: /^Save$/i })
    await saveBtn.click()
    await expect(window.getByText('Saved!')).toBeVisible({ timeout: 5000 })

    // Verify persistence via API read-back (not in-memory store)
    const after = await helper.apiGet(`/api/projects/${projectId}/agents/${agentId}`)
    expect(after.compactThreshold).toBe(newThreshold)
  })

  // Removed: "project provider override configuration" — ProjectSettingsPage only
  // has "general" and "permissions" tabs. There is no "provider" tab; provider
  // override configuration was removed from project settings.

  test('general tab shows project info and working directory', async ({
    window,
    helper,
  }) => {
    // Navigate to project settings (testIdPrefix="project-settings")
    await helper.navigateTo(`/projects/${projectId}/settings`)

    await expect(window.getByText('Project Settings')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Click General tab using testid
    await window.locator('[data-testid="project-settings-tab-general"]').click()

    await expect(window.getByText('BASIC INFO')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.getByText('PROJECT NAME')).toBeVisible()
    await expect(window.getByText('DESCRIPTION')).toBeVisible()
    await expect(window.getByText('ICON')).toBeVisible()
  })
})
