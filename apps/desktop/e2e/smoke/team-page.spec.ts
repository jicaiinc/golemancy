import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Team Page', () => {
  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Team Page Test')
  })

  test('team list page renders with empty state', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/teams`)

    // Page container visible
    await expect(window.locator(SELECTORS.TEAM_LIST_PAGE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Empty state visible (no teams yet)
    await expect(window.locator(SELECTORS.TEAM_EMPTY_STATE)).toBeVisible()

    // New Team button visible
    await expect(window.locator(SELECTORS.CREATE_TEAM_BTN)).toBeVisible()
  })

  test('New Team button opens create modal', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/teams`)
    await expect(window.locator(SELECTORS.CREATE_TEAM_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Click create button
    await window.click(SELECTORS.CREATE_TEAM_BTN)

    // Modal fields visible
    await expect(window.locator(SELECTORS.TEAM_NAME_INPUT)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.locator(SELECTORS.TEAM_DESC_INPUT)).toBeVisible()
    await expect(window.locator(SELECTORS.TEAM_CREATE_BTN)).toBeVisible()
    await expect(window.locator(SELECTORS.TEAM_CANCEL_BTN)).toBeVisible()

    // Close modal
    await window.click(SELECTORS.TEAM_CANCEL_BTN)
  })

  test('sidebar navigation to teams page works', async ({ window, helper }) => {
    // Start from dashboard
    await helper.goToProject(projectId)

    // Click teams nav
    await helper.clickNav('teams')

    // Verify team list page is displayed
    await expect(window.locator(SELECTORS.TEAM_LIST_PAGE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('team cards appear after creating a team via API', async ({ window, helper }) => {
    // Create a team via API
    const agent = await helper.createAgentViaApi(projectId, 'Team Page Agent')
    const team = await helper.createTeamViaApi(projectId, 'Display Test Team', [
      { agentId: agent.id },
    ])

    // Force store refresh: clear project so selectProject re-runs on navigation
    await window.evaluate(() => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (store) store.getState().clearProject()
    })
    await helper.navigateTo(`/projects/${projectId}/teams`)

    // Wait for store to load teams
    await helper.store.waitFor('state.teams.length > 0', TIMEOUTS.PAGE_LOAD)

    // Team card should be visible
    await expect(window.locator(SELECTORS.TEAM_CARD(team.id))).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Empty state should be gone
    await expect(window.locator(SELECTORS.TEAM_EMPTY_STATE)).not.toBeVisible()
  })
})
