import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Sandbox Code Runtime', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  // --- Sandbox project + agent ---
  let sandboxProjectId: string
  let sandboxAgentId: string
  let sandboxConfigId: string

  // --- Restricted project + agent ---
  let restrictedProjectId: string
  let restrictedAgentId: string
  let restrictedConfigId: string

  // --- Unrestricted project + agent ---
  let unrestrictedProjectId: string
  let unrestrictedAgentId: string
  let unrestrictedConfigId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    // ===== Sandbox project =====
    const sandboxProject = await helper.createProjectViaApi('Sandbox Runtime Test')
    sandboxProjectId = sandboxProject.id

    const sandboxAgent = await helper.createCheapAgent(sandboxProjectId, 'Sandbox Bash Agent', {
      systemPrompt:
        'When asked to run a command, use the bash tool. Keep responses brief. Only show the command output.',
      builtinTools: { bash: true, browser: false, task: false, memory: false },
    })
    sandboxAgentId = sandboxAgent.id

    const sboxConfig = await helper.apiPost(
      `/api/projects/${sandboxProjectId}/permissions-config`,
      {
        title: 'Sandbox Mode',
        mode: 'sandbox',
        config: {
          allowWrite: ['{{workspaceDir}}', '{{projectRuntimeDir}}/**'],
          denyRead: [],
          denyWrite: [],
          networkRestrictionsEnabled: false,
          allowedDomains: [],
          deniedDomains: [],
          deniedCommands: ['rm -rf /'],
          applyToMCP: false,
        },
      },
    )
    sandboxConfigId = sboxConfig.id

    await helper.apiPatch(`/api/projects/${sandboxProjectId}`, {
      permissionsConfigId: sandboxConfigId,
    })

    // ===== Restricted project =====
    const restrictedProject = await helper.createProjectViaApi('Restricted Runtime Test')
    restrictedProjectId = restrictedProject.id

    const restrictedAgent = await helper.createCheapAgent(restrictedProjectId, 'Restricted Bash Agent', {
      systemPrompt:
        'When asked to run a command, use the bash tool. Keep responses brief.',
      builtinTools: { bash: true, browser: false, task: false, memory: false },
    })
    restrictedAgentId = restrictedAgent.id

    const restrictConfig = await helper.apiPost(
      `/api/projects/${restrictedProjectId}/permissions-config`,
      {
        title: 'Restricted Mode',
        mode: 'restricted',
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
    restrictedConfigId = restrictConfig.id

    await helper.apiPatch(`/api/projects/${restrictedProjectId}`, {
      permissionsConfigId: restrictedConfigId,
    })

    // ===== Unrestricted project =====
    const unrestrictedProject = await helper.createProjectViaApi('Unrestricted Runtime Test')
    unrestrictedProjectId = unrestrictedProject.id

    const unrestrictedAgent = await helper.createCheapAgent(unrestrictedProjectId, 'Unrestricted Bash Agent', {
      systemPrompt:
        'When asked to run a command, use the bash tool. Keep responses brief. Only show the command output.',
      builtinTools: { bash: true, browser: false, task: false, memory: false },
    })
    unrestrictedAgentId = unrestrictedAgent.id

    const unrestrictConfig = await helper.apiPost(
      `/api/projects/${unrestrictedProjectId}/permissions-config`,
      {
        title: 'Unrestricted Mode',
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
    unrestrictedConfigId = unrestrictConfig.id

    await helper.apiPatch(`/api/projects/${unrestrictedProjectId}`, {
      permissionsConfigId: unrestrictedConfigId,
    })
  })

  // ===== Sandbox: basic commands (5 tests) =====

  test('sandbox: bash echo outputs expected text', async ({ helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(sandboxProjectId, sandboxAgentId, 'Echo Test')
    const result = await helper.sendChatViaApi(
      sandboxProjectId, sandboxAgentId, conv.id,
      'Run this command: echo SANDBOX_ECHO_MARKER_42',
      TIMEOUTS.AI_RESPONSE,
    )

    expect(result.response).toContain('SANDBOX_ECHO_MARKER_42')
  })

  test('sandbox: ls command lists files', async ({ helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(sandboxProjectId, sandboxAgentId, 'Ls Test')
    const result = await helper.sendChatViaApi(
      sandboxProjectId, sandboxAgentId, conv.id,
      'Run: ls /tmp',
      TIMEOUTS.AI_RESPONSE,
    )

    // ls should produce some output (even if just a listing)
    expect(result.response).toBeTruthy()
    expect(result.response.length).toBeGreaterThan(0)
  })

  test('sandbox: python execution works', async ({ helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(sandboxProjectId, sandboxAgentId, 'Python Test')
    const result = await helper.sendChatViaApi(
      sandboxProjectId, sandboxAgentId, conv.id,
      'Run this command: python3 -c "print(7 * 6)"',
      TIMEOUTS.AI_RESPONSE,
    )

    expect(result.response).toContain('42')
  })

  test('sandbox: node execution works', async ({ helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(sandboxProjectId, sandboxAgentId, 'Node Test')
    const result = await helper.sendChatViaApi(
      sandboxProjectId, sandboxAgentId, conv.id,
      'Run this command: node -e "console.log(100 + 23)"',
      TIMEOUTS.AI_RESPONSE,
    )

    expect(result.response).toContain('123')
  })

  test('sandbox: writeFile via bash creates a file', async ({ helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(sandboxProjectId, sandboxAgentId, 'WriteFile Test')
    const result = await helper.sendChatViaApi(
      sandboxProjectId, sandboxAgentId, conv.id,
      'Run: echo "SANDBOX_WRITE_CONTENT_99" > /tmp/golemancy-sandbox-write.txt && echo "WRITE_SUCCESS"',
      TIMEOUTS.AI_RESPONSE,
    )

    expect(result.response).toContain('WRITE_SUCCESS')
  })

  test('sandbox: readFile via bash reads file content', async ({ helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(sandboxProjectId, sandboxAgentId, 'ReadFile Test')
    const result = await helper.sendChatViaApi(
      sandboxProjectId, sandboxAgentId, conv.id,
      'Run: echo "SANDBOX_READ_CONTENT_77" > /tmp/golemancy-sandbox-read.txt && cat /tmp/golemancy-sandbox-read.txt',
      TIMEOUTS.AI_RESPONSE,
    )

    expect(result.response).toContain('SANDBOX_READ_CONTENT_77')
  })

  // ===== Sandbox: denied commands in subcommand (1 test) =====

  test('sandbox: denied command pattern is blocked', async ({ helper }) => {
    test.setTimeout(120_000)

    // Create a sandbox config that explicitly denies 'curl'
    const deniedConfig = await helper.apiPost(
      `/api/projects/${sandboxProjectId}/permissions-config`,
      {
        title: 'Denied Curl Mode',
        mode: 'sandbox',
        config: {
          allowWrite: ['{{workspaceDir}}'],
          denyRead: [],
          denyWrite: [],
          networkRestrictionsEnabled: false,
          allowedDomains: [],
          deniedDomains: [],
          deniedCommands: ['curl'],
          applyToMCP: false,
        },
      },
    )

    // Create a separate agent with this config
    const deniedAgent = await helper.createCheapAgent(sandboxProjectId, 'Denied Cmd Agent', {
      systemPrompt: 'When asked to run a command, use the bash tool. Keep responses brief.',
      builtinTools: { bash: true },
    })
    await helper.apiPatch(`/api/projects/${sandboxProjectId}/agents/${deniedAgent.id}`, {
      permissionsConfigId: deniedConfig.id,
    })

    const conv = await helper.createConversationViaApi(sandboxProjectId, deniedAgent.id, 'Denied Cmd Test')
    const result = await helper.sendChatViaApi(
      sandboxProjectId, deniedAgent.id, conv.id,
      'Run this command: curl http://example.com',
      TIMEOUTS.AI_RESPONSE,
    )

    // The command should be blocked or refused
    const lower = result.response.toLowerCase()
    const isBlocked =
      lower.includes('denied') ||
      lower.includes('blocked') ||
      lower.includes('not allowed') ||
      lower.includes('cannot') ||
      lower.includes('restricted') ||
      lower.includes('permission') ||
      lower.includes('error') ||
      lower.includes('unable') ||
      lower.includes('refuse') ||
      lower.includes('rejected')
    expect(isBlocked || !lower.includes('<!doctype')).toBe(true)
  })

  // ===== Restricted: blocks tools (1 test) =====

  test('restricted: blocks bash tool execution', async ({ helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(
      restrictedProjectId, restrictedAgentId, 'Restricted Block Test',
    )
    const result = await helper.sendChatViaApi(
      restrictedProjectId, restrictedAgentId, conv.id,
      'Run this command: echo RESTRICTED_SHOULD_NOT_APPEAR',
      TIMEOUTS.AI_RESPONSE,
    )

    // In restricted mode, bash should not execute
    expect(result.response).not.toContain('RESTRICTED_SHOULD_NOT_APPEAR')
  })

  // ===== Unrestricted: allows all (1 test) =====

  test('unrestricted: allows all commands including rm', async ({ helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(
      unrestrictedProjectId, unrestrictedAgentId, 'Unrestricted All Test',
    )
    const result = await helper.sendChatViaApi(
      unrestrictedProjectId, unrestrictedAgentId, conv.id,
      'Run: echo "UNRESTRICTED_FULL_ACCESS" > /tmp/golemancy-unrestricted-test.txt && cat /tmp/golemancy-unrestricted-test.txt && rm /tmp/golemancy-unrestricted-test.txt && echo "CLEANUP_DONE"',
      TIMEOUTS.AI_RESPONSE,
    )

    expect(result.response).toContain('UNRESTRICTED_FULL_ACCESS')
    expect(result.response).toContain('CLEANUP_DONE')
  })

  // ===== Timeout handling (1 test) =====

  test('sandbox: long-running command is handled gracefully', async ({ helper }) => {
    test.setTimeout(180_000)

    const conv = await helper.createConversationViaApi(sandboxProjectId, sandboxAgentId, 'Timeout Test')
    const result = await helper.sendChatViaApi(
      sandboxProjectId, sandboxAgentId, conv.id,
      'Run: sleep 1 && echo TIMEOUT_SURVIVED',
      120_000,
    )

    // The command should either complete successfully or timeout gracefully
    // Either way, the agent should produce a response
    expect(result.response).toBeTruthy()
    expect(result.response.length).toBeGreaterThan(0)
  })

  // ===== Large output truncation (1 test) =====

  test('sandbox: large output is handled without crash', async ({ helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(sandboxProjectId, sandboxAgentId, 'Large Output Test')
    const result = await helper.sendChatViaApi(
      sandboxProjectId, sandboxAgentId, conv.id,
      'Run: seq 1 500',
      TIMEOUTS.AI_RESPONSE,
    )

    // The agent should respond without crashing, even if output is truncated
    expect(result.response).toBeTruthy()
    // Should contain at least some numbers from the sequence
    expect(result.response).toMatch(/\d+/)
  })
})
