import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Memory Tab', () => {
  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Memory Tab Test')

    // Create agent via UI so it's in the store
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    agentId = await helper.createAgent('Memory Agent')
  })

  test('memory tab shows empty state', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)

    // Click Memory tab
    const memoryTab = window.locator('[data-testid="tab-memory"]')
    await expect(memoryTab).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await memoryTab.click()

    // Empty state visible
    await expect(window.locator(SELECTORS.MEMORY_EMPTY_STATE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Add button visible
    await expect(window.locator(SELECTORS.MEMORY_ADD_BTN)).toBeVisible()
  })

  test('add button reveals form with all fields', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)

    // Click Memory tab
    const memoryTab = window.locator('[data-testid="tab-memory"]')
    await memoryTab.click()
    await expect(window.locator(SELECTORS.MEMORY_ADD_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Click add button
    await window.click(SELECTORS.MEMORY_ADD_BTN)

    // Form should appear
    await expect(window.locator(SELECTORS.MEMORY_ADD_FORM)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Verify all form fields
    await expect(window.locator(SELECTORS.MEMORY_CONTENT_INPUT)).toBeVisible()
    await expect(window.locator(SELECTORS.MEMORY_TAGS_INPUT)).toBeVisible()
    await expect(window.locator(SELECTORS.MEMORY_PINNED_CHECKBOX)).toBeVisible()
    await expect(window.locator(SELECTORS.MEMORY_SAVE_BTN)).toBeVisible()
    await expect(window.locator(SELECTORS.MEMORY_CANCEL_BTN)).toBeVisible()

    // Close form to avoid leaking showAdd state to next test
    await window.click(SELECTORS.MEMORY_CANCEL_BTN)
  })

  test('save button disabled when content is empty', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)

    const memoryTab = window.locator('[data-testid="tab-memory"]')
    await memoryTab.click()
    await expect(window.locator(SELECTORS.MEMORY_ADD_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    await window.click(SELECTORS.MEMORY_ADD_BTN)
    await expect(window.locator(SELECTORS.MEMORY_ADD_FORM)).toBeVisible()

    // Save should be disabled with empty content
    await expect(window.locator(SELECTORS.MEMORY_SAVE_BTN)).toBeDisabled()

    // Type content → should become enabled
    await window.fill(SELECTORS.MEMORY_CONTENT_INPUT, 'Test memory')
    await expect(window.locator(SELECTORS.MEMORY_SAVE_BTN)).toBeEnabled()

    // Close form to avoid leaking showAdd state to next test
    await window.click(SELECTORS.MEMORY_CANCEL_BTN)
  })

  test('cancel button closes the form', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)

    const memoryTab = window.locator('[data-testid="tab-memory"]')
    await memoryTab.click()
    await expect(window.locator(SELECTORS.MEMORY_ADD_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    await window.click(SELECTORS.MEMORY_ADD_BTN)
    await expect(window.locator(SELECTORS.MEMORY_ADD_FORM)).toBeVisible()

    // Cancel
    await window.click(SELECTORS.MEMORY_CANCEL_BTN)
    await expect(window.locator(SELECTORS.MEMORY_ADD_FORM)).not.toBeVisible()
  })

  test('creating memory via API shows card in tab', async ({ window, helper }) => {
    // Create memory via API
    const memory = await helper.createMemoryViaApi(projectId, agentId, 'Remember this fact', {
      tags: ['test'],
      priority: 3,
    })

    // Force store refresh: clear project so selectProject re-runs on navigation
    await window.evaluate(() => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (store) store.getState().clearProject()
    })
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)
    const memoryTab = window.locator('[data-testid="tab-memory"]')
    await expect(memoryTab).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await memoryTab.click()

    // Memory card should be visible
    await expect(window.locator(SELECTORS.MEMORY_CARD(memory.id))).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Empty state should be gone
    await expect(window.locator(SELECTORS.MEMORY_EMPTY_STATE)).not.toBeVisible()
  })

  test('memory card shows pin, edit, delete buttons', async ({ window, helper }) => {
    // Create a fresh memory
    const memory = await helper.createMemoryViaApi(projectId, agentId, 'Button test memory')

    // Force store refresh: clear project so selectProject re-runs on navigation
    await window.evaluate(() => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (store) store.getState().clearProject()
    })
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)
    const memoryTab = window.locator('[data-testid="tab-memory"]')
    await expect(memoryTab).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await memoryTab.click()

    await expect(window.locator(SELECTORS.MEMORY_CARD(memory.id))).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Action buttons visible
    await expect(window.locator(SELECTORS.MEMORY_PIN_BTN(memory.id))).toBeVisible()
    await expect(window.locator(SELECTORS.MEMORY_EDIT_BTN(memory.id))).toBeVisible()
    await expect(window.locator(SELECTORS.MEMORY_DELETE_BTN(memory.id))).toBeVisible()
  })
})
