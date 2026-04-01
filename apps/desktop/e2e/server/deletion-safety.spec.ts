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

    // Project itself should be 404 immediately (guarded by isProjectBlocked)
    const projectResponse = await helper.apiGetRaw(`/api/projects/${projectId}`)
    expect(projectResponse.status()).toBe(404)

    // Sub-resources return 404 after background deletion completes (async cleanup)
    await expect(async () => {
      const agentResponse = await helper.apiGetRaw(
        `/api/projects/${projectId}/agents/${agent2Id}`,
      )
      expect(agentResponse.status()).toBe(404)
    }).toPass({ timeout: 5000 })

    await expect(async () => {
      const cronResponse = await helper.apiGetRaw(
        `/api/projects/${projectId}/cron-jobs/${cronId}`,
      )
      expect(cronResponse.status()).toBe(404)
    }).toPass({ timeout: 5000 })
  })

  test('sub-resource APIs return 404 immediately via isProjectBlocked guard', async ({ helper }) => {
    // Create a fresh project with sub-resources
    const proj = await helper.createProjectViaApi('Block Guard Test')
    const agent = await helper.createAgentViaApi(proj.id, 'Guard Agent')
    const skill = await helper.apiPost(`/api/projects/${proj.id}/skills`, {
      name: 'Guard Skill',
      description: 'test',
      instructions: 'test',
    })
    const team = await helper.createTeamViaApi(proj.id, 'Guard Team', [
      { agentId: agent.id },
    ])

    // Delete project (async — returns immediately, background cleanup follows)
    const deleteResult = await helper.apiDelete(`/api/projects/${proj.id}`)
    expect(deleteResult.ok).toBe(true)

    // All sub-resource routes should return 404 IMMEDIATELY (middleware guard, no polling)
    const endpoints = [
      `/api/projects/${proj.id}/agents`,
      `/api/projects/${proj.id}/agents/${agent.id}`,
      `/api/projects/${proj.id}/skills`,
      `/api/projects/${proj.id}/skills/${skill.id}`,
      `/api/projects/${proj.id}/teams`,
      `/api/projects/${proj.id}/teams/${team.id}`,
      `/api/projects/${proj.id}/conversations`,
      `/api/projects/${proj.id}/cron-jobs`,
      `/api/projects/${proj.id}/mcp-servers`,
      `/api/projects/${proj.id}/workspace`,
      `/api/projects/${proj.id}/dashboard/summary`,
      `/api/projects/${proj.id}/permissions-config`,
      `/api/projects/${proj.id}/runtime/status`,
    ]

    for (const endpoint of endpoints) {
      const res = await helper.apiGetRaw(endpoint)
      expect(res.status(), `GET ${endpoint} should be 404`).toBe(404)
    }

    // POST should also be blocked
    const postRes = await helper.apiPostRaw(`/api/projects/${proj.id}/agents`, {
      name: 'Should Fail',
    })
    expect(postRes.status()).toBe(404)
  })
})
