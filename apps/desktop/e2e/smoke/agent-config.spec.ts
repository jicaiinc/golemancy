import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Agent Config — 6 Tab Navigation', () => {
  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Agent Config E2E')

    // Navigate to agents via URL (more reliable than sidebar click in beforeAll)
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    agentId = await helper.createAgent(
      'Config Test Agent',
      'You are a test agent for config verification.',
    )
  })

  test('navigate to agent detail page', async ({ window, helper }) => {
    // Navigate to agent detail page via URL (agent item click depends on list rendering timing)
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)

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
    await window.locator('[data-testid="tab-skills"]').click()
    await expect(window.getByText('ASSIGNED SKILLS')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('switch to Tools tab and verify Bash toggle', async ({ window }) => {
    await window.locator('[data-testid="tab-tools"]').click()
    await expect(window.getByText('BUILT-IN TOOLS')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    // Bash tool should be visible
    await expect(window.getByText('Bash').first()).toBeVisible()
    await expect(window.getByText('Browser').first()).toBeVisible()
  })

  test('switch to MCP tab', async ({ window }) => {
    await window.locator('[data-testid="tab-mcp"]').click()
    await expect(window.getByText('ASSIGNED MCP SERVERS')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('switch to Sub-Agents tab', async ({ window }) => {
    await window.locator('[data-testid="tab-sub-agents"]').click()
    await expect(window.getByText('ASSIGNED SUB-AGENTS')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('switch to Model Config tab and see effective config', async ({
    window,
  }) => {
    await window.locator('[data-testid="tab-model"]').click()
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
    await window.locator('[data-testid="tab-info"]').click()

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
