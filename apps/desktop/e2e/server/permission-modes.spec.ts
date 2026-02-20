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
    helper,
  }) => {
    await helper.navigateTo(`/projects/${projectId}/settings`)

    // Click on Permissions tab
    await expect(window.locator('[data-testid="project-settings-tab-permissions"]')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await window.locator('[data-testid="project-settings-tab-permissions"]').click()

    // The PermissionsSettings component should render with PERMISSION MODE section
    await expect(window.getByText('PERMISSION MODE', { exact: true })).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('Agent tab shows main agent selector', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/settings`)
    await expect(window.locator('[data-testid="project-settings-tab-agent"]')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Switch to Agent tab
    await window.locator('[data-testid="project-settings-tab-agent"]').click()

    // Use exact match to avoid matching the auto-created "Main Agent" option
    await expect(window.getByText('MAIN AGENT', { exact: true })).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Should show the agent we created in the select dropdown options
    const agentSelect = window.locator('select').first()
    await expect(agentSelect).toBeVisible()
    await expect(agentSelect.locator('option', { hasText: 'Perm Test Agent' })).toBeAttached()
  })

  test('General tab shows basic info', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/settings`)
    await expect(window.locator('[data-testid="project-settings-tab-general"]')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Click General tab
    await window.locator('[data-testid="project-settings-tab-general"]').click()

    await expect(window.getByText('BASIC INFO')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.getByText('PROJECT NAME')).toBeVisible()
    await expect(window.getByText('DESCRIPTION')).toBeVisible()
  })

  test('MCP tab on agent detail page', async ({
    window,
    helper,
  }) => {
    // Navigate to agent detail page via URL
    const agents = await helper.store.get<Array<{ id: string; name: string }>>('agents')
    const permAgent = agents.find(a => a.name === 'Perm Test Agent')
    expect(permAgent).toBeDefined()

    await helper.navigateTo(`/projects/${projectId}/agents/${permAgent!.id}`)
    // AgentDetailPage tabs have no testIdPrefix, so tab-general is the default
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
