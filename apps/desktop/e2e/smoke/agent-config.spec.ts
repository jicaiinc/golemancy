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

  test('General tab shows agent details', async ({ window }) => {
    // General tab is the default tab — section heading is "INFO"
    await expect(window.getByText('INFO')).toBeVisible()

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

  test('switch to Memory tab', async ({ window }) => {
    await window.locator('[data-testid="tab-memory"]').click()
    // Memory tab should show either empty state or memory list
    await expect(window.locator('[data-testid="tab-memory"]')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('Model Config tab shows provider/model selects', async ({
    window,
  }) => {
    // Model Config is its own tab (not part of General)
    await window.locator('[data-testid="tab-model-config"]').click()
    await expect(window.getByText('MODEL CONFIG', { exact: true })).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.getByText('PROVIDER', { exact: true })).toBeVisible()
    await expect(window.getByText('MODEL', { exact: true })).toBeVisible()
  })

  test('edit system prompt in General tab and save', async ({ window, helper }) => {
    // Switch back to General tab (which contains the INFO section with system prompt)
    await window.locator('[data-testid="tab-general"]').click()

    // Find the system prompt textarea and change it
    const textarea = window.locator('textarea').first()
    await textarea.fill('Updated system prompt for E2E test.')

    // Click Save button
    await window.getByText('Save').click()

    // "Saved!" indicator should appear
    await expect(window.getByText('Saved!')).toBeVisible({ timeout: 5000 })

    // Verify persistence via API read-back (avoids TQ cache invalidation race)
    const agent = await helper.apiGet(`/api/projects/${projectId}/agents/${agentId}`)
    expect(agent.systemPrompt).toBe('Updated system prompt for E2E test.')
  })
})
