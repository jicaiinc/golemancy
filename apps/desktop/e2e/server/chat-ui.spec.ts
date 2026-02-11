import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Chat UI', () => {
  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Chat UI Test')

    // Navigate to agents and create one
    await helper.clickNav('agents')
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await helper.createAgent('Chat Agent')
  })

  test('chat page loads and shows empty state', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/chat`)

    // Should show the empty state with "Start a conversation"
    await expect(window.getByText('Start a conversation')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('start chat shows chat input', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/chat`)

    // Wait for chat page to render before clicking
    await expect(window.getByText('Start a conversation')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Click on the agent in the QUICK START section to start a chat
    const agentCard = window.getByText('Chat Agent')
    await agentCard.click()

    // Chat window should now be visible with input elements
    await expect(window.locator(SELECTORS.CHAT_WINDOW)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.locator(SELECTORS.CHAT_INPUT)).toBeVisible()
    await expect(window.locator(SELECTORS.CHAT_SEND_BTN)).toBeVisible()
  })

  test('type and send a user message', async ({ window, helper }) => {
    // Should still be in the chat window from previous test
    // If not, re-navigate
    const chatInput = window.locator(SELECTORS.CHAT_INPUT)
    if (!(await chatInput.isVisible().catch(() => false))) {
      await helper.navigateTo(`/projects/${projectId}/chat`)
      await expect(window.getByText('Start a conversation')).toBeVisible({
        timeout: TIMEOUTS.PAGE_LOAD,
      })
      // Start a chat
      await window.getByText('Chat Agent').click()
      await expect(window.locator(SELECTORS.CHAT_WINDOW)).toBeVisible({
        timeout: TIMEOUTS.PAGE_LOAD,
      })
    }

    // Type a message
    await helper.sendChatMessage('Hello from E2E test!')

    // The user message should appear in the chat
    const userMessage = window.locator(`${SELECTORS.CHAT_MESSAGE}[data-role="user"]`).last()
    await expect(userMessage).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(userMessage).toContainText('Hello from E2E test!')
  })
})
