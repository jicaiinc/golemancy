import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

/**
 * B1: Agent status UI indicator rendering.
 *
 * The agent list page shows a status bar with CSS classes based on agent.status:
 * - idle: bg-text-secondary (gray, no animation)
 * - running: bg-accent-green + pixel-pulse animation
 * - error: bg-accent-red + pixel-shake animation
 *
 * This test verifies the UI reflects different status states by PATCHing the
 * agent's status via API and checking the rendered CSS. This tests the
 * rendering pipeline (status field → CSS class mapping), not the runtime
 * status tracking (which is tested in ai/agent-status-transitions.spec.ts).
 */
test.describe('Agent Status UI', () => {
  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Agent Status UI Test')

    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    agentId = await helper.createAgent('Status UI Agent')
  })

  test('idle agent shows gray status indicator', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/agents`)

    // Wait for agent card to render
    await expect(window.getByText('Status UI Agent')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // The status bar should have the idle color class (bg-text-secondary)
    // Agent cards have a thin status bar element with the status color
    const agentCard = window.getByText('Status UI Agent').locator('..')
    // Look for any element with the idle color class within or near the agent card
    const statusBar = agentCard.locator('.bg-text-secondary').first()
    await expect(statusBar).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('agent patched to running shows green pulsing indicator', async ({ window, helper }) => {
    // PATCH agent status to 'running' via API
    await helper.apiPatch(`/api/projects/${projectId}/agents/${agentId}`, {
      status: 'running',
    })

    // Force store refresh
    await window.evaluate(() => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (store) store.getState().clearProject()
    })

    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.getByText('Status UI Agent')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // The status bar should have the running color class (bg-accent-green)
    const agentCard = window.getByText('Status UI Agent').locator('..')
    const statusBar = agentCard.locator('.bg-accent-green').first()
    await expect(statusBar).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Restore to idle
    await helper.apiPatch(`/api/projects/${projectId}/agents/${agentId}`, {
      status: 'idle',
    })
  })

  test('agent patched to error shows red indicator', async ({ window, helper }) => {
    await helper.apiPatch(`/api/projects/${projectId}/agents/${agentId}`, {
      status: 'error',
    })

    await window.evaluate(() => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (store) store.getState().clearProject()
    })

    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.getByText('Status UI Agent')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    const agentCard = window.getByText('Status UI Agent').locator('..')
    const statusBar = agentCard.locator('.bg-accent-red').first()
    await expect(statusBar).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Restore to idle
    await helper.apiPatch(`/api/projects/${projectId}/agents/${agentId}`, {
      status: 'idle',
    })
  })
})
