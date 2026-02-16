import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Agent Config — 6 Tab Navigation', () => {
  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Agent Config E2E')

    // Navigate to agents and create one
    await helper.clickNav('agents')
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    agentId = await helper.createAgent(
      'Config Test Agent',
      'You are a test agent for config verification.',
    )
  })

  test('navigate to agent detail page', async ({ window, helper }) => {
    // Click on the agent card/item to navigate to detail page
    const agentItem = window.locator(`[data-testid="agent-item-${agentId}"]`)
    await agentItem.click()

    // Should see agent name on detail page
    await expect(window.getByText('Config Test Agent')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('Info tab shows agent details', async ({ window }) => {
    // Info tab is the default tab
    await expect(window.getByText('Info')).toBeVisible()

    // Should show name, description, system prompt fields
    const nameInput = window.locator('input').filter({ hasText: '' }).first()
    await expect(nameInput).toBeVisible()

    // System prompt text should be visible
    await expect(
      window.getByText('You are a test agent for config verification.'),
    ).toBeVisible()
  })

  test('switch to Skills tab', async ({ window }) => {
    await window.getByText('Skills').click()
    // Should show skills-related content
    await expect(
      window.getByText('ASSIGNED SKILLS').or(window.getByText('No skills')),
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('switch to Tools tab and verify Bash toggle', async ({ window }) => {
    await window.getByText('Tools').click()
    await expect(window.getByText('BUILT-IN TOOLS')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    // Bash tool should be visible
    await expect(window.getByText('Bash')).toBeVisible()
    await expect(window.getByText('Browser')).toBeVisible()
  })

  test('switch to MCP tab', async ({ window }) => {
    await window.getByText('MCP').click()
    await expect(
      window
        .getByText('ASSIGNED MCP SERVERS')
        .or(window.getByText('No MCP servers')),
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('switch to Sub-Agents tab', async ({ window }) => {
    await window.getByText('Sub-Agents').click()
    await expect(
      window
        .getByText('ASSIGNED SUB-AGENTS')
        .or(window.getByText('No sub-agents')),
    ).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('switch to Model Config tab and see effective config', async ({
    window,
  }) => {
    await window.getByText('Model Config').click()
    await expect(window.getByText('EFFECTIVE CONFIG')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    // Should display provider and model info
    await expect(window.getByText('Provider:')).toBeVisible()
    await expect(window.getByText('Model:')).toBeVisible()
    await expect(window.getByText('Temperature:')).toBeVisible()
  })

  test('edit system prompt in Info tab and save', async ({ window }) => {
    // Switch back to Info tab
    await window.getByText('Info').click()

    // Find the system prompt textarea and change it
    const textarea = window.locator('textarea').first()
    await textarea.fill('Updated system prompt for E2E test.')

    // Click Save button
    await window.getByText('Save').click()

    // "Saved!" indicator should appear
    await expect(window.getByText('Saved!')).toBeVisible({ timeout: 5000 })

    // Verify the value persisted in store
    const agents = await window.evaluate(() => {
      const store = (window as any).__GOLEMANCY_STORE__
      return store?.getState()?.agents ?? []
    })
    const agent = agents.find((a: any) => a.id === agentId)
    expect(agent?.systemPrompt).toBe('Updated system prompt for E2E test.')
  })
})
