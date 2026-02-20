import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

/**
 * Runtime management E2E tests — verifies agent runtime configuration
 * through the UI (model config, provider settings, effective config display).
 *
 * Note: There is no dedicated Runtime page in the current UI.
 * Runtime management is accessed through Agent detail (Model Config tab)
 * and Project Settings (Provider tab).
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

  test('model config tab shows effective configuration', async ({
    window,
    helper,
  }) => {
    // Navigate to agent detail page directly via URL
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)

    // Wait for tabs to render
    await expect(window.locator('[data-testid="tab-model"]')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Switch to Model Config tab using testid
    await window.locator('[data-testid="tab-model"]').click()

    // Should show EFFECTIVE CONFIG section
    await expect(window.getByText('EFFECTIVE CONFIG')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.getByText('Provider:')).toBeVisible()
    await expect(window.getByText('Model:')).toBeVisible()
    await expect(window.getByText('Temperature:')).toBeVisible()
  })

  test('model config tab shows provider selector with inherit option', async ({
    window,
    helper,
  }) => {
    // Ensure we're on Model Config tab (re-navigate for resilience)
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)
    await window.locator('[data-testid="tab-model"]').click()
    await expect(window.getByText('EFFECTIVE CONFIG')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Provider label (exact match to avoid matching "Provider: " in effective config)
    await expect(window.getByText('PROVIDER', { exact: true })).toBeVisible()
    const providerSelect = window.locator('select').first()
    await expect(providerSelect).toBeVisible()

    // Should show inheritance source label
    await expect(
      window.getByText('Inherited from global').or(
        window.getByText('Inherited from project'),
      ).first()
    ).toBeVisible()
  })

  test('save model config changes and verify persistence', async ({
    window,
    helper,
  }) => {
    // Ensure we're on Model Config tab
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)
    await window.locator('[data-testid="tab-model"]').click()
    await expect(window.getByText('EFFECTIVE CONFIG')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    const tempInput = window.locator('input[type="number"]').first()
    await expect(tempInput).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await tempInput.fill('0.3')

    // Save
    await window.getByText('Save Model Config').click()
    await expect(window.getByText('Saved!')).toBeVisible({ timeout: 5000 })

    // Verify in store that temperature was saved
    const agents = await helper.store.get<Array<{ id: string; modelConfig: any }>>('agents')
    const agent = agents?.find(a => a.id === agentId)
    expect(agent?.modelConfig?.temperature).toBe(0.3)
  })

  test('project provider override configuration', async ({
    window,
    helper,
  }) => {
    // Navigate to project settings
    await helper.navigateTo(`/projects/${projectId}/settings`)

    await expect(window.getByText('Project Settings')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Click Provider tab using testid
    await window.locator('[data-testid="tab-provider"]').click()
    await expect(window.getByText('PROVIDER OVERRIDE')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Should show MAX CONCURRENT AGENTS input
    await expect(window.getByText('MAX CONCURRENT AGENTS')).toBeVisible()
  })

  test('general tab shows project info and working directory', async ({
    window,
  }) => {
    // Click General tab using testid
    await window.locator('[data-testid="tab-general"]').click()

    await expect(window.getByText('BASIC INFO')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.getByText('PROJECT NAME')).toBeVisible()
    await expect(window.getByText('DESCRIPTION')).toBeVisible()
    await expect(window.getByText('ICON')).toBeVisible()
  })
})
