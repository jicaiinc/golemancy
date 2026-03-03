import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Knowledge Base CRUD', () => {
  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('KB CRUD Test')
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await helper.createAgent('KB CRUD Agent')
  })

  test('create collection via UI', async ({ window, helper }) => {
    await helper.clickNav('knowledgeBase')
    await expect(window.locator(SELECTORS.KB_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Click new collection button
    await window.locator(SELECTORS.KB_ADD_BTN).click()

    // Modal should appear
    await expect(window.getByText('New Collection')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Fill in the form
    const nameInput = window.getByPlaceholder('e.g. Brand Guidelines')
    await nameInput.fill('E2E Test Collection')

    const descInput = window.getByPlaceholder('Optional description')
    await descInput.fill('Test collection for E2E')

    // Save
    await window.getByRole('button', { name: 'Create' }).click()

    // Verify collection card appears
    await expect(window.locator(SELECTORS.KB_COLLECTION_CARD)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator(SELECTORS.KB_COLLECTION_CARD).getByText('E2E Test Collection')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('open collection detail', async ({ window, helper }) => {
    await helper.clickNav('knowledgeBase')
    await expect(window.locator(SELECTORS.KB_COLLECTION_CARD)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Click the collection card to open detail
    await window.locator(SELECTORS.KB_COLLECTION_CARD).first().click()

    // Detail modal should show collection name
    await expect(window.getByText('E2E Test Collection')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Should show no documents state
    await expect(window.getByText('No documents in this collection')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('delete collection', async ({ window, helper }) => {
    await helper.clickNav('knowledgeBase')
    await expect(window.locator(SELECTORS.KB_COLLECTION_CARD)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Open collection detail
    await window.locator(SELECTORS.KB_COLLECTION_CARD).first().click()

    // Click delete
    await window.getByText('Delete Collection').click()

    // Confirm deletion
    await window.getByRole('button', { name: 'Delete' }).click()

    // Verify empty state
    await expect(window.getByText('0 collections')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })
})
