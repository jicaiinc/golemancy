import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Template End-to-End', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  // Track project IDs for cleanup
  const projectIds: string[] = []

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    // Ensure defaultModel is configured
    const settings = await helper.apiGet('/api/settings')
    if (!settings.defaultModel) {
      await helper.apiPatch('/api/settings', {
        defaultModel: { provider: 'openai', model: 'gpt-5-mini' },
      })
    }
  })

  test.afterAll(async ({ helper }) => {
    for (const pid of projectIds) {
      try { await helper.apiDelete(`/api/projects/${pid}`) } catch { /* ignore */ }
    }
  })

  test('writing-assistant template: agent can chat', async ({ helper }) => {
    test.setTimeout(120_000)

    // Create project from template
    const project = await helper.apiPost('/api/projects/from-template', {
      templateId: 'writing-assistant',
    })
    projectIds.push(project.id)

    // Find the Writer agent
    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    const writer = agents.find((a: any) => a.name === 'Writer')
    expect(writer).toBeDefined()

    // Create conversation and chat via UI
    const conv = await helper.createConversationViaApi(project.id, writer.id, 'Template Chat')
    await helper.enterConversation(project.id, conv.id)
    const response = await helper.sendAndWaitForResponse(
      'Write a one-sentence greeting.',
    )

    expect(response).toBeTruthy()
    expect(response.length).toBeGreaterThan(0)
  })

  test('deep-research template: team delegation works', async ({ helper }) => {
    test.setTimeout(180_000)

    // Create project from template
    const project = await helper.apiPost('/api/projects/from-template', {
      templateId: 'deep-research',
    })
    projectIds.push(project.id)

    // Find the team
    const teams = await helper.apiGet(`/api/projects/${project.id}/teams`)
    expect(teams).toHaveLength(1)
    const team = teams[0]

    // Send a team chat via UI
    const { response } = await helper.sendTeamChatViaUi(
      project.id,
      team.id,
      'What is the capital of Japan? Reply briefly.',
    )

    // Response should exist
    expect(response.length).toBeGreaterThan(0)

    // Verify delegation happened: sub-agent display should be visible
    expect(await helper.hasToolCall()).toBe(true)
  })

  test('template MCP servers: connectivity check', async ({ helper }) => {
    test.setTimeout(60_000)

    // Use the writing-assistant project (already created in first test) or create a new one
    const project = await helper.apiPost('/api/projects/from-template', {
      templateId: 'writing-assistant',
    })
    projectIds.push(project.id)

    // Verify MCP server exists
    const mcpServers = await helper.apiGet(`/api/projects/${project.id}/mcp-servers`)
    expect(mcpServers).toHaveLength(1)
    expect(mcpServers[0].name).toBe('fetch')

    // Test MCP connectivity
    const testResult = await helper.apiPostRaw(
      `/api/projects/${project.id}/mcp-servers/fetch/test`,
      {},
    )
    const body = await testResult.json()

    // We just check the response has an 'ok' field (may be true or false depending on uvx availability)
    expect(body).toHaveProperty('ok')
  })

  test('smart-secretary template: agent can chat', async ({ helper }) => {
    test.setTimeout(120_000)

    const project = await helper.apiPost('/api/projects/from-template', {
      templateId: 'smart-secretary',
    })
    projectIds.push(project.id)

    // Find the Secretary agent
    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    const secretary = agents.find((a: any) => a.name === 'Secretary')
    expect(secretary).toBeDefined()

    const conv = await helper.createConversationViaApi(project.id, secretary.id, 'Secretary Chat')
    await helper.enterConversation(project.id, conv.id)
    const response = await helper.sendAndWaitForResponse(
      'What can you help me with? Reply in one sentence.',
    )

    expect(response).toBeTruthy()
    expect(response.length).toBeGreaterThan(0)
  })

  test('translator template: agent can chat', async ({ helper }) => {
    test.setTimeout(120_000)

    const project = await helper.apiPost('/api/projects/from-template', {
      templateId: 'translator',
    })
    projectIds.push(project.id)

    // Find the Translator agent
    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    const translator = agents.find((a: any) => a.name === 'Translator')
    expect(translator).toBeDefined()

    const conv = await helper.createConversationViaApi(project.id, translator.id, 'Translator Chat')
    await helper.enterConversation(project.id, conv.id)
    const response = await helper.sendAndWaitForResponse(
      'Translate "hello" to Spanish. Reply with just the translation.',
    )

    expect(response).toBeTruthy()
    expect(response.toLowerCase()).toContain('hola')
  })
})
