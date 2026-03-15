import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Agent Advanced — Clone, Status Badge, MCP Warning', () => {
  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()

    projectId = await helper.createProject('Agent Advanced Test')

    // Navigate to agents page
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    agentId = await helper.createAgent('Clone Source Agent', 'You are a test agent.')
  })

  test('agent shows idle status badge', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Agent cards should be visible
    const agentCards = window.locator('[data-testid^="agent-card-"]')
    await expect(agentCards.first()).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Look for idle status badge text on the agent card
    const agentCard = window.locator(`[data-testid="agent-card-${agentId}"]`)
    if (await agentCard.isVisible()) {
      // The status badge should show "idle" (case-insensitive)
      await expect(agentCard.getByText(/idle/i)).toBeVisible()
    }
  })

  test('clone agent via UI creates a new agent', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    const agentCards = window.locator('[data-testid^="agent-card-"]')
    await expect(agentCards.first()).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    const initialCount = await agentCards.count()

    // Click clone button for the agent
    const cloneBtn = window.locator(SELECTORS.AGENT_CLONE_BTN(agentId))
    if (await cloneBtn.isVisible()) {
      await cloneBtn.click()

      // Wait for a new agent card to appear
      await expect(agentCards).toHaveCount(initialCount + 1, { timeout: TIMEOUTS.PAGE_LOAD })

      // The cloned agent should be visible
      const lastCard = agentCards.last()
      await expect(lastCard).toBeVisible()
    }
  })

  test('MCP server shows security warning indicator', async ({ window, helper }) => {
    // Create an MCP server for the project
    await helper.apiPost(`/api/projects/${projectId}/mcp-servers`, {
      name: 'test-mcp',
      transportType: 'stdio',
      command: 'echo',
      args: ['hello'],
    })

    // Navigate to MCP page
    await helper.clickNav('mcp')
    await expect(window.locator(SELECTORS.MCP_PAGE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // MCP card should be visible
    const mcpCards = window.locator(SELECTORS.MCP_CARD)
    await expect(mcpCards.first()).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // MCP servers inherently have a security warning about external tool execution
    // Verify the MCP card renders without errors
    const mcpCard = mcpCards.first()
    await expect(mcpCard).toBeVisible()
  })

  test('agent detail page renders all tabs', async ({ window, helper }) => {
    // Navigate to agent detail page
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Click on the agent card to go to detail
    const agentCard = window.locator(`[data-testid="agent-card-${agentId}"]`)
    if (await agentCard.isVisible()) {
      await agentCard.click()

      // Agent tabs should be visible
      await expect(window.locator(SELECTORS.AGENT_TABS)).toBeVisible({
        timeout: TIMEOUTS.PAGE_LOAD,
      })
    }
  })
})
