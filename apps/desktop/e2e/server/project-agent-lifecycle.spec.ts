import { test, expect } from '../fixtures'

test.describe('Project & Agent Lifecycle', () => {
  test.beforeAll(async ({ helper }) => {
    await helper.goHome()
  })

  let projectId: string
  let agent1Id: string
  let agent2Id: string

  // ===== Project CRUD =====

  test('POST /projects creates project with id and name', async ({ helper }) => {
    const response = await helper.apiPostRaw('/api/projects', {
      name: 'Lifecycle Test Project',
      description: 'E2E lifecycle test',
    })
    expect(response.status()).toBe(201)
    const project = await response.json()
    expect(project.id).toBeDefined()
    expect(project.name).toBe('Lifecycle Test Project')
    projectId = project.id
  })

  test('GET /projects/:id returns all expected fields', async ({ helper }) => {
    const project = await helper.apiGet(`/api/projects/${projectId}`)
    expect(project.id).toBe(projectId)
    expect(project.name).toBe('Lifecycle Test Project')
    expect(project.description).toBe('E2E lifecycle test')
    expect(project).toHaveProperty('createdAt')
    expect(project).toHaveProperty('updatedAt')
  })

  test('PATCH /projects/:id updates name and description', async ({ helper }) => {
    const updated = await helper.apiPatch(`/api/projects/${projectId}`, {
      name: 'Updated Project',
      description: 'Updated description',
    })
    expect(updated.name).toBe('Updated Project')
    expect(updated.description).toBe('Updated description')
  })

  test('GET /projects/:id verifies updated fields', async ({ helper }) => {
    const project = await helper.apiGet(`/api/projects/${projectId}`)
    expect(project.name).toBe('Updated Project')
    expect(project.description).toBe('Updated description')
  })

  // ===== Agent + defaultAgentId =====

  test('creates agents and sets defaultAgentId', async ({ helper }) => {
    const agent1 = await helper.createAgentViaApi(projectId, 'Agent One')
    agent1Id = agent1.id
    const agent2 = await helper.createAgentViaApi(projectId, 'Agent Two')
    agent2Id = agent2.id

    const updated = await helper.apiPatch(`/api/projects/${projectId}`, {
      defaultAgentId: agent1Id,
    })
    expect(updated.defaultAgentId).toBe(agent1Id)
  })

  test('DELETE agent1 cascades: clears defaultAgentId', async ({ helper }) => {
    const result = await helper.apiDelete(`/api/projects/${projectId}/agents/${agent1Id}`)
    expect(result.ok).toBe(true)

    const project = await helper.apiGet(`/api/projects/${projectId}`)
    // defaultAgentId should be cleared since agent1 was deleted
    expect(project.defaultAgentId).toBeFalsy()
  })

  test('PATCH project icon is persisted', async ({ helper }) => {
    const updated = await helper.apiPatch(`/api/projects/${projectId}`, {
      icon: 'rocket',
    })
    expect(updated.icon).toBe('rocket')

    const project = await helper.apiGet(`/api/projects/${projectId}`)
    expect(project.icon).toBe('rocket')
  })

  // ===== Conversation tied to agent2 =====

  test('creates conversation tied to agent2', async ({ helper }) => {
    const conv = await helper.createConversationViaApi(projectId, agent2Id, 'Lifecycle Conv')
    expect(conv.id).toBeDefined()
    expect(conv.agentId).toBe(agent2Id)
  })

  // ===== Project Delete =====

  test('DELETE /projects/:id removes project', async ({ helper }) => {
    const result = await helper.apiDelete(`/api/projects/${projectId}`)
    expect(result.ok).toBe(true)
  })

  test('GET /projects/:id returns 404 after deletion', async ({ helper }) => {
    const response = await helper.apiGetRaw(`/api/projects/${projectId}`)
    expect(response.status()).toBe(404)
  })
})
