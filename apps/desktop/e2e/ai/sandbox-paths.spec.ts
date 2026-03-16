import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Sandbox Path Restrictions', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string
  let agentId: string
  let sandboxConfigId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('Sandbox Path Restrictions')
    projectId = project.id

    const agent = await helper.createToolAgent(projectId, 'Bash Path Agent', {
      systemPrompt: [
        'You are a test assistant with bash access.',
        'When asked to write a file, use bash to write it with echo or printf.',
        'When asked to read a file, use bash to cat it.',
        'Report the result briefly.',
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

    // Sandbox config: only allow writes to workspace/allowed, deny reads from workspace/secret
    const config = await helper.createPermissionsConfigViaApi(projectId, {
      title: 'Path Sandbox',
      mode: 'sandbox',
      config: {
        allowWrite: ['{{workspaceDir}}/allowed'],
        denyRead: ['{{workspaceDir}}/secret'],
        denyWrite: ['{{workspaceDir}}/protected'],
        networkRestrictionsEnabled: false,
        allowedDomains: [],
        deniedDomains: [],
        deniedCommands: [],
        applyToMCP: false,
      },
    })
    sandboxConfigId = config.id
    await helper.applyPermissionsConfig(projectId, sandboxConfigId)
  })

  test('sandbox allows writing inside allowWrite path', async ({ helper }) => {
    test.setTimeout(120_000)

    const marker = `SANDBOX_ALLOWED_${Date.now()}`
    const relativePath = 'allowed/write-test.txt'
    helper.removeWorkspaceFile(projectId, relativePath)

    const conv = await helper.createConversationViaApi(projectId, agentId, 'sandbox allow write')
    await helper.sendChatViaApi(
      projectId,
      agentId,
      conv.id,
      `Use bash to run: echo "${marker}" > allowed/write-test.txt && cat allowed/write-test.txt`,
      TIMEOUTS.AI_RESPONSE,
    )

    expect(helper.workspaceFileExists(projectId, relativePath)).toBe(true)
    expect(helper.readWorkspaceFile(projectId, relativePath).trim()).toBe(marker)
  })

  test('sandbox blocks writing outside allowWrite path', async ({ helper }) => {
    test.setTimeout(120_000)

    const marker = `SANDBOX_BLOCKED_${Date.now()}`
    const relativePath = 'outside-allowed/blocked-write.txt'
    helper.removeWorkspaceFile(projectId, relativePath)

    const conv = await helper.createConversationViaApi(projectId, agentId, 'sandbox blocked write')
    await helper.sendChatViaApi(
      projectId,
      agentId,
      conv.id,
      `Use bash to run: mkdir -p outside-allowed && echo "${marker}" > outside-allowed/blocked-write.txt`,
      TIMEOUTS.AI_RESPONSE,
    )

    expect(helper.workspaceFileExists(projectId, relativePath)).toBe(false)
  })

  test('sandbox blocks reading from denyRead paths', async ({ helper }) => {
    test.setTimeout(120_000)

    const secretContent = `TOP_SECRET_${Date.now()}_CLASSIFIED`
    helper.seedWorkspaceFile(projectId, 'secret/classified.txt', secretContent)

    const conv = await helper.createConversationViaApi(projectId, agentId, 'sandbox deny read')
    const { response } = await helper.sendChatViaApi(
      projectId,
      agentId,
      conv.id,
      'Use bash to run: cat secret/classified.txt',
      TIMEOUTS.AI_RESPONSE,
    )

    // The secret content should NOT appear in the response
    expect(response).not.toContain(secretContent)
    // The file should still exist (it wasn't deleted)
    expect(helper.workspaceFileExists(projectId, 'secret/classified.txt')).toBe(true)
  })

  test('sandbox blocks writing to denyWrite paths', async ({ helper }) => {
    test.setTimeout(120_000)

    const marker = `DENY_WRITE_${Date.now()}`
    const relativePath = 'protected/deny-write.txt'
    helper.removeWorkspaceFile(projectId, relativePath)

    const conv = await helper.createConversationViaApi(projectId, agentId, 'sandbox deny write')
    await helper.sendChatViaApi(
      projectId,
      agentId,
      conv.id,
      `Use bash to run: mkdir -p protected && echo "${marker}" > protected/deny-write.txt`,
      TIMEOUTS.AI_RESPONSE,
    )

    expect(helper.workspaceFileExists(projectId, relativePath)).toBe(false)
  })
})
