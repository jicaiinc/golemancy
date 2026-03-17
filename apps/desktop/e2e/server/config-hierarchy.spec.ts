import { test, expect } from '../fixtures'

/**
 * B5: Config hierarchy — Global Settings → Agent Config.
 *
 * The model config resolution is 2-level:
 * - GlobalSettings.defaultModel → provides the fallback for agent creation
 * - Agent.modelConfig → agent-specific override (always stored)
 *
 * The test helper's createAgentViaApi always resolves a modelConfig
 * (from opts or global default), so every agent has an explicit modelConfig.
 * The key thing to verify: agents store their modelConfig independently,
 * and changing the global default doesn't retroactively affect existing agents.
 */
test.describe('Config Hierarchy', () => {
  let projectId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(60_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('Config Hierarchy Test')
    projectId = project.id
  })

  test('agent stores modelConfig from creation', async ({ helper }) => {
    const agent = await helper.apiPost(`/api/projects/${projectId}/agents`, {
      name: 'Config Test Agent',
      description: '',
      systemPrompt: '',
      modelConfig: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
    })

    // GET should return the stored modelConfig
    const fetched = await helper.apiGet(`/api/projects/${projectId}/agents/${agent.id}`)
    expect(fetched.modelConfig).toBeDefined()
    expect(fetched.modelConfig.provider).toBe('anthropic')
    expect(fetched.modelConfig.model).toBe('claude-sonnet-4-5')
  })

  test('PATCH agent modelConfig updates provider and model', async ({ helper }) => {
    const agent = await helper.apiPost(`/api/projects/${projectId}/agents`, {
      name: 'Config Patch Agent',
      description: '',
      systemPrompt: '',
      modelConfig: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
    })

    // Update to different provider/model
    await helper.apiPatch(`/api/projects/${projectId}/agents/${agent.id}`, {
      modelConfig: { provider: 'openai', model: 'gpt-4o' },
    })

    const fetched = await helper.apiGet(`/api/projects/${projectId}/agents/${agent.id}`)
    expect(fetched.modelConfig.provider).toBe('openai')
    expect(fetched.modelConfig.model).toBe('gpt-4o')
  })

  test('changing global defaultModel does not affect existing agents', async ({ helper }) => {
    // Read current global settings
    const originalSettings = await helper.apiGet('/api/settings')
    const originalDefault = originalSettings.defaultModel

    // Create agent — it will use current global default (via test helper)
    const agent = await helper.createAgentViaApi(projectId, 'Existing Config Agent')
    const agentConfig = await helper.apiGet(`/api/projects/${projectId}/agents/${agent.id}`)
    const originalAgentModel = agentConfig.modelConfig

    // Change global default to something different
    const newDefault = { provider: 'openai', model: 'gpt-4o-mini' }
    await helper.apiPatch('/api/settings', { defaultModel: newDefault })

    // Existing agent should still have its original modelConfig
    const agentAfter = await helper.apiGet(`/api/projects/${projectId}/agents/${agent.id}`)
    expect(agentAfter.modelConfig.provider).toBe(originalAgentModel.provider)
    expect(agentAfter.modelConfig.model).toBe(originalAgentModel.model)

    // Restore original global default
    if (originalDefault) {
      await helper.apiPatch('/api/settings', { defaultModel: originalDefault })
    }
  })

  test('two agents in same project can have different modelConfigs', async ({ helper }) => {
    const agentA = await helper.apiPost(`/api/projects/${projectId}/agents`, {
      name: 'Provider A Agent',
      description: '',
      systemPrompt: '',
      modelConfig: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
    })

    const agentB = await helper.apiPost(`/api/projects/${projectId}/agents`, {
      name: 'Provider B Agent',
      description: '',
      systemPrompt: '',
      modelConfig: { provider: 'google', model: 'gemini-2.5-flash' },
    })

    const fetchedA = await helper.apiGet(`/api/projects/${projectId}/agents/${agentA.id}`)
    const fetchedB = await helper.apiGet(`/api/projects/${projectId}/agents/${agentB.id}`)

    expect(fetchedA.modelConfig.provider).toBe('anthropic')
    expect(fetchedB.modelConfig.provider).toBe('google')
    expect(fetchedA.modelConfig.model).not.toBe(fetchedB.modelConfig.model)
  })
})
