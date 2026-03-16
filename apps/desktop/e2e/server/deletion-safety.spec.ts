import { test, expect } from '../fixtures'

test.describe('Deletion Safety', () => {
  let projectId: string
  let agent1Id: string
  let agent2Id: string
  let teamId: string
  let cronId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()

    // Create project with 2 agents, 1 team (referencing agent1), 1 cron (referencing agent1)
    const project = await helper.createProjectViaApi('Deletion Safety Test')
    projectId = project.id

    const agent1 = await helper.createAgentViaApi(projectId, 'Delete Target Agent')
    agent1Id = agent1.id

    const agent2 = await helper.createAgentViaApi(projectId, 'Surviving Agent')
    agent2Id = agent2.id

    const team = await helper.createTeamViaApi(projectId, 'Orphan Test Team', [
      { agentId: agent1Id },
      { agentId: agent2Id, parentAgentId: agent1Id },
    ])
    teamId = team.id

    const cron = await helper.apiPost(`/api/projects/${projectId}/cron-jobs`, {
      name: 'Orphan Test Cron',
      agentId: agent1Id,
      scheduleType: 'cron',
      cronExpression: '0 0 * * *',
      instruction: 'test cron',
      enabled: false,
    })
    cronId = cron.id
  })

  test('deleting agent leaves orphan reference in team — team GET still works', async ({ helper }) => {
    // Delete agent1 (referenced by team as member)
    const deleteResult = await helper.apiDelete(
      `/api/projects/${projectId}/agents/${agent1Id}`,
    )
    expect(deleteResult.ok).toBe(true)

    // Team GET should still return 200 despite orphan member reference
    const teamResponse = await helper.apiGetRaw(
      `/api/projects/${projectId}/teams/${teamId}`,
    )
    expect(teamResponse.status()).toBe(200)

    const team = await teamResponse.json()
    expect(team.id).toBe(teamId)
    expect(team.name).toBe('Orphan Test Team')
  })

  test('deleting agent leaves orphan reference in cron — cron GET still works', async ({ helper }) => {
    // agent1 already deleted in previous test
    // Cron references agent1 via agentId — GET should still return 200
    const cronResponse = await helper.apiGetRaw(
      `/api/projects/${projectId}/cron-jobs/${cronId}`,
    )
    expect(cronResponse.status()).toBe(200)

    const cron = await cronResponse.json()
    expect(cron.id).toBe(cronId)
    expect(cron.name).toBe('Orphan Test Cron')
  })

  test('deleting team leaves orphan reference in cron — cron GET still works', async ({ helper }) => {
    // Delete the team
    const deleteResult = await helper.apiDelete(
      `/api/projects/${projectId}/teams/${teamId}`,
    )
    expect(deleteResult.ok).toBe(true)

    // Cron GET should still work (cron is independent of team)
    const cronResponse = await helper.apiGetRaw(
      `/api/projects/${projectId}/cron-jobs/${cronId}`,
    )
    expect(cronResponse.status()).toBe(200)

    const cron = await cronResponse.json()
    expect(cron.id).toBe(cronId)
  })

  test('deleting project cascades — all sub-resource APIs return 404', async ({ helper }) => {
    // Delete the project
    const deleteResult = await helper.apiDelete(`/api/projects/${projectId}`)
    expect(deleteResult.ok).toBe(true)

    // Project itself should be 404
    const projectResponse = await helper.apiGetRaw(`/api/projects/${projectId}`)
    expect(projectResponse.status()).toBe(404)

    // Sub-resources should be 404 (project directory deleted, database gone)
    const agentResponse = await helper.apiGetRaw(
      `/api/projects/${projectId}/agents/${agent2Id}`,
    )
    expect(agentResponse.status()).toBe(404)

    const cronResponse = await helper.apiGetRaw(
      `/api/projects/${projectId}/cron-jobs/${cronId}`,
    )
    expect(cronResponse.status()).toBe(404)
  })
})
