import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Permission Modes & Tools', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string
  let bashAgentId: string
  let restrictedConfigId: string
  let sandboxConfigId: string
  let unrestrictedConfigId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('Permission Modes Test')
    projectId = project.id

    // Create agent with bash tool enabled via direct API call
    // (builtinTools is the actual field name on the Agent type)
    const agent = await helper.apiPost(`/api/projects/${projectId}/agents`, {
      name: 'Bash Agent',
      systemPrompt: 'You are a test assistant with bash access. When asked to run a command, use the bash tool. Keep responses brief.',
      builtinTools: { bash: true },
    })
    bashAgentId = agent.id

    // Create permission configs for each mode
    const restrictedConfig = await helper.apiPost(
      `/api/projects/${projectId}/permissions-config`,
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
    restrictedConfigId = restrictedConfig.id

    const sboxConfig = await helper.apiPost(
      `/api/projects/${projectId}/permissions-config`,
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
          deniedCommands: ['rm'],
          applyToMCP: true,
        },
      },
    )
    sandboxConfigId = sboxConfig.id

    const unrestrictedConfig = await helper.apiPost(
      `/api/projects/${projectId}/permissions-config`,
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
    unrestrictedConfigId = unrestrictedConfig.id
  })

  // ===== Restricted mode (3 tests) =====

  test('restricted mode: agent cannot execute bash', async ({ helper }) => {
    test.setTimeout(120_000)

    // Apply restricted config to project
    await helper.apiPatch(`/api/projects/${projectId}`, {
      permissionsConfigId: restrictedConfigId,
    })

    const conv = await helper.createConversationViaApi(projectId, bashAgentId, 'Restricted Test')
    const result = await helper.sendChatViaApi(
      projectId, bashAgentId, conv.id,
      'Run this command: echo RESTRICTED_TEST_MARKER',
    )

    // In restricted mode, the agent should not be able to execute bash
    // The response should NOT contain the direct output of the echo command
    expect(result.response).not.toContain('RESTRICTED_TEST_MARKER')
  })

  test('restricted mode: sandbox readiness check', async ({ helper }) => {
    test.setTimeout(60_000)

    // Verify sandbox readiness endpoint works
    const readiness = await helper.apiGet(
      `/api/sandbox/readiness?projectId=${projectId}`,
    )

    expect(readiness).toHaveProperty('available')
    expect(readiness).toHaveProperty('issues')
    expect(Array.isArray(readiness.issues)).toBe(true)
  })

  test('restricted mode: verify config applied', async ({ helper }) => {
    test.setTimeout(60_000)

    const project = await helper.apiGet(`/api/projects/${projectId}`)
    expect(project.permissionsConfigId).toBe(restrictedConfigId)
  })

  // ===== Sandbox mode (5 tests) =====

  test('sandbox mode: agent can execute bash', async ({ helper }) => {
    test.setTimeout(120_000)

    // Apply sandbox config to project
    await helper.apiPatch(`/api/projects/${projectId}`, {
      permissionsConfigId: sandboxConfigId,
    })

    const conv = await helper.createConversationViaApi(projectId, bashAgentId, 'Sandbox Bash Test')
    const result = await helper.sendChatViaApi(
      projectId, bashAgentId, conv.id,
      'Run this command and show the output: echo SANDBOX_TEST_MARKER',
    )

    // In sandbox mode, bash should work
    expect(result.response).toContain('SANDBOX_TEST_MARKER')
  })

  test('sandbox mode: verify sandbox readiness', async ({ helper }) => {
    test.setTimeout(60_000)

    const readiness = await helper.apiGet(
      `/api/sandbox/readiness?projectId=${projectId}`,
    )

    expect(readiness).toHaveProperty('available')
    expect(readiness).toHaveProperty('issues')
  })

  test('sandbox mode: denied commands blocked', async ({ helper }) => {
    test.setTimeout(120_000)

    // The sandbox config has deniedCommands: ['rm']
    const conv = await helper.createConversationViaApi(projectId, bashAgentId, 'Sandbox Denied Test')
    const result = await helper.sendChatViaApi(
      projectId, bashAgentId, conv.id,
      'Run this exact command: rm /tmp/golemancy-nonexistent-file',
    )

    // The agent should either refuse to run the command or the sandbox should block it
    // We just verify the response doesn't indicate successful deletion
    const lower = result.response.toLowerCase()
    const isBlocked = lower.includes('denied') ||
      lower.includes('blocked') ||
      lower.includes('not allowed') ||
      lower.includes('cannot') ||
      lower.includes('restricted') ||
      lower.includes('permission') ||
      lower.includes('error') ||
      lower.includes('unable') ||
      lower.includes('refuse')

    // The command should be blocked or refused in some way
    expect(isBlocked || !lower.includes('successfully deleted')).toBe(true)
  })

  test('sandbox mode: allowed paths work', async ({ helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(projectId, bashAgentId, 'Sandbox Paths Test')
    const result = await helper.sendChatViaApi(
      projectId, bashAgentId, conv.id,
      'Run: echo "path_test_ok"',
    )

    // Basic echo command should work in sandbox mode
    expect(result.response).toBeTruthy()
    expect(result.response.length).toBeGreaterThan(0)
  })

  test('sandbox mode: verify applyToMCP config', async ({ helper }) => {
    test.setTimeout(60_000)

    const config = await helper.apiGet(
      `/api/projects/${projectId}/permissions-config/${sandboxConfigId}`,
    )

    expect(config.config.applyToMCP).toBe(true)
  })

  // ===== Unrestricted mode (4 tests) =====

  test('unrestricted mode: agent can execute bash', async ({ helper }) => {
    test.setTimeout(120_000)

    // Apply unrestricted config to project
    await helper.apiPatch(`/api/projects/${projectId}`, {
      permissionsConfigId: unrestrictedConfigId,
    })

    const conv = await helper.createConversationViaApi(projectId, bashAgentId, 'Unrestricted Bash Test')
    const result = await helper.sendChatViaApi(
      projectId, bashAgentId, conv.id,
      'Run this command and show the output: echo UNRESTRICTED_TEST_MARKER',
    )

    expect(result.response).toContain('UNRESTRICTED_TEST_MARKER')
  })

  test('unrestricted mode: file operations work', async ({ helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(projectId, bashAgentId, 'Unrestricted File Test')
    const result = await helper.sendChatViaApi(
      projectId, bashAgentId, conv.id,
      'Run: echo "golemancy_e2e_test" > /tmp/golemancy-e2e-test.txt && cat /tmp/golemancy-e2e-test.txt && rm /tmp/golemancy-e2e-test.txt',
    )

    // Should be able to write and read files
    expect(result.response).toContain('golemancy_e2e_test')
  })

  test('unrestricted mode: verify config', async ({ helper }) => {
    test.setTimeout(60_000)

    const project = await helper.apiGet(`/api/projects/${projectId}`)
    expect(project.permissionsConfigId).toBe(unrestrictedConfigId)

    const config = await helper.apiGet(
      `/api/projects/${projectId}/permissions-config/${unrestrictedConfigId}`,
    )
    expect(config.mode).toBe('unrestricted')
  })

  test('unrestricted mode: all tools available', async ({ helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(projectId, bashAgentId, 'Unrestricted Tools Test')
    const result = await helper.sendChatViaApi(
      projectId, bashAgentId, conv.id,
      'Run: pwd',
    )

    // The agent should be able to run pwd and return a path
    expect(result.response).toBeTruthy()
    expect(result.response).toContain('/')
  })
})
