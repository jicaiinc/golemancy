import { test, expect } from '../fixtures'

test.describe('Team API', () => {
  let projectId: string
  let agentId1: string
  let agentId2: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()
    const project = await helper.createProjectViaApi('Team API Test')
    projectId = project.id

    const agent1 = await helper.createAgentViaApi(projectId, 'Team Leader')
    const agent2 = await helper.createAgentViaApi(projectId, 'Team Member')
    agentId1 = agent1.id
    agentId2 = agent2.id
  })

  // ===== CRUD =====

  let teamId: string

  test('POST /teams creates a team with members', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/teams`, {
      name: 'Alpha Team',
      description: 'First test team',
      members: [
        { agentId: agentId1 },
        { agentId: agentId2, parentAgentId: agentId1 },
      ],
    })
    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.id).toBeDefined()
    expect(data.name).toBe('Alpha Team')
    expect(data.description).toBe('First test team')
    expect(data.members).toHaveLength(2)
    teamId = data.id
  })

  test('GET /teams lists teams including created one', async ({ helper }) => {
    const list = await helper.apiGet(`/api/projects/${projectId}/teams`)
    expect(Array.isArray(list)).toBe(true)
    const found = list.find((t: any) => t.id === teamId)
    expect(found).toBeDefined()
    expect(found.name).toBe('Alpha Team')
  })

  test('GET /teams/:id returns full team with members', async ({ helper }) => {
    const team = await helper.apiGet(`/api/projects/${projectId}/teams/${teamId}`)
    expect(team.id).toBe(teamId)
    expect(team.name).toBe('Alpha Team')
    expect(team.description).toBe('First test team')
    expect(team.members).toHaveLength(2)

    // Verify member structure
    const leader = team.members.find((m: any) => m.agentId === agentId1)
    expect(leader).toBeDefined()
    const member = team.members.find((m: any) => m.agentId === agentId2)
    expect(member).toBeDefined()
    expect(member.parentAgentId).toBe(agentId1)
  })

  test('PATCH /teams/:id updates name and description', async ({ helper }) => {
    const updated = await helper.apiPatch(`/api/projects/${projectId}/teams/${teamId}`, {
      name: 'Alpha Team V2',
      description: 'Updated description',
    })
    expect(updated.name).toBe('Alpha Team V2')
    expect(updated.description).toBe('Updated description')
  })

  test('PATCH /teams/:id updates members', async ({ helper }) => {
    // Remove the child member, keep only leader
    const updated = await helper.apiPatch(`/api/projects/${projectId}/teams/${teamId}`, {
      members: [{ agentId: agentId1 }],
    })
    expect(updated.members).toHaveLength(1)
    expect(updated.members[0].agentId).toBe(agentId1)
  })

  // ===== Clone =====

  test('POST /teams/:id/clone creates a copy', async ({ helper }) => {
    // Restore members first
    await helper.apiPatch(`/api/projects/${projectId}/teams/${teamId}`, {
      members: [
        { agentId: agentId1 },
        { agentId: agentId2, parentAgentId: agentId1 },
      ],
    })

    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/teams/${teamId}/clone`,
      { name: 'Alpha Clone' },
    )
    expect(response.status()).toBe(201)
    const cloned = await response.json()
    expect(cloned.id).toBeDefined()
    expect(cloned.id).not.toBe(teamId)
    expect(cloned.name).toBe('Alpha Clone')
    expect(cloned.members).toHaveLength(2)
  })

  test('POST /teams/:id/clone returns 400 for empty name', async ({ helper }) => {
    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/teams/${teamId}/clone`,
      { name: '' },
    )
    expect(response.status()).toBe(400)
  })

  test('POST /teams/:id/clone returns 400 for name over 100 chars', async ({ helper }) => {
    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/teams/${teamId}/clone`,
      { name: 'A'.repeat(101) },
    )
    expect(response.status()).toBe(400)
  })

  // ===== Layout =====

  test('GET /teams/:id/layout returns layout (empty initially)', async ({ helper }) => {
    const layout = await helper.apiGet(`/api/projects/${projectId}/teams/${teamId}/layout`)
    // Layout may be empty object or null initially
    expect(layout).toBeDefined()
  })

  test('PUT /teams/:id/layout saves and returns layout', async ({ helper }) => {
    const layoutData = {
      nodes: [
        { id: agentId1, position: { x: 100, y: 200 } },
        { id: agentId2, position: { x: 300, y: 200 } },
      ],
    }

    const saved = await helper.apiPut(
      `/api/projects/${projectId}/teams/${teamId}/layout`,
      layoutData,
    )
    expect(saved.nodes).toHaveLength(2)

    // Verify by GET
    const fetched = await helper.apiGet(`/api/projects/${projectId}/teams/${teamId}/layout`)
    expect(fetched.nodes).toHaveLength(2)
    expect(fetched.nodes[0].position.x).toBe(100)
  })

  // ===== Delete =====

  test('DELETE /teams/:id removes the team', async ({ helper }) => {
    // Create a disposable team
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/teams`, {
      name: 'Disposable Team',
      members: [],
    })
    const disposable = await response.json()

    const delResult = await helper.apiDelete(`/api/projects/${projectId}/teams/${disposable.id}`)
    expect(delResult.ok).toBe(true)

    // Verify it's gone
    const list = await helper.apiGet(`/api/projects/${projectId}/teams`)
    const found = list.find((t: any) => t.id === disposable.id)
    expect(found).toBeUndefined()
  })

  test('DELETE /teams/:id clears project defaultTargetId if pointing to team', async ({ helper }) => {
    // Create a team and set it as default target
    const resp = await helper.apiPostRaw(`/api/projects/${projectId}/teams`, {
      name: 'Default Target Team',
      members: [],
    })
    const team = await resp.json()
    await helper.setProjectDefaultTarget(projectId, 'team', team.id)

    // Verify default is set
    const projectBefore = await helper.apiGet(`/api/projects/${projectId}`)
    expect(projectBefore.defaultTargetId).toBe(team.id)

    // Delete the team
    await helper.apiDelete(`/api/projects/${projectId}/teams/${team.id}`)

    // Verify default was cleared
    const projectAfter = await helper.apiGet(`/api/projects/${projectId}`)
    expect(projectAfter.defaultTargetId).toBeFalsy()
  })

  test('GET /teams/:id returns 404 for non-existent team', async ({ helper }) => {
    const response = await helper.apiGetRaw(`/api/projects/${projectId}/teams/nonexistent-id`)
    expect(response.status()).toBe(404)
  })
})
