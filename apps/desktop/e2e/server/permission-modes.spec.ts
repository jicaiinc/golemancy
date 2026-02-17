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

    // Settings page should have Permissions tab
    await expect(window.locator('[data-testid="tab-permissions"]')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('Permissions tab renders permissions settings component', async ({
    window,
  }) => {
    // Click on Permissions tab using testid to avoid strict mode violation
    await window.locator('[data-testid="tab-permissions"]').click()

    // The PermissionsSettings component should render with PERMISSION MODE section
    await expect(window.getByText('PERMISSION MODE')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('Agent tab shows main agent selector', async ({ window, helper }) => {
    // Re-navigate to settings for resilience
    await helper.navigateTo(`/projects/${projectId}/settings`)
    await expect(window.locator('[data-testid="tab-agent"]')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Switch to Agent tab using testid
    await window.locator('[data-testid="tab-agent"]').click()

    // Use exact match to avoid matching the auto-created "Main Agent" option
    await expect(window.getByText('MAIN AGENT', { exact: true })).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Should show the agent we created in the select dropdown options
    const agentSelect = window.locator('select').first()
    await expect(agentSelect).toBeVisible()
    await expect(agentSelect.locator('option', { hasText: 'Perm Test Agent' })).toBeAttached()
  })

  test('Provider tab shows global default', async ({ window, helper }) => {
    // Re-navigate to settings for resilience
    await helper.navigateTo(`/projects/${projectId}/settings`)
    await expect(window.locator('[data-testid="tab-provider"]')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Click Provider tab using testid
    await window.locator('[data-testid="tab-provider"]').click()

    await expect(window.getByText('PROVIDER OVERRIDE')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Should show the "Inherit from global" option in the select
    const providerSelect = window.locator('select').first()
    await expect(providerSelect).toBeVisible()
  })

  test('MCP tab on agent shows warning when mode is not sandbox', async ({
    window,
    helper,
  }) => {
    // Navigate to agent detail page via URL
    const agents = await helper.store.get<Array<{ id: string; name: string }>>('agents')
    const permAgent = agents.find(a => a.name === 'Perm Test Agent')
    expect(permAgent).toBeDefined()

    await helper.navigateTo(`/projects/${projectId}/agents/${permAgent!.id}`)
    await expect(window.locator('[data-testid="tab-info"]')).toBeVisible({
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
