import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Agent CRUD', () => {
  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()

    // Check if there's already a project we can use
    const projectCard = window.locator('[data-testid^="project-item-"]').first()
    const hasProject = await projectCard.isVisible().catch(() => false)

    if (hasProject) {
      await projectCard.click()
      await expect(window.locator(SELECTORS.SIDEBAR)).toBeVisible({
        timeout: TIMEOUTS.PAGE_LOAD,
      })
      const url = window.url()
      const match = url.match(/projects\/([^/]+)/)
      projectId = match?.[1] ?? ''
    } else {
      projectId = await helper.createProject('Agent Test Project')
    }
  })

  test('navigate to agents page', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('agent create modal opens', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Click create agent button
    await window.click(SELECTORS.CREATE_AGENT_BTN)

    // Modal should appear
    await expect(window.locator(SELECTORS.AGENT_NAME_INPUT)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.locator(SELECTORS.CONFIRM_BTN)).toBeVisible()

    // Close the modal
    await window.click(SELECTORS.CANCEL_BTN)
  })

  test('create a new agent and verify in store', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Create agent
    const agentId = await helper.createAgent('Test Agent', 'You are a helpful test agent.')
    expect(agentId).toBeTruthy()

    // Verify agent exists in store immediately after creation (check by ID)
    const agents = await helper.store.get<Array<{ id: string }>>('agents')
    expect(agents.length).toBeGreaterThan(0)
    const createdAgent = agents.find(a => a.id === agentId)
    expect(createdAgent).toBeDefined()
  })

  test('delete agent and verify removed', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Create a new agent to delete
    const agentId = await helper.createAgent('Agent To Delete')

    // Verify it exists in store
    let agents = await helper.store.get<Array<{ id: string }>>('agents')
    expect(agents.find(a => a.id === agentId)).toBeDefined()

    // Navigate to agent detail page
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)

    // Click "Delete Agent" — AgentDetailPage deletes immediately (no confirmation modal)
    const deleteBtn = window.getByRole('button', { name: 'Delete Agent' })
    await expect(deleteBtn).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await deleteBtn.click()

    // Wait for agent to be removed from store
    await helper.store.waitFor(
      `!state.agents.find(a => a.id === "${agentId}")`,
      TIMEOUTS.PAGE_LOAD,
    )

    // Verify agent is gone
    agents = await helper.store.get<Array<{ id: string }>>('agents')
    expect(agents.find(a => a.id === agentId)).toBeUndefined()
  })

  test('agent config info tab edit name', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Create agent to edit
    const agentId = await helper.createAgent('Agent To Rename')

    // Navigate to agent detail
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)

    // Wait for the General tab content to load — look for NAME label
    await expect(window.getByText('NAME', { exact: true }).first()).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Find the agent name input — the first input inside the INFO card
    const nameInput = window.locator('input').first()
    await expect(nameInput).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Clear and type new name
    await nameInput.fill('Renamed Agent')

    // Save changes — button text is "Save" (no data-testid)
    await window.getByRole('button', { name: 'Save' }).click()

    // Verify name was updated in store
    await helper.store.waitFor(
      `state.agents.find(a => a.id === "${agentId}")?.name === "Renamed Agent"`,
      TIMEOUTS.PAGE_LOAD,
    )
  })
})
