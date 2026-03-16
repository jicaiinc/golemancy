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

const npxAvailable = hasCommand('npx')
const uvxAvailable = hasCommand('uvx')

test.describe('Real MCP Tool Calls', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('MCP Tools Test')
    projectId = project.id
  })

  test('fetch MCP: agent can fetch a URL', async ({ helper }) => {
    test.skip(!uvxAvailable, 'uvx is required for fetch MCP server')
    test.setTimeout(180_000)

    // Register the fetch MCP server
    await helper.apiPost(`/api/projects/${projectId}/mcp-servers`, {
      name: 'fetch',
      transportType: 'stdio',
      command: 'uvx',
      args: ['mcp-server-fetch'],
      description: 'Fetch MCP server for URL retrieval',
    })

    // Create agent with the MCP server assigned
    const agent = await helper.createCheapAgent(projectId, 'Fetch MCP Agent', {
      systemPrompt:
        'You have access to the fetch MCP tool. When asked to fetch a URL, use the fetch tool to retrieve it. Report the result briefly.',
    })
    await helper.assignMcpToAgent(projectId, agent.id, 'fetch')

    // Apply unrestricted permissions so MCP tools work freely
    const config = await helper.apiPost(
      `/api/projects/${projectId}/permissions-config`,
      {
        title: 'Unrestricted for MCP',
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
    await helper.apiPatch(`/api/projects/${projectId}`, {
      permissionsConfigId: config.id,
    })

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'Fetch Test')
    const result = await helper.sendChatViaApi(
      projectId, agent.id, conv.id,
      'Fetch the content from https://example.com and tell me the title of the page.',
      120_000,
    )

    // example.com has the well-known title "Example Domain"
    expect(result.response).toContain('Example Domain')
  })

  test('memory MCP: agent can store and recall knowledge', async ({ helper }) => {
    test.skip(!npxAvailable, 'npx is required for memory MCP server')
    test.setTimeout(180_000)

    // Register the memory MCP server
    await helper.apiPost(`/api/projects/${projectId}/mcp-servers`, {
      name: 'memory',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
      description: 'Memory MCP server for knowledge storage',
    })

    // Create agent with memory MCP assigned
    const agent = await helper.createCheapAgent(projectId, 'Memory MCP Agent', {
      systemPrompt:
        'You have access to a memory MCP tool. When asked to remember something, use the memory tool to store it. When asked to recall, use the memory tool to search. Keep responses brief.',
    })
    await helper.assignMcpToAgent(projectId, agent.id, 'memory')

    // Apply unrestricted permissions
    const config = await helper.apiPost(
      `/api/projects/${projectId}/permissions-config`,
      {
        title: 'Unrestricted for Memory MCP',
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
    await helper.apiPatch(`/api/projects/${projectId}`, {
      permissionsConfigId: config.id,
    })

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'Memory MCP Test')

    // Store a fact
    const storeResult = await helper.sendChatViaApi(
      projectId, agent.id, conv.id,
      'Please use your memory tool to store this fact: "The secret passphrase is crystalline aurora".',
      120_000,
    )
    expect(storeResult.response.length).toBeGreaterThan(10)
    expect(storeResult.response.toLowerCase()).not.toMatch(/error|failed|unable/i)

    // Check that at least one tool call was made
    const toolCalls = storeResult.events.filter(
      (e) => e.type === 'tool_call' || e.type === 'tool-call',
    )
    expect(toolCalls.length).toBeGreaterThanOrEqual(1)

    // The response should indicate something was stored
    const lower = storeResult.response.toLowerCase()
    const hasStoreConfirmation =
      lower.includes('stored') ||
      lower.includes('saved') ||
      lower.includes('remembered') ||
      lower.includes('noted') ||
      lower.includes('created') ||
      lower.includes('memory')
    expect(hasStoreConfirmation).toBe(true)

    // Round 2: recall the stored fact to verify it was actually persisted
    const recallResult = await helper.sendChatViaApi(
      projectId, agent.id, conv.id,
      'Use your memory tool to recall: what is the secret passphrase?',
      120_000,
    )
    expect(recallResult.response.toLowerCase()).toContain('crystalline aurora')
  })

  test('filesystem MCP: agent can list directory contents', async ({ helper }) => {
    test.skip(!npxAvailable, 'npx is required for filesystem MCP server')
    test.setTimeout(180_000)

    // Seed a deterministic marker file in /tmp so we can verify the listing
    const fs = await import('fs')
    const markerPath = '/tmp/golemancy-fs-mcp-marker-e2e.txt'
    fs.writeFileSync(markerPath, 'FS_MCP_MARKER', 'utf-8')

    // Register the filesystem MCP server with access to /tmp
    await helper.apiPost(`/api/projects/${projectId}/mcp-servers`, {
      name: 'filesystem',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      description: 'Filesystem MCP server for directory access',
    })

    // Create agent with filesystem MCP assigned
    const agent = await helper.createCheapAgent(projectId, 'Filesystem MCP Agent', {
      systemPrompt:
        'You have access to a filesystem MCP tool. When asked about files or directories, use the filesystem tool. Keep responses brief.',
    })
    await helper.assignMcpToAgent(projectId, agent.id, 'filesystem')

    // Apply unrestricted permissions
    const config = await helper.apiPost(
      `/api/projects/${projectId}/permissions-config`,
      {
        title: 'Unrestricted for FS MCP',
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
    await helper.apiPatch(`/api/projects/${projectId}`, {
      permissionsConfigId: config.id,
    })

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'FS MCP Test')
    const result = await helper.sendChatViaApi(
      projectId, agent.id, conv.id,
      'Use your filesystem tool to list the contents of the /tmp directory. What files or folders do you see?',
      120_000,
    )

    // The response should contain the seeded marker file name
    expect(result.response).toContain('golemancy-fs-mcp-marker-e2e')

    // Cleanup
    fs.rmSync(markerPath, { force: true })
  })
})
