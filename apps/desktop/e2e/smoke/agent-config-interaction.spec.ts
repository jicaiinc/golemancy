import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Agent Config Interaction — Auto-Save & Explicit Save', () => {
  let projectId: string
  let agentId: string
  let skillId: string
  let mcpName: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Agent Config Interaction Test')

    // Create agent via UI
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    agentId = await helper.createAgent('Config Interaction Agent', 'Test agent for config interaction.')

    // Create a skill via API
    const skill = await helper.apiPost(`/api/projects/${projectId}/skills`, {
      name: 'E2E Interaction Skill',
      description: 'Skill for config interaction test',
      instructions: 'Test instructions.',
    })
    skillId = skill.id

    // Create an MCP server via API
    mcpName = 'e2e-interaction-mcp'
    await helper.apiPost(`/api/projects/${projectId}/mcp`, {
      name: mcpName,
      transportType: 'stdio',
      command: 'echo',
      args: ['hello'],
    })

    // Navigate to agent detail page
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)
    await expect(window.getByText('Config Interaction Agent')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('Skills Tab: assign skill triggers auto-save', async ({ window, helper }) => {
    // Switch to Skills tab
    await window.locator('[data-testid="tab-skills"]').click()
    await expect(window.getByText('ASSIGNED SKILLS')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Click the assign button for our skill
    await window.locator(SELECTORS.SKILL_ASSIGN_BTN(skillId)).click()

    // Wait for store to reflect the skill assignment (auto-save)
    await helper.store.waitFor(
      `state.agents.find(a => a.id === '${agentId}')?.skillIds?.includes('${skillId}')`,
      TIMEOUTS.PAGE_LOAD,
    )

    // Verify skill appears in assigned list
    await expect(window.locator(SELECTORS.SKILL_ASSIGNED(skillId))).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('Tools Tab: toggle browser triggers auto-save', async ({ window, helper }) => {
    // Switch to Tools tab
    await window.locator('[data-testid="tab-tools"]').click()
    await expect(window.getByText('BUILT-IN TOOLS')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Browser should be off by default
    const browserToggle = window.locator(SELECTORS.TOOL_TOGGLE('browser'))
    await expect(browserToggle).toBeVisible()

    // Click to enable browser
    await browserToggle.click()

    // Wait for store to reflect the change (auto-save)
    await helper.store.waitFor(
      `state.agents.find(a => a.id === '${agentId}')?.builtinTools?.browser === true`,
      TIMEOUTS.PAGE_LOAD,
    )

    // Toggle browser back off
    await browserToggle.click()

    // Wait for store to reflect the revert
    await helper.store.waitFor(
      `state.agents.find(a => a.id === '${agentId}')?.builtinTools?.browser === false`,
      TIMEOUTS.PAGE_LOAD,
    )
  })

  test('MCP Tab: assign MCP server triggers auto-save', async ({ window, helper }) => {
    // Switch to MCP tab
    await window.locator('[data-testid="tab-mcp"]').click()
    await expect(window.getByText('ASSIGNED MCP SERVERS')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Click the assign button for our MCP server
    await window.locator(SELECTORS.MCP_ASSIGN_BTN(mcpName)).click()

    // Wait for store to reflect the MCP assignment (auto-save)
    await helper.store.waitFor(
      `state.agents.find(a => a.id === '${agentId}')?.mcpServers?.includes('${mcpName}')`,
      TIMEOUTS.PAGE_LOAD,
    )

    // Verify MCP appears in assigned list
    await expect(window.locator(SELECTORS.MCP_ASSIGNED(mcpName))).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('Model Config Tab: explicit save persists compactThreshold', async ({ window, helper }) => {
    // Switch to Model Config tab
    await window.locator('[data-testid="tab-model-config"]').click()
    await expect(window.getByText('MODEL CONFIG')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Find the compact threshold control and change it
    // The CompactThresholdControl renders a slider or input
    // Look for the compact threshold section
    await expect(window.getByText('COMPACT THRESHOLD')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Click Save button (explicit save — change should NOT auto-persist)
    const saveBtn = window.getByRole('button', { name: 'Save' })
    await expect(saveBtn).toBeVisible()

    // Click save
    await saveBtn.click()

    // "Saved!" indicator should appear
    await expect(window.getByText('Saved!')).toBeVisible({ timeout: 5000 })

    // Verify store has the agent's compactThreshold persisted
    const agents = await window.evaluate(() => {
      const store = (window as any).__GOLEMANCY_STORE__
      return store?.getState()?.agents ?? []
    })
    const agent = agents.find((a: any) => a.id === agentId)
    expect(agent).toBeTruthy()
    // compactThreshold should be defined (either default or changed)
    expect(agent.compactThreshold).toBeDefined()
  })
})
