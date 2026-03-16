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
  let agentId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(120_000)

    await helper.goHome()

    const project = await helper.createProjectViaApi('Code Execution Test')
    projectId = project.id

    // Create agent with bash tool enabled via API
    const agent = await helper.createAgentViaApi(projectId, 'Code Runner', {
      systemPrompt: 'You are a coding assistant. When asked to run code, use the bash tool to execute it. Keep responses brief.',
    })
    agentId = agent.id

    // Set as default target so chat page can use it
    await helper.apiPatch(`/api/projects/${projectId}`, {
      defaultTargetType: 'agent',
      defaultTargetId: agentId,
    })
  })

  test('execute echo command via bash tool', async ({ window, helper }) => {
    test.setTimeout(120_000)

    // Create conversation and navigate directly
    const conv = await helper.createConversationViaApi(projectId, agentId, 'Echo Test')
    await helper.navigateTo(`/projects/${projectId}/chat?conv=${conv.id}`)

    await expect(window.locator(SELECTORS.CHAT_INPUT)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

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

    const conv = await helper.createConversationViaApi(projectId, agentId, 'Python Test')
    await helper.navigateTo(`/projects/${projectId}/chat?conv=${conv.id}`)

    await expect(window.locator(SELECTORS.CHAT_INPUT)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

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

    const conv = await helper.createConversationViaApi(projectId, agentId, 'Node Test')
    await helper.navigateTo(`/projects/${projectId}/chat?conv=${conv.id}`)

    await expect(window.locator(SELECTORS.CHAT_INPUT)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Ask to run Node.js code
    await helper.sendChatMessage(
      'Run this Node.js code using bash: node -e "console.log(\'NODE_E2E_OK\')"',
    )

    const response = await helper.waitForResponse(TIMEOUTS.AI_RESPONSE)

    expect(response).toContain('NODE_E2E_OK')
  })
})
