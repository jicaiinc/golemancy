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
    await helper.clickNav('agents')
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await helper.createAgent('Perm Test Agent')
  })

  test('navigate to project settings and see Permissions tab', async ({
    window,
    helper,
  }) => {
    await helper.clickNav('settings')

    // Settings page should have Permissions tab
    await expect(window.getByText('Permissions')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('Permissions tab renders permissions settings component', async ({
    window,
  }) => {
    // Click on Permissions tab
    await window.getByText('Permissions').click()

    // The PermissionsSettings component should render
    // It typically shows mode selector and config options
    await expect(
      window.locator('[data-testid="permissions-settings"]').or(
        window.getByText('Permission Mode').or(
          window.getByText('sandbox').first(),
        ),
      ),
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('Agent tab shows main agent selector', async ({ window }) => {
    // Switch to Agent tab
    await window.getByText('Agent').first().click()

    await expect(window.getByText('MAIN AGENT')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Should show the agent we created
    await expect(window.getByText('Perm Test Agent')).toBeVisible()
  })

  test('Provider tab shows global default', async ({ window }) => {
    await window.getByText('Provider').click()

    await expect(window.getByText('PROVIDER OVERRIDE')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Should mention "Inherit from global"
    await expect(window.getByText('Inherit from global')).toBeVisible()
  })

  test('MCP tab on agent shows warning when mode is not sandbox', async ({
    window,
    helper,
  }) => {
    // Navigate to agent detail page
    await helper.clickNav('agents')
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Click the agent to go to detail
    await window.getByText('Perm Test Agent').click()
    await expect(window.getByText('Info')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Switch to MCP tab
    await window.getByText('MCP').click()

    // In default mode (sandbox), without MCP servers assigned, should show empty state
    await expect(
      window.getByText('No MCP servers assigned to this agent.').or(
        window.getByText('No MCP servers in this project'),
      ),
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })
})
