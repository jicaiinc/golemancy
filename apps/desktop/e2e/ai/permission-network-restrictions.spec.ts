import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'
import { LocalHttpTestServer } from '../fixtures/local-servers'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Permission Network Restrictions', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  const localServer = new LocalHttpTestServer()
  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await localServer.start()
    await helper.goHome()

    const project = await helper.createProjectViaApi('Permission Network Restrictions')
    projectId = project.id

    const permissions = await helper.createPermissionsConfigViaApi(projectId, {
      title: 'Sandbox Network Restricted',
      mode: 'sandbox',
      config: {
        allowWrite: ['{{workspaceDir}}'],
        denyRead: [],
        denyWrite: [],
        networkRestrictionsEnabled: true,
        allowedDomains: ['127.0.0.1'],
        deniedDomains: ['localhost'],
        deniedCommands: [],
        applyToMCP: false,
      },
    })
    await helper.applyPermissionsConfig(projectId, permissions.id)

    const agent = await helper.createToolAgent(projectId, 'Network Bash Agent', {
      systemPrompt: [
        'You are a test assistant.',
        'When asked to fetch a URL, you must use the bash tool and show the command result.',
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
  })

  test.afterAll(async () => {
    await localServer.stop()
  })

  test('sandbox allows requests to allowlisted domains', async ({ helper }) => {
    test.setTimeout(120_000)

    localServer.resetRequestCounts()
    const allowedUrl = localServer.url('/network/allowed', '127.0.0.1')
    const conv = await helper.createConversationViaApi(projectId, agentId, 'network allowed')
    await helper.sendChatViaApi(
      projectId,
      agentId,
      conv.id,
      `Use bash to run: python3 -c "import urllib.request; print(urllib.request.urlopen('${allowedUrl}').read().decode())"`,
      TIMEOUTS.AI_RESPONSE,
    )
    expect(localServer.getRequestCount('/network/allowed')).toBeGreaterThan(0)
  })

  test('sandbox blocks requests to denylisted domains', async ({ helper }) => {
    test.setTimeout(120_000)

    localServer.resetRequestCounts()
    const blockedUrl = localServer.url('/network/blocked', 'localhost')
    const conv = await helper.createConversationViaApi(projectId, agentId, 'network blocked')
    const result = await helper.sendChatViaApi(
      projectId,
      agentId,
      conv.id,
      `Use bash to run: python3 -c "import urllib.request; print(urllib.request.urlopen('${blockedUrl}').read().decode())"`,
      TIMEOUTS.AI_RESPONSE,
    )

    expect(localServer.getRequestCount('/network/blocked')).toBe(0)
    expect(result.response).not.toContain('BLOCKED_NETWORK_MARKER')
  })
})
