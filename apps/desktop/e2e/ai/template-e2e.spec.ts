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
        defaultModel: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
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

    // Create conversation and chat
    const conv = await helper.createConversationViaApi(project.id, writer.id, 'Template Chat')
    const result = await helper.sendChatViaApi(
      project.id, writer.id, conv.id,
      'Write a one-sentence greeting.',
    )

    expect(result.response.length).toBeGreaterThan(20)
    expect(result.response.toLowerCase()).not.toMatch(/error|failed|unable/i)
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

    // Send a team chat
    const { response, events } = await helper.createTeamChatViaApi(
      project.id,
      team.id,
      'What is the capital of Japan? Reply briefly.',
    )

    // Response should be meaningful
    expect(response.length).toBeGreaterThan(20)
    expect(response.toLowerCase()).not.toMatch(/error|failed|unable/i)

    // Verify delegation happened: look for tool_call events with delegate_to_ in the name
    const delegationEvents = events.filter(
      e => e.type === 'tool_call' && typeof e.data?.toolName === 'string' && e.data.toolName.includes('delegate_to_'),
    )
    expect(delegationEvents.length).toBeGreaterThanOrEqual(1)

    // Verify delegation targets actual team member agents
    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    const agentIds = agents.map((a: any) => a.id)
    const delegatedToKnownAgent = delegationEvents.some(
      e => agentIds.some((id: string) => String(e.data.toolName).includes(id)),
    )
    expect(delegatedToKnownAgent).toBe(true)
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

    // Verify MCP connectivity succeeded
    expect(body).toHaveProperty('ok')
    expect(body.ok).toBe(true)
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
    const result = await helper.sendChatViaApi(
      project.id, secretary.id, conv.id,
      'What can you help me with? Reply in one sentence.',
    )

    expect(result.response.length).toBeGreaterThan(20)
    expect(result.response.toLowerCase()).not.toMatch(/error|failed|unable/i)
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
    const result = await helper.sendChatViaApi(
      project.id, translator.id, conv.id,
      'Translate "hello" to Spanish. Reply with just the translation.',
    )

    expect(result.response.length).toBeGreaterThan(20)
    expect(result.response.toLowerCase()).not.toMatch(/error|failed|unable/i)
    expect(result.response.toLowerCase()).toContain('hola')
  })
})
