import os from 'node:os'
import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'
import { LocalHttpTestServer } from '../fixtures/local-servers'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

function resolveLocalIpv4Host(): string | null {
  const interfaces = os.networkInterfaces()
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address
      }
    }
  }
  return null
}

const testHost = resolveLocalIpv4Host()

test.describe('Permission Network Restrictions', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')
  test.skip(!testHost, 'a non-loopback IPv4 address is required for hermetic network allow/deny tests')

  const localServer = new LocalHttpTestServer()
  let projectId: string
  let agentId: string
  let allowConfigId: string
  let denyConfigId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await localServer.start('0.0.0.0')
    await helper.goHome()

    const project = await helper.createProjectViaApi('Permission Network Restrictions')
    projectId = project.id

    allowConfigId = (
      await helper.createPermissionsConfigViaApi(projectId, {
        title: 'Sandbox Network Allowlist',
        mode: 'sandbox',
        config: {
          allowWrite: ['{{workspaceDir}}'],
          denyRead: [],
          denyWrite: [],
          networkRestrictionsEnabled: true,
          allowedDomains: ['example.com'],
          deniedDomains: [],
          deniedCommands: [],
          applyToMCP: false,
        },
      })
    ).id

    denyConfigId = (
      await helper.createPermissionsConfigViaApi(projectId, {
        title: 'Sandbox Network Denylist',
        mode: 'sandbox',
        config: {
          allowWrite: ['{{workspaceDir}}'],
          denyRead: [],
          denyWrite: [],
          networkRestrictionsEnabled: true,
          allowedDomains: [testHost!],
          deniedDomains: [testHost!],
          deniedCommands: [],
          applyToMCP: false,
        },
      })
    ).id

    await helper.applyPermissionsConfig(projectId, allowConfigId)

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

    await helper.applyPermissionsConfig(projectId, allowConfigId)
    const conv = await helper.createConversationViaApi(projectId, agentId, 'network allowed')
    const result = await helper.sendChatViaApi(
      projectId,
      agentId,
      conv.id,
      'Use bash to run exactly this command and report the output: curl -kfsSL https://example.com',
      TIMEOUTS.AI_RESPONSE,
    )
    expect(result.response).toContain('Example Domain')
  })

  test('sandbox blocks requests to denylisted domains even if allowlisted', async ({ helper }) => {
    test.setTimeout(120_000)

    localServer.resetRequestCounts()
    await helper.applyPermissionsConfig(projectId, denyConfigId)
    const conv = await helper.createConversationViaApi(projectId, agentId, 'network blocked')
    const url = localServer.url('/network/blocked', testHost!)
    const result = await helper.sendChatViaApi(
      projectId,
      agentId,
      conv.id,
      `Use bash to run exactly this command and report the output: curl -fsSL ${url}`,
      TIMEOUTS.AI_RESPONSE,
    )

    expect(localServer.getRequestCount('/network/blocked')).toBe(0)
    expect(result.response).not.toContain('BLOCKED_NETWORK_MARKER')
  })
})
