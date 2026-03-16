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

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)

    await helper.goHome()

    // Create project and agent via API for reliability
    const project = await helper.createProjectViaApi('AI Chat Flow Test')
    projectId = project.id

    const agent = await helper.createAgentViaApi(projectId, 'Flow Test Agent', {
      systemPrompt: 'You are a helpful assistant. Keep responses brief and direct.',
    })
    agentId = agent.id

    // Set as default target
    await helper.apiPatch(`/api/projects/${projectId}`, {
      defaultTargetType: 'agent',
      defaultTargetId: agentId,
    })
  })

  test('send message and receive real AI response', async ({ window, helper }) => {
    test.setTimeout(120_000)

    // Create conversation via API and navigate directly
    const conv = await helper.createConversationViaApi(projectId, agentId, 'Basic Chat')
    await helper.navigateTo(`/projects/${projectId}/chat?conv=${conv.id}`)

    await expect(window.locator(SELECTORS.CHAT_INPUT)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

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

  test('input re-enabled after response completes', async ({ window, helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(projectId, agentId, 'Streaming Test')
    await helper.navigateTo(`/projects/${projectId}/chat?conv=${conv.id}`)

    await expect(window.locator(SELECTORS.CHAT_INPUT)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

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

    const conv = await helper.createConversationViaApi(projectId, agentId, 'Multi-turn')
    await helper.navigateTo(`/projects/${projectId}/chat?conv=${conv.id}`)

    await expect(window.locator(SELECTORS.CHAT_INPUT)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

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

    const conv = await helper.createConversationViaApi(projectId, agentId, 'Streaming State')
    await helper.navigateTo(`/projects/${projectId}/chat?conv=${conv.id}`)

    const chatInput = window.locator(SELECTORS.CHAT_INPUT)
    await expect(chatInput).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Before sending, input should be enabled
    await expect(chatInput).toBeEnabled()

    // Send a message that requires a longer response
    await helper.sendChatMessage('Count from 1 to 5, each on a new line.')

    // During streaming, input should be disabled
    await expect(chatInput).toBeDisabled({ timeout: 5000 })

    // Wait for streaming to complete
    await helper.waitForResponse(TIMEOUTS.AI_RESPONSE)

    // After streaming, input should be re-enabled
    await expect(chatInput).toBeEnabled({ timeout: 5000 })
  })

  test('empty state shows Start Chatting when default agent is set', async ({ window, helper }) => {
    test.setTimeout(60_000)

    await helper.navigateTo(`/projects/${projectId}/chat`)

    // Verify empty state shows "Ready to chat" and "Start Chatting" button
    await expect(
      window.getByText('Ready to chat').or(window.getByText('Start Chatting')).first()
    ).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })
})
