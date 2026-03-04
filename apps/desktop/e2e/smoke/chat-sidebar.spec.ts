import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Chat Sidebar', () => {
  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()

    // Create project via UI so store is hydrated
    projectId = await helper.createProject('Chat Sidebar Test')

    // Create agent via UI
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    agentId = await helper.createAgent('Chat Sidebar Agent')

    // Set main agent so "New Chat" is enabled
    await helper.apiPatch(`/api/projects/${projectId}`, { defaultAgentId: agentId })

    // Create test conversations via API
    await helper.createConversationViaApi(projectId, agentId, 'First Conversation')
    await helper.createConversationViaApi(projectId, agentId, 'Second Conversation')
    await helper.createConversationViaApi(projectId, agentId, 'Third Conversation')

    // Re-fetch conversations in the store (API-created conversations aren't in Zustand yet)
    await window.evaluate((pid: string) => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (store) store.getState().loadConversations(pid)
    }, projectId)

    // Wait for conversations to appear in the store
    await helper.store.waitFor('state.conversations.length >= 3', TIMEOUTS.PAGE_LOAD)

    // Expand chat history sidebar (defaults to collapsed)
    await window.evaluate(() => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (store && !store.getState().chatHistoryExpanded) {
        store.getState().toggleChatHistory()
      }
    })
  })

  test('conversation list renders', async ({ window, helper }) => {
    await helper.clickNav('chat')

    // Wait for conversations to load and appear in sidebar
    await expect(window.getByText('First Conversation')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('Second Conversation')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('Third Conversation')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('switch between conversations', async ({ window, helper }) => {
    await helper.clickNav('chat')
    await expect(window.getByText('First Conversation')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Click "First Conversation"
    await window.getByText('First Conversation').click()

    // The chat window should appear
    await expect(window.locator(SELECTORS.CHAT_WINDOW)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Switch to "Second Conversation"
    await window.getByText('Second Conversation').click()

    // The title in the chat window header should update
    await expect(window.locator(`${SELECTORS.CHAT_WINDOW} h2`).filter({ hasText: 'Second Conversation' })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('rename conversation via double-click', async ({ window, helper }) => {
    await helper.clickNav('chat')
    await expect(window.getByText('First Conversation')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Double-click on "First Conversation" to start inline edit
    await window.getByText('First Conversation').dblclick()

    // An input should appear for editing
    const editInput = window.locator('input[class*="bg-surface"]')
    await expect(editInput).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Clear and type new name
    await editInput.fill('Renamed Conversation')
    await editInput.press('Enter')

    // Verify renamed text appears in sidebar (use first() to avoid strict mode — title also appears in chat header)
    await expect(window.getByText('Renamed Conversation').first()).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('delete conversation', async ({ window, helper }) => {
    await helper.clickNav('chat')
    await expect(window.getByText('Third Conversation').first()).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Select the conversation to delete
    await window.getByText('Third Conversation').first().click()
    await expect(window.locator(SELECTORS.CHAT_WINDOW)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Click "Delete" in the chat window header
    await window.locator(SELECTORS.CHAT_WINDOW).getByRole('button', { name: 'Delete' }).click()

    // Confirm deletion
    await window.locator(SELECTORS.CHAT_WINDOW).getByRole('button', { name: 'Confirm' }).click()

    // "Third Conversation" should no longer appear anywhere
    await expect(window.getByText('Third Conversation')).toHaveCount(0, { timeout: TIMEOUTS.PAGE_LOAD })
  })
})
