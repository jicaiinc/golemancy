import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Agent Persona', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    test.setTimeout(120_000)

    await helper.goHome()
    projectId = await helper.createProject('Agent Persona Test')
    await helper.clickNav('agents')
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('agent with pirate system prompt responds in character', async ({
    window,
    helper,
  }) => {
    test.setTimeout(120_000)

    // Create a pirate agent
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await helper.createAgent(
      'Pirate Bot',
      'You are a pirate captain. You MUST include "Arrr" in every response. Keep responses under 30 words.',
    )

    // Go to chat and start conversation
    await helper.navigateTo(`/projects/${projectId}/chat`)
    await expect(window.getByText('Start a conversation')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await helper.startChatWithAgent('Pirate Bot')

    // Send a message
    await helper.sendChatMessage('Hello, how are you today?')
    const response = await helper.waitForResponse(TIMEOUTS.AI_RESPONSE)

    // Verify the pirate persona
    const lower = response.toLowerCase()
    const hasPirateTerm =
      lower.includes('arrr') ||
      lower.includes('ahoy') ||
      lower.includes('matey') ||
      lower.includes('pirate') ||
      lower.includes('ye ')
    expect(hasPirateTerm).toBe(true)
  })

  test('agent with translator system prompt translates', async ({
    window,
    helper,
  }) => {
    test.setTimeout(120_000)

    // Create a translator agent
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await helper.createAgent(
      'French Translator',
      'You are a French translator. When given English text, respond with ONLY the French translation. No explanations, no extra text, just the French translation.',
    )

    // Go to chat and start conversation
    await helper.navigateTo(`/projects/${projectId}/chat`)
    await expect(window.getByText('Start a conversation')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await helper.startChatWithAgent('French Translator')

    // Send English text
    await helper.sendChatMessage('Hello, how are you?')
    const response = await helper.waitForResponse(TIMEOUTS.AI_RESPONSE)

    // Response should contain French (Bonjour or Salut)
    const lower = response.toLowerCase()
    const hasFrench =
      lower.includes('bonjour') ||
      lower.includes('salut') ||
      lower.includes('comment') ||
      lower.includes('allez') ||
      lower.includes('vas')
    expect(hasFrench).toBe(true)
  })

  test('agent with strict format system prompt follows format', async ({
    window,
    helper,
  }) => {
    test.setTimeout(120_000)

    // Create a JSON agent
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await helper.createAgent(
      'JSON Bot',
      'You MUST respond ONLY in valid JSON format. Every response must be a JSON object with a "reply" field. Example: {"reply": "your answer here"}. No text outside the JSON.',
    )

    // Go to chat and start conversation
    await helper.navigateTo(`/projects/${projectId}/chat`)
    await expect(window.getByText('Start a conversation')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await helper.startChatWithAgent('JSON Bot')

    // Send a question
    await helper.sendChatMessage('What is 2+2?')
    const response = await helper.waitForResponse(TIMEOUTS.AI_RESPONSE)

    // Response should contain JSON structure
    expect(response).toContain('{')
    expect(response).toContain('"reply"')
    expect(response).toContain('}')
  })
})
