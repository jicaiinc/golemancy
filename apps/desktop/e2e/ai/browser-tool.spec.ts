import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'
import { LocalHttpTestServer } from '../fixtures/local-servers'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Browser Tool', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  const localServer = new LocalHttpTestServer()
  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await localServer.start()
    await helper.goHome()

    const project = await helper.createProjectViaApi('Browser Tool E2E')
    projectId = project.id

    const agent = await helper.createToolAgent(projectId, 'Browser Agent', {
      systemPrompt: [
        'You are a browser automation test assistant.',
        'When the user asks about a web page, you must use the browser tool.',
        'Keep the final reply brief.',
      ].join(' '),
      builtinTools: {
        bash: false,
        browser: true,
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

  test('agent can open a deterministic local page with the browser tool', async ({ helper }) => {
    test.setTimeout(120_000)

    localServer.resetRequestCounts()
    const url = localServer.url('/browser/basic', '127.0.0.1')
    const conv = await helper.createConversationViaApi(projectId, agentId, 'browser open page')

    await helper.sendChatViaApi(
      projectId,
      agentId,
      conv.id,
      `Use the browser tool to open ${url} and inspect the page.`,
      TIMEOUTS.AI_RESPONSE,
    )

    expect(localServer.getRequestCount('/browser/basic')).toBeGreaterThan(0)
  })

  test('agent can click the reveal button on the deterministic page', async ({ helper }) => {
    test.setTimeout(120_000)

    localServer.resetRequestCounts()
    const url = localServer.url('/browser/basic', '127.0.0.1')
    const conv = await helper.createConversationViaApi(projectId, agentId, 'browser click reveal')

    await helper.sendChatViaApi(
      projectId,
      agentId,
      conv.id,
      [
        `Use the browser tool to open ${url}.`,
        'Click the "Reveal Secret" button on the page.',
        'After clicking, confirm the revealed secret briefly.',
      ].join(' '),
      TIMEOUTS.AI_RESPONSE,
    )

    expect(localServer.getRequestCount('/browser/basic')).toBeGreaterThan(0)
    expect(localServer.getRequestCount('/browser/reveal-hit')).toBeGreaterThan(0)
  })
})
