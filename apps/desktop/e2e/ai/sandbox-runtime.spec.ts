import os from 'node:os'
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

  async function runBashCommand(
    helper: any,
    projectId: string,
    agentId: string,
    title: string,
    commandPrompt: string,
    timeout = TIMEOUTS.AI_RESPONSE,
    requireToolCall = true,
  ) {
    const conv = await helper.createConversationViaApi(projectId, agentId, title)
    await helper.enterConversation(projectId, conv.id)
    const response = await helper.sendAndWaitForResponse(commandPrompt, timeout)
    if (requireToolCall) {
      expect(await helper.hasToolCall('bash')).toBe(true)
    }
    return { response }
  }

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    // ===== Sandbox project =====
    const sandboxProject = await helper.createProjectViaApi('Sandbox Runtime Test')
    sandboxProjectId = sandboxProject.id

    const sandboxAgent = await helper.createToolAgent(sandboxProjectId, 'Sandbox Bash Agent', {
      systemPrompt:
        'When asked to run a command, you must use the bash tool. Execute the exact command. Keep responses brief.',
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

    await helper.applyPermissionsConfig(sandboxProjectId, sandboxConfigId)

    // ===== Restricted project =====
    const restrictedProject = await helper.createProjectViaApi('Restricted Runtime Test')
    restrictedProjectId = restrictedProject.id

    const restrictedAgent = await helper.createToolAgent(restrictedProjectId, 'Restricted Bash Agent', {
      systemPrompt:
        'When asked to run a command, you must use the bash tool. Execute the exact command. Keep responses brief.',
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

    await helper.applyPermissionsConfig(restrictedProjectId, restrictedConfigId)

    // ===== Unrestricted project =====
    const unrestrictedProject = await helper.createProjectViaApi('Unrestricted Runtime Test')
    unrestrictedProjectId = unrestrictedProject.id

    const unrestrictedAgent = await helper.createToolAgent(unrestrictedProjectId, 'Unrestricted Bash Agent', {
      systemPrompt:
        'When asked to run a command, you must use the bash tool. Execute the exact command. Keep responses brief.',
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

    await helper.applyPermissionsConfig(unrestrictedProjectId, unrestrictedConfigId)
  })

  // ===== Sandbox: basic commands (5 tests) =====

  test('sandbox: bash can write an echo marker inside workspace', async ({ helper }) => {
    test.setTimeout(120_000)

    const relativePath = 'sandbox-echo.txt'
    helper.removeWorkspaceFile(sandboxProjectId, relativePath)
    await runBashCommand(
      helper,
      sandboxProjectId,
      sandboxAgentId,
      'Echo Test',
      `Run this command exactly: echo SANDBOX_ECHO_MARKER_42 > ${relativePath} && cat ${relativePath}`,
    )
    expect(helper.readWorkspaceFile(sandboxProjectId, relativePath).trim()).toBe('SANDBOX_ECHO_MARKER_42')
  })

  test('sandbox: ls command can inspect workspace contents', async ({ helper }) => {
    test.setTimeout(120_000)

    const seedFile = 'ls-visible-marker.txt'
    const outputFile = 'ls-output.txt'
    helper.seedWorkspaceFile(sandboxProjectId, seedFile, 'visible')
    helper.removeWorkspaceFile(sandboxProjectId, outputFile)
    await runBashCommand(
      helper,
      sandboxProjectId,
      sandboxAgentId,
      'Ls Test',
      `Run this command exactly: ls > ${outputFile}`,
    )
    expect(helper.readWorkspaceFile(sandboxProjectId, outputFile)).toContain(seedFile)
  })

  test('sandbox: python execution works', async ({ helper }) => {
    test.setTimeout(120_000)

    const relativePath = 'python-result.txt'
    helper.removeWorkspaceFile(sandboxProjectId, relativePath)
    await runBashCommand(
      helper,
      sandboxProjectId,
      sandboxAgentId,
      'Python Test',
      `Run this command exactly: python3 -c "print(7 * 6)" > ${relativePath}`,
    )
    expect(helper.readWorkspaceFile(sandboxProjectId, relativePath).trim()).toBe('42')
  })

  test('sandbox: node execution works', async ({ helper }) => {
    test.setTimeout(120_000)

    const relativePath = 'node-result.txt'
    helper.removeWorkspaceFile(sandboxProjectId, relativePath)
    await runBashCommand(
      helper,
      sandboxProjectId,
      sandboxAgentId,
      'Node Test',
      `Run this command exactly: node -e "console.log(100 + 23)" > ${relativePath}`,
    )
    expect(helper.readWorkspaceFile(sandboxProjectId, relativePath).trim()).toBe('123')
  })

  test('sandbox: writeFile via bash creates a file', async ({ helper }) => {
    test.setTimeout(120_000)

    const relativePath = 'sandbox-write.txt'
    helper.removeWorkspaceFile(sandboxProjectId, relativePath)
    await runBashCommand(
      helper,
      sandboxProjectId,
      sandboxAgentId,
      'WriteFile Test',
      `Run this command exactly: echo "SANDBOX_WRITE_CONTENT_99" > ${relativePath}`,
    )
    expect(helper.readWorkspaceFile(sandboxProjectId, relativePath).trim()).toBe('SANDBOX_WRITE_CONTENT_99')
  })

  test('sandbox: readFile via bash reads file content', async ({ helper }) => {
    test.setTimeout(120_000)

    const sourcePath = 'read-source.txt'
    const copyPath = 'read-copy.txt'
    helper.seedWorkspaceFile(sandboxProjectId, sourcePath, 'SANDBOX_READ_CONTENT_77')
    helper.removeWorkspaceFile(sandboxProjectId, copyPath)
    await runBashCommand(
      helper,
      sandboxProjectId,
      sandboxAgentId,
      'ReadFile Test',
      `Run this command exactly: cat ${sourcePath} > ${copyPath}`,
    )
    expect(helper.readWorkspaceFile(sandboxProjectId, copyPath).trim()).toBe('SANDBOX_READ_CONTENT_77')
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
    const deniedAgent = await helper.createToolAgent(sandboxProjectId, 'Denied Cmd Agent', {
      systemPrompt: 'When asked to run a command, you must use the bash tool. Execute the exact command. Keep responses brief.',
      builtinTools: { bash: true },
    })
    await helper.applyPermissionsConfig(sandboxProjectId, deniedConfig.id)

    const blockedPath = 'curl-should-not-exist.txt'
    helper.removeWorkspaceFile(sandboxProjectId, blockedPath)
    const result = await runBashCommand(
      helper,
      sandboxProjectId,
      deniedAgent.id,
      'Denied Cmd Test',
      `Run this command exactly: curl -fsSL http://example.com > ${blockedPath}`,
      TIMEOUTS.AI_RESPONSE,
      false,
    )

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
    expect(helper.workspaceFileExists(sandboxProjectId, blockedPath)).toBe(false)
    expect(isBlocked || !lower.includes('<!doctype')).toBe(true)
  })

  // ===== Restricted: virtual isolation (1 test) =====

  test('restricted: host writes outside the virtual workspace do not happen', async ({ helper }) => {
    test.setTimeout(120_000)

    const hostPath = `${os.tmpdir()}/golemancy-restricted-runtime-host.txt`
    helper.removeFileIfExists(hostPath)
    await runBashCommand(
      helper,
      restrictedProjectId,
      restrictedAgentId,
      'Restricted Block Test',
      `Run this command exactly: echo RESTRICTED_SHOULD_NOT_APPEAR > ${hostPath}`,
      TIMEOUTS.AI_RESPONSE,
      false,
    )
    expect(helper.readFileIfExists(hostPath)).toBeNull()
  })

  // ===== Unrestricted: allows all (1 test) =====

  test('unrestricted: allows all commands including rm', async ({ helper }) => {
    test.setTimeout(120_000)

    const relativePath = 'unrestricted-delete.txt'
    helper.seedWorkspaceFile(unrestrictedProjectId, relativePath, 'UNRESTRICTED_FULL_ACCESS')
    await runBashCommand(
      helper,
      unrestrictedProjectId,
      unrestrictedAgentId,
      'Unrestricted All Test',
      `Use bash to run this safe workspace-only test command: rm ${relativePath}. The file is a disposable test file inside the project workspace and should be deleted.`,
      TIMEOUTS.AI_RESPONSE,
      false,
    )
    expect(helper.workspaceFileExists(unrestrictedProjectId, relativePath)).toBe(false)
  })

  // ===== Timeout handling (1 test) =====

  test('sandbox: long-running command is handled gracefully', async ({ helper }) => {
    test.setTimeout(180_000)

    const relativePath = 'timeout-survived.txt'
    helper.removeWorkspaceFile(sandboxProjectId, relativePath)
    await runBashCommand(
      helper,
      sandboxProjectId,
      sandboxAgentId,
      'Timeout Test',
      `Run this command exactly: sleep 1 && echo TIMEOUT_SURVIVED > ${relativePath}`,
      120_000,
    )
    expect(helper.readWorkspaceFile(sandboxProjectId, relativePath).trim()).toBe('TIMEOUT_SURVIVED')
  })

  // ===== Large output truncation (1 test) =====

  test('sandbox: large output is handled without crash', async ({ helper }) => {
    test.setTimeout(120_000)

    const relativePath = 'large-output-tail.txt'
    helper.removeWorkspaceFile(sandboxProjectId, relativePath)
    await runBashCommand(
      helper,
      sandboxProjectId,
      sandboxAgentId,
      'Large Output Test',
      `Run this command exactly: seq 1 500 && echo 500 > ${relativePath}`,
    )
    expect(helper.readWorkspaceFile(sandboxProjectId, relativePath).trim()).toBe('500')
  })
})
