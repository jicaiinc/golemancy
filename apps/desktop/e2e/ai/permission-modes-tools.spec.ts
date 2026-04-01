import os from 'node:os'
import path from 'node:path'
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
  let agentId: string
  let restrictedConfigId: string
  let sandboxConfigId: string
  let unrestrictedConfigId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('Permission Modes Strong Assertions')
    projectId = project.id

    const agent = await helper.createToolAgent(projectId, 'Bash Agent', {
      systemPrompt: [
        'You are a test assistant.',
        'When a user asks you to run a shell command, you must use the bash tool.',
        'Keep the reply brief and include the command result.',
      ].join(' '),
      builtinTools: {
        bash: true,
        browser: false,
        task: false,
        memory: false,
        computer_use: false,
      },
    })
    agentId = agent.id

    restrictedConfigId = (
      await helper.createPermissionsConfigViaApi(projectId, {
        title: 'Restricted',
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
      })
    ).id

    sandboxConfigId = (
      await helper.createPermissionsConfigViaApi(projectId, {
        title: 'Sandbox',
        mode: 'sandbox',
        config: {
          allowWrite: ['{{workspaceDir}}'],
          denyRead: [],
          denyWrite: [],
          networkRestrictionsEnabled: false,
          allowedDomains: [],
          deniedDomains: [],
          deniedCommands: ['rm'],
          applyToMCP: false,
        },
      })
    ).id

    unrestrictedConfigId = (
      await helper.createPermissionsConfigViaApi(projectId, {
        title: 'Unrestricted',
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
      })
    ).id
  })

  test('restricted mode cannot affect host paths outside the virtual workspace', async ({ helper }) => {
    test.skip(process.platform === 'win32', 'Sandbox runtime isolation is not supported on Windows')
    test.setTimeout(120_000)

    const hostPath = path.join(os.tmpdir(), 'golemancy-restricted-host-write.txt')
    helper.removeFileIfExists(hostPath)
    await helper.applyPermissionsConfig(projectId, restrictedConfigId)

    const conv = await helper.createConversationViaApi(projectId, agentId, 'restricted host isolation')
    await helper.enterConversation(projectId, conv.id)
    await helper.sendAndWaitForResponse(
      `Use bash to write "RESTRICTED_BLOCKED" to the file ${hostPath}.`,
      TIMEOUTS.AI_RESPONSE,
    )
    expect(helper.readFileIfExists(hostPath)).toBeNull()
  })

  test('sandbox mode allows bash writes inside workspace', async ({ helper }) => {
    test.setTimeout(120_000)

    const relativePath = 'sandbox-allowed.txt'
    helper.removeWorkspaceFile(projectId, relativePath)
    await helper.applyPermissionsConfig(projectId, sandboxConfigId)

    const conv = await helper.createConversationViaApi(projectId, agentId, 'sandbox allowed write')
    await helper.enterConversation(projectId, conv.id)
    await helper.sendAndWaitForResponse(
      `Use bash to run: echo SANDBOX_ALLOWED > ${relativePath} && cat ${relativePath}`,
      TIMEOUTS.AI_RESPONSE,
    )
    expect(helper.workspaceFileExists(projectId, relativePath)).toBe(true)
    expect(helper.readWorkspaceFile(projectId, relativePath).trim()).toBe('SANDBOX_ALLOWED')
  })

  test('sandbox mode blocks denied commands and preserves existing file', async ({ helper }) => {
    test.skip(process.platform === 'win32', 'Sandbox runtime isolation is not supported on Windows')
    test.setTimeout(120_000)

    const relativePath = 'sandbox-rm-target.txt'
    helper.seedWorkspaceFile(projectId, relativePath, 'KEEP_ME')
    await helper.applyPermissionsConfig(projectId, sandboxConfigId)

    const conv = await helper.createConversationViaApi(projectId, agentId, 'sandbox denied command')
    await helper.enterConversation(projectId, conv.id)
    await helper.sendAndWaitForResponse(
      `Use bash to run: rm ${relativePath}`,
      TIMEOUTS.AI_RESPONSE,
    )

    expect(helper.workspaceFileExists(projectId, relativePath)).toBe(true)
    expect(helper.readWorkspaceFile(projectId, relativePath)).toBe('KEEP_ME')

  })

  test('unrestricted mode allows destructive file operations', async ({ helper }) => {
    test.setTimeout(120_000)

    const relativePath = 'unrestricted-delete.txt'
    helper.seedWorkspaceFile(projectId, relativePath, 'DELETE_ME')
    await helper.applyPermissionsConfig(projectId, unrestrictedConfigId)

    const conv = await helper.createConversationViaApi(projectId, agentId, 'unrestricted delete')
    await helper.enterConversation(projectId, conv.id)
    await helper.sendAndWaitForResponse(
      `Use bash to run: rm ${relativePath}`,
      TIMEOUTS.AI_RESPONSE,
    )
    expect(helper.workspaceFileExists(projectId, relativePath)).toBe(false)
  })

  test('mode switching changes effective behavior immediately', async ({ helper }) => {
    test.skip(process.platform === 'win32', 'Sandbox runtime isolation is not supported on Windows')
    test.setTimeout(180_000)

    const relativePath = 'mode-switch.txt'
    const restrictedHostPath = path.join(os.tmpdir(), 'golemancy-mode-switch-host.txt')
    helper.removeWorkspaceFile(projectId, relativePath)
    helper.removeFileIfExists(restrictedHostPath)

    await helper.applyPermissionsConfig(projectId, restrictedConfigId)
    let conv = await helper.createConversationViaApi(projectId, agentId, 'mode switch restricted')
    await helper.enterConversation(projectId, conv.id)
    await helper.sendAndWaitForResponse(
      `Use bash to write "ONE" to ${restrictedHostPath}.`,
      TIMEOUTS.AI_RESPONSE,
    )
    expect(helper.readFileIfExists(restrictedHostPath)).toBeNull()

    await helper.applyPermissionsConfig(projectId, sandboxConfigId)
    conv = await helper.createConversationViaApi(projectId, agentId, 'mode switch sandbox')
    await helper.enterConversation(projectId, conv.id)
    await helper.sendAndWaitForResponse(
      `Use bash to write "TWO" to ${relativePath}.`,
      TIMEOUTS.AI_RESPONSE,
    )
    expect(helper.workspaceFileExists(projectId, relativePath)).toBe(true)
    expect(helper.readWorkspaceFile(projectId, relativePath).trim()).toBe('TWO')

    helper.removeWorkspaceFile(projectId, relativePath)
    helper.removeFileIfExists(restrictedHostPath)
  })
})
