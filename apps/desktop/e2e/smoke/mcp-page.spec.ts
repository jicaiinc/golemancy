import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('MCP Servers Page', () => {
  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('MCP Test Project')
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await helper.createAgent('MCP Test Agent')
  })

  test('navigate to MCP page via sidebar', async ({ window, helper }) => {
    await helper.clickNav('mcp-servers')
    await expect(window.locator(SELECTORS.MCP_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('mcp page shows header', async ({ window, helper }) => {
    await helper.clickNav('mcp-servers')
    await expect(window.locator(SELECTORS.MCP_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByRole('heading', { name: 'MCP Servers' })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('empty state displayed when no servers', async ({ window, helper }) => {
    await helper.clickNav('mcp-servers')
    await expect(window.locator(SELECTORS.MCP_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('No MCP servers configured')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('new server button visible', async ({ window, helper }) => {
    await helper.clickNav('mcp-servers')
    await expect(window.locator(SELECTORS.MCP_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator(SELECTORS.MCP_NEW_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('open MCP form modal', async ({ window, helper }) => {
    await helper.clickNav('mcp-servers')
    await expect(window.locator(SELECTORS.MCP_NEW_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    await window.locator(SELECTORS.MCP_NEW_BTN).click()

    // Verify modal fields
    await expect(window.getByRole('heading', { name: 'New MCP Server' })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('NAME')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('TRANSPORT')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Close modal
    await window.getByText('Cancel').click()
  })

  test('transport type selector shows STDIO/SSE/HTTP', async ({ window, helper }) => {
    await helper.clickNav('mcp-servers')
    await expect(window.locator(SELECTORS.MCP_NEW_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    await window.locator(SELECTORS.MCP_NEW_BTN).click()
    await expect(window.getByRole('heading', { name: 'New MCP Server' })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Verify all three transport buttons
    await expect(window.locator(SELECTORS.MCP_TRANSPORT_STDIO)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator(SELECTORS.MCP_TRANSPORT_SSE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator(SELECTORS.MCP_TRANSPORT_HTTP)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Close modal
    await window.getByText('Cancel').click()
  })
})
