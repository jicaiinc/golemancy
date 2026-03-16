import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Team Topology UI', () => {
  let projectId: string
  let teamId: string
  let agent1Id: string
  let agent2Id: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Team Topology Test')

    // Create two agents
    const agent1 = await helper.createAgentViaApi(projectId, 'Lead Agent')
    const agent2 = await helper.createAgentViaApi(projectId, 'Worker Agent')
    agent1Id = agent1.id
    agent2Id = agent2.id

    // Create team with both agents (agent2 under agent1)
    const team = await helper.createTeamViaApi(projectId, 'Topology Test Team', [
      { agentId: agent1Id },
      { agentId: agent2Id, parentAgentId: agent1Id },
    ])
    teamId = team.id
  })

  test('team detail page renders topology view', async ({ window, helper }) => {
    // Force store refresh
    await window.evaluate(() => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (store) store.getState().clearProject()
    })
    await helper.navigateTo(`/projects/${projectId}/teams/${teamId}`)

    // Detail page container should be visible
    await expect(window.locator(SELECTORS.TEAM_DETAIL_PAGE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('topology nodes render for each team member', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/teams/${teamId}`)

    await expect(window.locator(SELECTORS.TEAM_DETAIL_PAGE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Should have topology nodes for both agents
    const nodes = window.locator('[data-testid="team-topology-node"]')
    await expect(nodes.first()).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    const count = await nodes.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('member names are visible in topology', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/teams/${teamId}`)

    await expect(window.locator(SELECTORS.TEAM_DETAIL_PAGE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Both agent names should be visible somewhere in the topology
    await expect(window.getByText('Lead Agent')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.getByText('Worker Agent')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })
})
