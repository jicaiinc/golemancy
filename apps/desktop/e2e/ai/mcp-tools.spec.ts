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

/** Count tool_call events in SSE event stream */
function countToolCalls(events: Array<{ type: string }>): number {
  return events.filter(e => e.type === 'tool_call' || e.type === 'tool-call').length
}

test.describe('Real MCP Tool Calls', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('MCP Tools Test')
    projectId = project.id
  })

  test('fetch MCP: agent invokes fetch tool and returns page content', async ({ helper }) => {
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

    const agent = await helper.createCheapAgent(projectId, 'Fetch MCP Agent', {
      systemPrompt:
        'You have access to the fetch MCP tool. When asked to fetch a URL, use the fetch tool to retrieve it. Report the result briefly.',
    })
    await helper.assignMcpToAgent(projectId, agent.id, 'fetch')

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

    // Verify the fetch tool was actually invoked (not just LLM training knowledge)
    expect(countToolCalls(result.events)).toBeGreaterThanOrEqual(1)
    // Also verify content — example.com has "Example Domain"
    expect(result.response).toContain('Example Domain')
  })

  test('memory MCP: stored knowledge is recallable in a NEW conversation', async ({ helper }) => {
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

    const agent = await helper.createCheapAgent(projectId, 'Memory MCP Agent', {
      systemPrompt:
        'You have access to a memory MCP tool. When asked to remember something, use the memory tool to store it. When asked to recall, use the memory tool to search. Keep responses brief.',
    })
    await helper.assignMcpToAgent(projectId, agent.id, 'memory')

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

    // === STORE phase: conversation 1 ===
    const storeConv = await helper.createConversationViaApi(projectId, agent.id, 'Memory Store')
    const storeResult = await helper.sendChatViaApi(
      projectId, agent.id, storeConv.id,
      'Please use your memory tool to store this fact: "The secret passphrase is crystalline aurora".',
      120_000,
    )

    // Verify the memory tool was invoked for storage
    expect(countToolCalls(storeResult.events)).toBeGreaterThanOrEqual(1)
    expect(storeResult.response.length).toBeGreaterThan(10)
    expect(storeResult.response.toLowerCase()).not.toMatch(/error|failed|unable/i)

    // === RECALL phase: conversation 2 (NEW conversation — passphrase NOT in context) ===
    const recallConv = await helper.createConversationViaApi(projectId, agent.id, 'Memory Recall')
    const recallResult = await helper.sendChatViaApi(
      projectId, agent.id, recallConv.id,
      'Use your memory tool to recall: what is the secret passphrase?',
      120_000,
    )

    // Verify the memory tool was invoked for recall (not just context lookup)
    expect(countToolCalls(recallResult.events)).toBeGreaterThanOrEqual(1)
    // The passphrase should be retrieved from MCP memory, not conversation context
    expect(recallResult.response.toLowerCase()).toContain('crystalline aurora')
  })

  test('filesystem MCP: agent invokes fs tool and finds seeded marker file', async ({ helper }) => {
    test.skip(!npxAvailable, 'npx is required for filesystem MCP server')
    test.setTimeout(180_000)

    // Seed a unique marker file in /tmp
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

    const agent = await helper.createCheapAgent(projectId, 'Filesystem MCP Agent', {
      systemPrompt:
        'You have access to a filesystem MCP tool. When asked about files or directories, use the filesystem tool. Keep responses brief.',
    })
    await helper.assignMcpToAgent(projectId, agent.id, 'filesystem')

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

    // Verify the filesystem tool was invoked
    expect(countToolCalls(result.events)).toBeGreaterThanOrEqual(1)
    // Verify the unique marker file appears in the response
    expect(result.response).toContain('golemancy-fs-mcp-marker-e2e')

    // Cleanup
    fs.rmSync(markerPath, { force: true })
  })
})
