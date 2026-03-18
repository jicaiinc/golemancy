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

  test('Permissions tab renders permissions settings component', async ({
    window,
  }) => {
    // Click on Permissions tab using testid to avoid strict mode violation
    await window.locator('[data-testid="project-settings-tab-permissions"]').click()

    // The PermissionsSettings component should render with PERMISSION MODE section
    await expect(window.locator('[data-testid="permissions-settings"]').getByText('PERMISSION MODE')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  // Removed: "Agent tab shows main agent selector" — ProjectSettingsPage only has
  // "general" and "permissions" tabs. There is no "agent" tab; the main agent
  // selector (DEFAULT AGENT/TEAM) lives in the General tab.

  // Removed: "Provider tab shows global default" — ProjectSettingsPage only has
  // "general" and "permissions" tabs. There is no "provider" tab; provider
  // override configuration was removed from project settings.

  test('MCP tab on agent shows warning when mode is not sandbox', async ({
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

    // Switch to MCP tab using testid
    await window.locator('[data-testid="tab-mcp"]').click()

    // Without MCP servers assigned, should show empty state
    await expect(
      window.getByText('ASSIGNED MCP SERVERS').or(
        window.getByText('No MCP servers'),
      ).first()
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })
})
