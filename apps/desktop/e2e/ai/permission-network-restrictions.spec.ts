import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Permission Network Restrictions', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string
  let agentId: string
  let allowConfigId: string
  let denyConfigId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
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
          allowedDomains: ['example.com'],
          deniedDomains: ['example.com'],
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

    await helper.applyPermissionsConfig(projectId, denyConfigId)
    const conv = await helper.createConversationViaApi(projectId, agentId, 'network blocked')
    const result = await helper.sendChatViaApi(
      projectId,
      agentId,
      conv.id,
      'Use bash to run exactly this command and report the output: curl -kfsSL https://example.com',
      TIMEOUTS.AI_RESPONSE,
    )

    expect(result.response).not.toContain('Example Domain')
  })
})
