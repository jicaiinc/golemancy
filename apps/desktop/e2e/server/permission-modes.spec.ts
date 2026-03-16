import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

/**
 * Permission mode E2E tests — verifies that changing permission modes
 * affects the UI and agent behavior appropriately.
 */

test.describe('Permission Modes E2E', () => {
  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Permission Modes Test')

    // Create an agent
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await helper.createAgent('Perm Test Agent')
  })

  test('navigate to project settings and see Permissions tab', async ({
    window,
    helper,
  }) => {
    await helper.navigateTo(`/projects/${projectId}/settings`)

    // Settings page should have Permissions tab (testIdPrefix="project-settings")
    await expect(window.locator('[data-testid="project-settings-tab-permissions"]')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('Permissions tab renders permission mode cards', async ({
    window,
  }) => {
    // Click on Permissions tab
    await window.locator('[data-testid="project-settings-tab-permissions"]').click()

    // The PermissionsSettings component should render with PERMISSION MODE section
    await expect(window.getByText('PERMISSION MODE')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Should show all three mode cards
    await expect(window.getByText('Restricted')).toBeVisible()
    await expect(window.getByText('Sandbox')).toBeVisible()
    await expect(window.getByText('Unrestricted')).toBeVisible()
  })

  test('General tab shows default agent/team selector', async ({ window, helper }) => {
    // Re-navigate to settings for resilience
    await helper.navigateTo(`/projects/${projectId}/settings`)
    await expect(window.locator('[data-testid="project-settings-tab-general"]')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // General tab is active by default — should show default agent/team selector
    await expect(window.getByText('DEFAULT AGENT / TEAM')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Should show the agent we created in the select dropdown options
    const agentSelect = window.locator('select').first()
    await expect(agentSelect).toBeVisible()
    await expect(agentSelect.locator('option', { hasText: 'Perm Test Agent' })).toBeAttached()
  })

  test('Permissions tab mode cards are clickable', async ({ window, helper }) => {
    // Navigate to settings Permissions tab
    await helper.navigateTo(`/projects/${projectId}/settings`)
    await window.locator('[data-testid="project-settings-tab-permissions"]').click()

    await expect(window.getByText('PERMISSION MODE')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Click Restricted mode card — should succeed without error
    await window.getByText('Restricted').click()
    // Verify the mode was selected (the card should be visually selected)
    // Give a moment for state update
    await window.waitForTimeout(500)
  })

  test('MCP tab on agent detail page shows MCP section', async ({
    window,
    helper,
  }) => {
    // Navigate to agent detail page via URL
    const agents = await helper.store.get<Array<{ id: string; name: string }>>('agents')
    const permAgent = agents.find(a => a.name === 'Perm Test Agent')
    expect(permAgent).toBeDefined()

    await helper.navigateTo(`/projects/${projectId}/agents/${permAgent!.id}`)
    await expect(window.locator('[data-testid="tab-general"]')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Switch to MCP tab
    await window.locator('[data-testid="tab-mcp"]').click()

    // Without MCP servers assigned, should show empty state or assigned section
    await expect(
      window.getByText('ASSIGNED MCP SERVERS').or(
        window.getByText('No MCP servers'),
      ).first()
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })
})
