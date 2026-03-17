import { execFileSync } from 'child_process'
import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

/** Check if a command is available in PATH */
function hasCommand(cmd: string): boolean {
  try {
    execFileSync('which', [cmd], { encoding: 'utf-8', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

const uvxAvailable = hasCommand('uvx')

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

  test('writing-assistant template: Writer agent produces writing content', async ({ helper }) => {
    test.setTimeout(120_000)

    const project = await helper.apiPost('/api/projects/from-template', {
      templateId: 'writing-assistant',
    })
    projectIds.push(project.id)

    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    const writer = agents.find((a: any) => a.name === 'Writer')
    expect(writer).toBeDefined()

    const conv = await helper.createConversationViaApi(project.id, writer.id, 'Template Chat')
    const result = await helper.sendChatViaApi(
      project.id, writer.id, conv.id,
      'Write a short product tagline for a sustainable water bottle. Keep it under 30 words.',
    )

    expect(result.response.length).toBeGreaterThan(10)
    expect(result.response.toLowerCase()).not.toMatch(/error|failed|unable/i)
    // Verify response relates to the product — Writer agent should produce relevant copy
    expect(result.response.toLowerCase()).toMatch(
      /water|bottle|sustain|eco|drink|hydrat|green|planet|ocean|reusable|refresh|pure|clean/i,
    )
  })

  test('deep-research template: team delegation produces correct answer', async ({ helper }) => {
    test.setTimeout(180_000)

    const project = await helper.apiPost('/api/projects/from-template', {
      templateId: 'deep-research',
    })
    projectIds.push(project.id)

    const teams = await helper.apiGet(`/api/projects/${project.id}/teams`)
    expect(teams).toHaveLength(1)
    const team = teams[0]

    const { response, events } = await helper.createTeamChatViaApi(
      project.id,
      team.id,
      'What is the capital of Japan? Reply briefly.',
    )

    // Verify delegation happened
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

    // Verify the delegation actually produced the correct answer
    expect(response.toLowerCase()).toContain('tokyo')
  })

  test('template MCP servers: fetch connectivity succeeds', async ({ helper }) => {
    test.skip(!uvxAvailable, 'uvx is required for fetch MCP server')
    test.setTimeout(60_000)

    const project = await helper.apiPost('/api/projects/from-template', {
      templateId: 'writing-assistant',
    })
    projectIds.push(project.id)

    // Apply unrestricted permissions so connectivity test is allowed
    const config = await helper.apiPost(
      `/api/projects/${project.id}/permissions-config`,
      {
        title: 'Unrestricted for MCP test',
        mode: 'unrestricted',
        config: {
          allowWrite: [],
          denyRead: [],
          denyWrite: [],
          networkRestrictionsEnabled: false,
          allowedDomains: [],
          deniedDomains: [],
          deniedCommands: [],
          applyToMCP: false,
        },
      },
    )
    await helper.apiPatch(`/api/projects/${project.id}`, {
      permissionsConfigId: config.id,
    })

    const mcpServers = await helper.apiGet(`/api/projects/${project.id}/mcp-servers`)
    expect(mcpServers).toHaveLength(1)
    expect(mcpServers[0].name).toBe('fetch')

    const testResult = await helper.apiPostRaw(
      `/api/projects/${project.id}/mcp-servers/fetch/test`,
      {},
    )
    const body = await testResult.json()

    expect(body).toHaveProperty('ok')
    // With uvx available + unrestricted permissions, connectivity MUST succeed
    expect(body.ok).toBe(true)
  })

  test('smart-secretary template: Secretary agent handles email summarization', async ({ helper }) => {
    test.setTimeout(120_000)

    const project = await helper.apiPost('/api/projects/from-template', {
      templateId: 'smart-secretary',
    })
    projectIds.push(project.id)

    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    const secretary = agents.find((a: any) => a.name === 'Secretary')
    expect(secretary).toBeDefined()

    const conv = await helper.createConversationViaApi(project.id, secretary.id, 'Secretary Chat')
    const result = await helper.sendChatViaApi(
      project.id, secretary.id, conv.id,
      'Summarize this email briefly: "Hi team, the Q3 review meeting is moved to Friday 3pm in Room B. Please prepare department updates and budget reports."',
    )

    expect(result.response.length).toBeGreaterThan(20)
    expect(result.response.toLowerCase()).not.toMatch(/error|failed|unable/i)
    // Verify response captures key info from the email
    expect(result.response.toLowerCase()).toMatch(
      /friday|q3|review|meeting|room\s*b|budget|department|update|3\s*pm|reschedul/i,
    )
  })

  test('translator template: agent translates correctly', async ({ helper }) => {
    test.setTimeout(120_000)

    const project = await helper.apiPost('/api/projects/from-template', {
      templateId: 'translator',
    })
    projectIds.push(project.id)

    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    const translator = agents.find((a: any) => a.name === 'Translator')
    expect(translator).toBeDefined()

    const conv = await helper.createConversationViaApi(project.id, translator.id, 'Translator Chat')
    const result = await helper.sendChatViaApi(
      project.id, translator.id, conv.id,
      'Translate "hello" to Spanish. Reply with just the translation.',
    )

    expect(result.response.length).toBeGreaterThan(2)
    expect(result.response.toLowerCase()).not.toMatch(/error|failed|unable/i)
    expect(result.response.toLowerCase()).toContain('hola')
  })
})
