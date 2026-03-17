import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

/**
 * B3: Conversation resume after navigation.
 * Verifies that messages persist when user navigates away and returns.
 * Seeds data via API — no AI keys needed.
 */
test.describe('Conversation Resume', () => {
  let projectId: string
  let agentId: string
  let conversationId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()

    // Create project via UI so the store is properly hydrated
    projectId = await helper.createProject('Conversation Resume Test')

    // Create agent via UI
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    agentId = await helper.createAgent('Resume Agent')

    // Set main agent so chat page works
    await helper.apiPatch(`/api/projects/${projectId}`, { defaultAgentId: agentId })

    // Create conversation with seeded messages
    const conv = await helper.createConversationViaApi(projectId, agentId, 'Persist Test Conv')
    conversationId = conv.id

    // Seed messages using the proper helper method
    await helper.saveMessageViaApi(projectId, conversationId, {
      role: 'user',
      content: 'What is 2+2?',
    })
    await helper.saveMessageViaApi(projectId, conversationId, {
      role: 'assistant',
      content: 'The answer is 4.',
    })

    // Force store refresh so conversations are re-fetched
    await window.evaluate(() => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (store) store.getState().clearProject()
    })
  })

  test('messages visible on first load', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/chat?conv=${conversationId}`)
    await helper.store.waitFor(`state.currentConversationId === "${conversationId}"`, TIMEOUTS.PAGE_LOAD)
    await expect(window.locator(SELECTORS.CHAT_WINDOW)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Verify seeded messages appear
    await expect(window.locator(`${SELECTORS.CHAT_MESSAGE}[data-role="user"]`).first()).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.locator(`${SELECTORS.CHAT_MESSAGE}[data-role="assistant"]`).first()).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('messages persist after navigating away and returning', async ({ window, helper }) => {
    // Load conversation
    await helper.navigateTo(`/projects/${projectId}/chat?conv=${conversationId}`)
    await helper.store.waitFor(`state.currentConversationId === "${conversationId}"`, TIMEOUTS.PAGE_LOAD)
    await expect(window.locator(SELECTORS.CHAT_WINDOW)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator(`${SELECTORS.CHAT_MESSAGE}[data-role="user"]`).first()).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Navigate away to agents page
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Navigate back to the same conversation
    await helper.navigateTo(`/projects/${projectId}/chat?conv=${conversationId}`)
    await helper.store.waitFor(`state.currentConversationId === "${conversationId}"`, TIMEOUTS.PAGE_LOAD)
    await expect(window.locator(SELECTORS.CHAT_WINDOW)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Messages should still be there
    const userMessages = window.locator(`${SELECTORS.CHAT_MESSAGE}[data-role="user"]`)
    const assistantMessages = window.locator(`${SELECTORS.CHAT_MESSAGE}[data-role="assistant"]`)
    await expect(userMessages.first()).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(assistantMessages.first()).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Verify the content is correct (not just any message)
    await expect(userMessages.first()).toContainText('2+2')
    await expect(assistantMessages.first()).toContainText('4')
  })

  test('sidebar switching between conversations preserves both', async ({ window, helper }) => {
    // Create a second conversation with different content
    const conv2 = await helper.createConversationViaApi(projectId, agentId, 'Second Conv')
    await helper.saveMessageViaApi(projectId, conv2.id, {
      role: 'user',
      content: 'What color is the sky?',
    })
    await helper.saveMessageViaApi(projectId, conv2.id, {
      role: 'assistant',
      content: 'The sky is blue.',
    })

    // Navigate to first conversation
    await helper.navigateTo(`/projects/${projectId}/chat?conv=${conversationId}`)
    await helper.store.waitFor(`state.currentConversationId === "${conversationId}"`, TIMEOUTS.PAGE_LOAD)
    await expect(window.locator(SELECTORS.CHAT_WINDOW)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator(`${SELECTORS.CHAT_MESSAGE}[data-role="user"]`).first()).toContainText('2+2', {
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Switch to second conversation via store (simulates sidebar click)
    await window.evaluate(async (id: string) => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (store) await store.getState().selectConversation(id)
    }, conv2.id)
    await helper.store.waitFor(`state.currentConversationId === "${conv2.id}"`, 30_000)
    await expect(window.locator(SELECTORS.CHAT_WINDOW)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator(`${SELECTORS.CHAT_MESSAGE}[data-role="user"]`).first()).toContainText('color', {
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Switch back to first via store
    await window.evaluate(async (id: string) => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (store) await store.getState().selectConversation(id)
    }, conversationId)
    await helper.store.waitFor(`state.currentConversationId === "${conversationId}"`, 30_000)
    await expect(window.locator(SELECTORS.CHAT_WINDOW)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator(`${SELECTORS.CHAT_MESSAGE}[data-role="user"]`).first()).toContainText('2+2', {
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })
})
