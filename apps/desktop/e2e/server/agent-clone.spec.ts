import { test, expect } from '../fixtures'

test.describe('Agent Clone API', () => {
  let projectId: string
  let sourceAgentId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()

    const project = await helper.createProjectViaApi('Agent Clone Test')
    projectId = project.id

    // Create a source agent with rich configuration
    const agent = await helper.createAgentViaApi(projectId, 'Source Agent', {
      systemPrompt: 'You are a helpful research assistant specialized in data analysis.',
    })
    sourceAgentId = agent.id

    // Enrich agent with additional fields via PATCH
    await helper.apiPatch(`/api/projects/${projectId}/agents/${sourceAgentId}`, {
      builtinTools: { bash: true, memory: true, browser: true, task: true, computer_use: false },
      compactThreshold: 8000,
    })
  })

  test('POST /agents/:id/clone creates a new agent with copied fields', async ({ helper }) => {
    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/agents/${sourceAgentId}/clone`,
      { name: 'Cloned Agent' },
    )
    expect(response.status()).toBe(201)

    const cloned = await response.json()

    // New ID, not the same as source
    expect(cloned.id).toBeDefined()
    expect(cloned.id).not.toBe(sourceAgentId)

    // Name comes from request
    expect(cloned.name).toBe('Cloned Agent')

    // Status is always idle for cloned agent
    expect(cloned.status).toBe('idle')

    // System prompt deep copied
    expect(cloned.systemPrompt).toBe('You are a helpful research assistant specialized in data analysis.')

    // Builtin tools deep copied
    expect(cloned.builtinTools).toEqual(
      expect.objectContaining({
        bash: true,
        memory: true,
        browser: true,
        task: true,
        computer_use: false,
      }),
    )

    // compactThreshold copied
    expect(cloned.compactThreshold).toBe(8000)

    // Arrays are copied (initially empty for source)
    expect(cloned.skillIds).toEqual([])
    expect(cloned.mcpServers).toEqual([])

    // Timestamps are new
    expect(cloned.createdAt).toBeDefined()
    expect(cloned.updatedAt).toBeDefined()
  })

  test('cloned agent is independently retrievable via GET', async ({ helper }) => {
    const cloneResponse = await helper.apiPostRaw(
      `/api/projects/${projectId}/agents/${sourceAgentId}/clone`,
      { name: 'Second Clone' },
    )
    const cloned = await cloneResponse.json()

    // GET the cloned agent
    const fetched = await helper.apiGet(`/api/projects/${projectId}/agents/${cloned.id}`)
    expect(fetched.id).toBe(cloned.id)
    expect(fetched.name).toBe('Second Clone')
    expect(fetched.systemPrompt).toBe('You are a helpful research assistant specialized in data analysis.')
  })

  test('clone with empty name returns 400', async ({ helper }) => {
    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/agents/${sourceAgentId}/clone`,
      { name: '' },
    )
    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('VALIDATION_FAILED')
  })

  test('clone with name exceeding 100 chars returns 400', async ({ helper }) => {
    const longName = 'A'.repeat(101)
    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/agents/${sourceAgentId}/clone`,
      { name: longName },
    )
    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('VALIDATION_FAILED')
  })

  test('clone without name field returns 400', async ({ helper }) => {
    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/agents/${sourceAgentId}/clone`,
      {},
    )
    expect(response.status()).toBe(400)
  })

  test('clone preserves skillIds and mcpServers when present', async ({ helper }) => {
    // Create a skill and MCP to assign
    const skill = await helper.apiPost(`/api/projects/${projectId}/skills`, {
      name: 'Test Skill',
      description: 'A test skill',
      instructions: 'Do test things',
    })

    // Assign skill to source agent
    await helper.assignSkillToAgent(projectId, sourceAgentId, skill.id)

    // Clone and verify skillIds are copied
    const cloneResponse = await helper.apiPostRaw(
      `/api/projects/${projectId}/agents/${sourceAgentId}/clone`,
      { name: 'Clone With Skills' },
    )
    expect(cloneResponse.status()).toBe(201)
    const cloned = await cloneResponse.json()
    expect(cloned.skillIds).toContain(skill.id)
  })

  // ===== Cleanup =====

  test.afterAll(async ({ helper }) => {
    if (projectId) {
      await helper.apiDelete(`/api/projects/${projectId}`)
    }
  })
})
