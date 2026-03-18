import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

/**
 * Code execution E2E tests — verifies that the agent can execute code
 * through the bash tool via the chat UI.
 *
 * Requires API keys: these tests send real prompts to the LLM
 * and expect the model to use the bash tool to run code.
 */

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Code Execution E2E', () => {
  test.skip(!hasApiKeys, 'Code execution tests require API keys in .env.e2e.local')

  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    test.setTimeout(120_000)

    await helper.goHome()
    projectId = await helper.createProject('Code Execution Test')

    // Create agent with bash tool enabled (default)
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    const agentId = await helper.createAgent(
      'Code Runner',
      'You are a coding assistant. When asked to run code, use the bash tool to execute it. Keep responses brief.',
    )

    // Set as default agent so chat page shows "Start Chatting"
    await helper.apiPatch(`/api/projects/${projectId}`, {
      defaultTargetType: 'agent',
      defaultTargetId: agentId,
    })
    // Force store to re-fetch project with the new default
    await window.evaluate(() => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (store) store.getState().clearProject()
    })
  })

  /** Navigate to chat and ensure the input is ready (handles empty state or existing conversation) */
  async function ensureChatReady(window: any, helper: any) {
    await helper.navigateTo(`/projects/${projectId}/chat`)
    const chatInput = window.locator(SELECTORS.CHAT_INPUT)
    // If chat input is already visible (existing conversation), we're ready
    if (await chatInput.isVisible().catch(() => false)) return
    // Otherwise click "Start Chatting" to open a new conversation
    const startBtn = window.getByText('Start Chatting')
    await expect(startBtn).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await startBtn.click()
    await expect(chatInput).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  }

  test('execute echo command via bash tool', async ({ window, helper }) => {
    test.setTimeout(120_000)

    await ensureChatReady(window, helper)

    // Ask for simple echo execution
    await helper.sendChatMessage(
      'Run this command and show the output: echo "E2E_CODE_TEST_OK"',
    )

    const response = await helper.waitForResponse(TIMEOUTS.AI_RESPONSE)

    // The response should contain the echo output
    expect(response).toContain('E2E_CODE_TEST_OK')
  })

  test('execute Python code and verify output', async ({ window, helper }) => {
    test.setTimeout(120_000)

    await ensureChatReady(window, helper)

    // Ask to run Python code
    await helper.sendChatMessage(
      'Run this Python code using bash: python3 -c "print(7 * 6)"',
    )

    const response = await helper.waitForResponse(TIMEOUTS.AI_RESPONSE)

    // The response should contain the computed result
    expect(response).toContain('42')
  })

  test('execute Node.js code and verify output', async ({
    window,
    helper,
  }) => {
    test.setTimeout(120_000)

    await ensureChatReady(window, helper)

    // Ask to run Node.js code
    await helper.sendChatMessage(
      'Run this Node.js code using bash: node -e "console.log(\'NODE_E2E_OK\')"',
    )

    const response = await helper.waitForResponse(TIMEOUTS.AI_RESPONSE)

    expect(response).toContain('NODE_E2E_OK')
  })
})
