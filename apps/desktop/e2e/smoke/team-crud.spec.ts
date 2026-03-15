import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Team CRUD', () => {
  let projectId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()
    const project = await helper.createProjectViaApi('Team CRUD Test')
    projectId = project.id

    // Create agents for team membership
    await helper.createAgentViaApi(projectId, 'Leader Agent')
    await helper.createAgentViaApi(projectId, 'Worker Agent')
  })

  test('create team via UI modal', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/teams`)
    await expect(window.locator(SELECTORS.CREATE_TEAM_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Open create modal
    await window.click(SELECTORS.CREATE_TEAM_BTN)
    await expect(window.locator(SELECTORS.TEAM_NAME_INPUT)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Fill in name and description
    await window.fill(SELECTORS.TEAM_NAME_INPUT, 'My Test Team')
    await window.fill(SELECTORS.TEAM_DESC_INPUT, 'A team for testing purposes')

    // Submit
    await window.click(SELECTORS.TEAM_CREATE_BTN)

    // After creation, should navigate to team detail page
    await expect(window.locator(SELECTORS.TEAM_DETAIL_PAGE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Verify team exists in store
    const teams = await helper.store.get<Array<{ id: string; name: string }>>('teams')
    const created = teams.find(t => t.name === 'My Test Team')
    expect(created).toBeDefined()
  })

  test('create button disabled when name is empty', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/teams`)
    await expect(window.locator(SELECTORS.CREATE_TEAM_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Open create modal
    await window.click(SELECTORS.CREATE_TEAM_BTN)
    await expect(window.locator(SELECTORS.TEAM_NAME_INPUT)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Create button should be disabled with empty name
    await expect(window.locator(SELECTORS.TEAM_CREATE_BTN)).toBeDisabled()

    // Type a name → should become enabled
    await window.fill(SELECTORS.TEAM_NAME_INPUT, 'Test')
    await expect(window.locator(SELECTORS.TEAM_CREATE_BTN)).toBeEnabled()

    // Cancel
    await window.click(SELECTORS.TEAM_CANCEL_BTN)
  })

  test('team card navigates to detail page on click', async ({ window, helper }) => {
    // Create team via API for predictable state
    const agent = await helper.createAgentViaApi(projectId, 'Nav Agent')
    const team = await helper.createTeamViaApi(projectId, 'Navigation Team', [
      { agentId: agent.id },
    ])

    await helper.navigateTo(`/projects/${projectId}/teams`)
    await helper.store.waitFor(
      `state.teams.find(t => t.id === "${team.id}")`,
      TIMEOUTS.PAGE_LOAD,
    )

    // Click the team card
    await window.click(SELECTORS.TEAM_CARD(team.id))

    // Should navigate to detail page
    await expect(window.locator(SELECTORS.TEAM_DETAIL_PAGE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('clone team via UI button', async ({ window, helper }) => {
    const agent = await helper.createAgentViaApi(projectId, 'Clone Agent')
    const team = await helper.createTeamViaApi(projectId, 'Original Team', [
      { agentId: agent.id },
    ])

    await helper.navigateTo(`/projects/${projectId}/teams`)
    await helper.store.waitFor(
      `state.teams.find(t => t.id === "${team.id}")`,
      TIMEOUTS.PAGE_LOAD,
    )

    // Count teams before clone
    const teamsBefore = await helper.store.get<Array<{ id: string }>>('teams')
    const countBefore = teamsBefore.length

    // Hover over the card to reveal clone button, then click
    await window.hover(SELECTORS.TEAM_CARD(team.id))
    await window.click(SELECTORS.TEAM_CLONE_BTN(team.id))

    // Wait for new team to appear in store
    await helper.store.waitFor(`state.teams.length > ${countBefore}`, TIMEOUTS.PAGE_LOAD)

    const teamsAfter = await helper.store.get<Array<{ id: string; name: string }>>('teams')
    expect(teamsAfter.length).toBe(countBefore + 1)
  })

  test('delete team via API and verify removal from store', async ({ window, helper }) => {
    const agent = await helper.createAgentViaApi(projectId, 'Del Agent')
    const team = await helper.createTeamViaApi(projectId, 'Team To Delete', [
      { agentId: agent.id },
    ])

    await helper.navigateTo(`/projects/${projectId}/teams`)
    await helper.store.waitFor(
      `state.teams.find(t => t.id === "${team.id}")`,
      TIMEOUTS.PAGE_LOAD,
    )

    // Delete via API
    await helper.apiDelete(`/api/projects/${projectId}/teams/${team.id}`)

    // Reload teams page to trigger store refresh
    await helper.navigateTo(`/projects/${projectId}/teams`)

    // Verify team card is gone
    await expect(window.locator(SELECTORS.TEAM_CARD(team.id))).not.toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })
})
