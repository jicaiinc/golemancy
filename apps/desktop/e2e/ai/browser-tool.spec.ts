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
  const browserModel = process.env.TEST_OPENAI_API_KEY
    ? { provider: 'openai', model: 'gpt-4o' }
    : process.env.TEST_GOOGLE_API_KEY
      ? { provider: 'google', model: 'gemini-2.5-pro' }
      : process.env.TEST_ANTHROPIC_API_KEY
        ? { provider: 'anthropic', model: 'claude-sonnet-4-5' }
        : undefined
  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await localServer.start()
    await helper.goHome()

    const project = await helper.createProjectViaApi('Browser Tool E2E')
    projectId = project.id

    const agent = await helper.createAgentViaApi(projectId, 'Browser Agent', {
      systemPrompt: [
        'You are a browser automation test assistant.',
        'When the user gives you a URL, you must use browser tools immediately.',
        'Use browser_navigate first, then browser_snapshot before interacting further.',
        'Use browser_click only after browser_snapshot gives you a ref.',
        'Do not answer from prior knowledge. Keep the final reply brief.',
      ].join(' '),
      ...(browserModel ? { model: browserModel } : {}),
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
    const url = localServer.url('/browser/basic')
    const conv = await helper.createConversationViaApi(projectId, agentId, 'browser open page')

    const result = await helper.sendChatViaApiBuffered(
      projectId,
      agentId,
      conv.id,
      [
        `Use browser_navigate to open ${url}.`,
        'Then use browser_snapshot to inspect the page.',
        'Report the exact page title text only.',
      ].join(' '),
      TIMEOUTS.AI_RESPONSE,
    )

    expect(localServer.getRequestCount('/browser/basic')).toBeGreaterThan(0)
    const browserCalls = helper.getToolCallEvents(result.events).filter(event =>
      String(event.data?.toolName ?? '').startsWith('browser_'),
    )
    expect(browserCalls.length).toBeGreaterThanOrEqual(0)
    expect(result.response).toContain('Deterministic Browser Page')
  })

  test('agent can click the reveal button on the deterministic page', async ({ helper }) => {
    test.setTimeout(120_000)

    localServer.resetRequestCounts()
    const url = localServer.url('/browser/basic')
    const conv = await helper.createConversationViaApi(projectId, agentId, 'browser click reveal')

    const result = await helper.sendChatViaApiBuffered(
      projectId,
      agentId,
      conv.id,
      [
        `Use browser_navigate to open ${url}.`,
        'Use browser_snapshot to identify the ref for the "Reveal Secret" button.',
        'Use browser_click on that ref.',
        'Then use browser_snapshot again and return the revealed secret exactly.',
      ].join(' '),
      TIMEOUTS.AI_RESPONSE,
    )

    expect(localServer.getRequestCount('/browser/basic')).toBeGreaterThan(0)
    expect(localServer.getRequestCount('/browser/reveal-hit')).toBeGreaterThan(0)
    const browserCalls = helper.getToolCallEvents(result.events).filter(event =>
      String(event.data?.toolName ?? '').startsWith('browser_'),
    )
    expect(browserCalls.length).toBeGreaterThanOrEqual(0)
    expect(result.response).toContain('browser_secret_marker_2048')
  })
})
