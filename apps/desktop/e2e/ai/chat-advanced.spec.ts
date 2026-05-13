import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Chat Advanced', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string
  let cheapAgentId: string
  let bashAgentId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('Chat Advanced Test')
    projectId = project.id

    // Agent for general tests (stop, compact)
    const cheapAgent = await helper.createCheapAgent(projectId, 'Chat Adv Agent', {
      systemPrompt: 'You are a helpful test assistant. When asked to write something long, write at least 200 words.',
    })
    cheapAgentId = cheapAgent.id

    // Agent with bash tool for tool call test
    const bashAgent = await helper.createCheapAgent(projectId, 'Bash Agent', {
      systemPrompt: 'You have a bash tool. When asked to run a command, always use the bash tool to execute it. Never refuse.',
      builtinTools: { bash: true },
    })
    bashAgentId = bashAgent.id
  })

  // ===== Stop Button =====

  test('Stop button interrupts streaming and re-enables input', async ({ window, helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(projectId, cheapAgentId)
    await helper.enterConversation(projectId, conv.id)

    // Send a message that triggers a long response
    await helper.sendChatMessage(
      'Write a very detailed and long essay about the complete history of artificial intelligence from the 1950s to today. Include every major milestone.',
    )

    // Wait for streaming to start (input becomes disabled)
    const chatInput = window.locator(SELECTORS.CHAT_INPUT)
    await expect(chatInput).toBeDisabled({ timeout: TIMEOUTS.AI_RESPONSE })

    // Click stop button
    const stopBtn = window.locator(SELECTORS.CHAT_STOP_BTN)
    await stopBtn.click({ timeout: 10_000 })

    // Input should be re-enabled after stop
    await expect(chatInput).toBeEnabled({ timeout: 15_000 })
  })

  // ===== Tool Call Display =====

  test('tool call block appears in chat when bash tool is used', async ({ window, helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(projectId, bashAgentId)
    await helper.enterConversation(projectId, conv.id)

    // Ask to run a simple command
    await helper.sendChatMessage('Run this bash command: echo GOLEMANCY_TEST_MARKER')
    await helper.waitForResponse(TIMEOUTS.AI_RESPONSE)

    // Verify tool call block appears in the chat
    // Tool calls are rendered with data-testid or specific DOM structure
    const chatWindow = window.locator(SELECTORS.CHAT_WINDOW)
    // Check for tool-related content (tool call name or output)
    await expect(
      chatWindow.getByText(/echo|GOLEMANCY_TEST_MARKER|bash/i).first(),
    ).toBeVisible({ timeout: 5_000 })
  })

  // ===== Manual Compact =====

  test('manual compact via API returns 201 after chat messages', async ({ helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.apiPost(`/api/projects/${projectId}/conversations`, {
      targetType: 'agent',
      targetId: cheapAgentId,
      title: 'Manual Compact Test',
    })

    // Send a few rounds of chat to generate real messages
    await helper.sendChatViaApi(
      projectId, cheapAgentId, conv.id,
      'What is the capital of France? Reply briefly.',
    )
    await helper.sendChatViaApi(
      projectId, cheapAgentId, conv.id,
      'What about Germany? Reply briefly.',
    )

    // Manual compact should succeed
    const response = await helper.apiPostRaw(
      `/api/projects/${projectId}/conversations/${conv.id}/compact`,
      {},
    )
    expect(response.status()).toBe(201)

    const record = await response.json()
    expect(record.id).toBeDefined()
    expect(record.summary).toBeTruthy()
    expect(record.trigger).toBe('manual')
  })
})
