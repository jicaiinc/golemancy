import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Agent Execution', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  test('agent with custom system prompt responds appropriately', async ({ window, helper }) => {
    test.setTimeout(120_000)

    // Create project and agent with a custom system prompt
    await helper.goHome()
    const projectId = await helper.createProject('Agent Execution Test')
    await helper.clickNav('agents')
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await helper.createAgent(
      'Pirate Agent',
      'You are a pirate. Always respond with pirate language including "Arrr" in every response. Keep responses short.'
    )

    // Navigate to chat page
    await helper.navigateTo(`/projects/${projectId}/chat`)
    await expect(window.getByText('Start a conversation')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Start a chat by clicking the agent
    await window.getByText('Pirate Agent').click()

    // Wait for chat window
    await expect(window.locator(SELECTORS.CHAT_WINDOW)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Send a message that should trigger the pirate persona
    await helper.sendChatMessage('Hello, how are you today?')
    const response = await helper.waitForResponse(TIMEOUTS.AI_RESPONSE)

    // The response should contain pirate-like language
    const lowerResponse = response.toLowerCase()
    const hasPirateTerm =
      lowerResponse.includes('arrr') ||
      lowerResponse.includes('ahoy') ||
      lowerResponse.includes('matey') ||
      lowerResponse.includes('pirate') ||
      lowerResponse.includes('ye ')
    expect(hasPirateTerm).toBe(true)
  })
})
