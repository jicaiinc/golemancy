import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('AI Chat Completion', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  test('basic AI response', async ({ window, helper }) => {
    test.setTimeout(120_000)

    // Create project and agent
    await helper.goHome()
    const projectId = await helper.createProject('AI Chat Test')
    await helper.clickNav('agents')
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await helper.createAgent('AI Test Agent')

    // Navigate to chat page
    await helper.navigateTo(`/projects/${projectId}/chat`)
    await expect(window.getByText('Start a conversation')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Start a chat by clicking the agent in the empty state
    await window.getByText('AI Test Agent').click()

    // Wait for chat window
    await expect(window.locator(SELECTORS.CHAT_WINDOW)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Send a simple math question
    await helper.sendChatMessage('What is 2+2? Reply with just the number.')
    const response = await helper.waitForResponse(TIMEOUTS.AI_RESPONSE)
    expect(response).toContain('4')
  })
})
