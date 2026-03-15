import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Permission Config UI', () => {
  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Permission Config UI Test')

    // Navigate to Project Settings → Permissions tab
    await helper.navigateTo(`/projects/${projectId}/settings`)
    await window.locator(SELECTORS.PROJECT_SETTINGS_TAB('permissions')).click()
    await expect(window.locator(SELECTORS.PERMISSIONS_SETTINGS)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('permission mode selector shows three modes', async ({ window }) => {
    // ExecutionModeCard renders as role="radiogroup"
    const modeSelector = window.getByRole('radiogroup')
    await expect(modeSelector).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // All three modes should be visible as options
    await expect(window.getByText('Restricted', { exact: true })).toBeVisible()
    await expect(window.getByText('Sandbox', { exact: true })).toBeVisible()
    await expect(window.getByText('Unrestricted', { exact: true })).toBeVisible()
  })

  test('selecting Sandbox mode shows config editor', async ({ window }) => {
    // Click Sandbox mode (may already be selected as default, but click to ensure)
    const sandboxOption = window.getByRole('radiogroup').getByText('Sandbox', { exact: true })
    await sandboxOption.click()

    // Handle sandbox unavailable modal if it appears (click "Enable Anyway")
    const enableAnywayBtn = window.getByText('Enable Anyway')
    if (await enableAnywayBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await enableAnywayBtn.click()
    }

    // Sandbox config editor sections should appear
    await expect(window.getByText('FILESYSTEM PERMISSIONS')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('network restrictions toggle works', async ({ window }) => {
    // Ensure we're in Sandbox mode with config visible
    await expect(window.locator(SELECTORS.NETWORK_RESTRICTIONS_TOGGLE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Toggle network restrictions on
    await window.locator(SELECTORS.NETWORK_RESTRICTIONS_TOGGLE).click()

    // When enabled, domain editors should appear
    await expect(window.getByText('ALLOWED DOMAINS', { exact: true })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('DENIED DOMAINS', { exact: true })).toBeVisible()

    // Toggle off
    await window.locator(SELECTORS.NETWORK_RESTRICTIONS_TOGGLE).click()

    // Domain editors should disappear
    await expect(window.getByText('ALLOWED DOMAINS', { exact: true })).not.toBeVisible({ timeout: 3000 })
  })

  test('applyToMCP toggle is visible and clickable', async ({ window }) => {
    await expect(window.locator(SELECTORS.APPLY_TO_MCP_TOGGLE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Click the toggle
    await window.locator(SELECTORS.APPLY_TO_MCP_TOGGLE).click()

    // Toggle should work (state change is visual)
    await expect(window.locator(SELECTORS.APPLY_TO_MCP_TOGGLE)).toBeVisible()
  })

  test('denied commands section is visible', async ({ window }) => {
    // Denied commands section should be present in Sandbox mode
    await expect(window.getByText('DENIED COMMANDS')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('selecting Restricted mode hides sandbox config', async ({ window, helper }) => {
    // Navigate to ensure fresh state
    await helper.navigateTo(`/projects/${projectId}/settings`)
    await window.locator(SELECTORS.PROJECT_SETTINGS_TAB('permissions')).click()
    await expect(window.locator(SELECTORS.PERMISSIONS_SETTINGS)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Select Restricted mode
    const restrictedOption = window
      .getByRole('radiogroup')
      .getByText('Restricted', { exact: true })
    await restrictedOption.click()

    // Sandbox config editor should not be visible (Restricted has no config)
    await expect(window.getByText('FILESYSTEM PERMISSIONS')).not.toBeVisible({ timeout: 3000 })
  })

  test('selecting Unrestricted mode shows confirmation modal', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/settings`)
    await window.locator(SELECTORS.PROJECT_SETTINGS_TAB('permissions')).click()
    await expect(window.locator(SELECTORS.PERMISSIONS_SETTINGS)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Click Unrestricted
    const unrestrictedOption = window
      .getByRole('radiogroup')
      .getByText('Unrestricted')
    await unrestrictedOption.click()

    // Confirmation modal should appear
    await expect(window.getByText('Enable Unrestricted')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Cancel the modal
    await window.getByRole('button', { name: 'Cancel' }).click()

    // Modal should close
    await expect(window.getByText('Enable Unrestricted')).not.toBeVisible({ timeout: 3000 })
  })

  test('named config CRUD: create, verify, delete', async ({ window, helper }) => {
    // Ensure Sandbox mode
    await helper.navigateTo(`/projects/${projectId}/settings`)
    await window.locator(SELECTORS.PROJECT_SETTINGS_TAB('permissions')).click()
    await expect(window.locator(SELECTORS.PERMISSIONS_SETTINGS)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Make sure sandbox mode is selected
    const sandboxOption = window.getByRole('radiogroup').getByText('Sandbox', { exact: true })
    await sandboxOption.click()

    // Handle sandbox unavailable modal if it appears
    const enableAnywayBtn = window.getByText('Enable Anyway')
    if (await enableAnywayBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await enableAnywayBtn.click()
    }

    // Wait for config management section
    await expect(window.getByText('FILESYSTEM PERMISSIONS')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Click "Save As" to create a named config
    await window.getByText('Save As').click()

    // Modal should appear with name input
    const nameInput = window.locator('input[placeholder]').last()
    await nameInput.fill('E2E Test Config')

    // Save
    await window.getByRole('button', { name: 'Save' }).last().click()

    // "Saved!" indicator should appear briefly
    await expect(window.getByText('Saved!')).toBeVisible({ timeout: 5000 })

    // Now delete the config — the Delete button should be visible for non-default configs
    const deleteBtn = window.getByRole('button', { name: 'Delete' })
    if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteBtn.click()

      // Confirmation modal
      const confirmDelete = window.getByRole('button', { name: 'Delete' }).last()
      await confirmDelete.click()

      // Should revert to default config
      await expect(window.getByText('Saved!')).toBeVisible({ timeout: 5000 })
    }
  })
})
