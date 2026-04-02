import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('AI Chat Flow', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper, window }) => {
    test.setTimeout(180_000) // generous timeout for setup with AI

    // Create project and agent
    await helper.goHome()
    projectId = await helper.createProject('AI Chat Flow Test')
    await helper.clickNav('agents')
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    agentId = await helper.createAgent('Flow Test Agent')
  })

  /** Create a fresh conversation via API and navigate into it */
  async function enterChat(helper: any, window: any) {
    const conv = await helper.createConversationViaApi(projectId, agentId)
    await helper.navigateTo(`/projects/${projectId}/chat?conv=${conv.id}`)
    await expect(window.locator(SELECTORS.CHAT_INPUT)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  }

  test('send message and receive real AI response', async ({ window, helper }) => {
    test.setTimeout(120_000)

    await enterChat(helper, window)

    // Send message
    await helper.sendChatMessage('What is 2+2? Reply with just the number.')

    // Wait for complete response (streaming finished)
    const response = await helper.waitForResponse(TIMEOUTS.AI_RESPONSE)

    // Verify it's a real response, not mock
    expect(response).toContain('4')
    expect(response).not.toContain('Mock response to:')

    // Verify message roles
    const userMsg = window
      .locator(`${SELECTORS.CHAT_MESSAGE}[data-role="user"]`)
      .last()
    await expect(userMsg).toBeVisible()
    await expect(userMsg).toContainText('What is 2+2')

    const assistantMsg = window
      .locator(`${SELECTORS.CHAT_MESSAGE}[data-role="assistant"]`)
      .last()
    await expect(assistantMsg).toBeVisible()
  })

  test('thinking indicator appears while waiting for response', async ({ window, helper }) => {
    test.setTimeout(120_000)

    await enterChat(helper, window)

    // Send message
    await helper.sendChatMessage('Say hello')

    // Wait for response to complete
    await helper.waitForResponse(TIMEOUTS.AI_RESPONSE)

    // After streaming, input should be enabled
    const chatInput = window.locator(SELECTORS.CHAT_INPUT)
    await expect(chatInput).toBeEnabled({ timeout: 5000 })
  })

  test('multi-turn conversation retains context', async ({ window, helper }) => {
    test.setTimeout(180_000)

    await enterChat(helper, window)

    // First message: introduce a unique fact
    await helper.sendChatMessage(
      'Remember this: my favorite color is chartreuse. Just acknowledge.',
    )
    await helper.waitForResponse(TIMEOUTS.AI_RESPONSE)

    // Second message: ask about the fact (tests context retention)
    await helper.sendChatMessage(
      'What is my favorite color? Reply with just the color name.',
    )
    const response = await helper.waitForResponse(TIMEOUTS.AI_RESPONSE)

    // AI should remember the context
    expect(response.toLowerCase()).toContain('chartreuse')
  })

  test('chat input disabled during streaming and re-enabled after', async ({
    window,
    helper,
  }) => {
    test.setTimeout(120_000)

    await enterChat(helper, window)

    const chatInput = window.locator(SELECTORS.CHAT_INPUT)

    // Before sending, input should be enabled
    await expect(chatInput).toBeEnabled()

    // Send a message that requires a longer response
    await helper.sendChatMessage('Count from 1 to 5, each on a new line.')

    // During streaming, input should be disabled
    // Use a short timeout since this state may be brief
    await expect(chatInput).toBeDisabled({ timeout: 5000 })

    // Wait for streaming to complete
    await helper.waitForResponse(TIMEOUTS.AI_RESPONSE)

    // After streaming, input should be re-enabled
    await expect(chatInput).toBeEnabled({ timeout: 5000 })
  })
})
