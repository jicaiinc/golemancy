import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Knowledge Base Page', () => {
  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('KB Page Test')
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await helper.createAgent('KB Test Agent')
  })

  test('navigate to knowledge base page via sidebar', async ({ window, helper }) => {
    await helper.clickNav('knowledgeBase')
    await expect(window.locator(SELECTORS.KB_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('knowledge base page shows header', async ({ window, helper }) => {
    await helper.clickNav('knowledgeBase')
    await expect(window.locator(SELECTORS.KB_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('Knowledge Base')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('four tier columns displayed', async ({ window, helper }) => {
    await helper.clickNav('knowledgeBase')
    await expect(window.locator(SELECTORS.KB_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // All four tier labels should be visible
    await expect(window.getByText('Hot')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('Warm')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('Cold')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('Archive')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('empty state displayed when no collections', async ({ window, helper }) => {
    await helper.clickNav('knowledgeBase')
    await expect(window.locator(SELECTORS.KB_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('0 collections')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('new collection button visible', async ({ window, helper }) => {
    await helper.clickNav('knowledgeBase')
    await expect(window.locator(SELECTORS.KB_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator(SELECTORS.KB_ADD_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('open new collection modal', async ({ window, helper }) => {
    await helper.clickNav('knowledgeBase')
    await expect(window.locator(SELECTORS.KB_ADD_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    await window.locator(SELECTORS.KB_ADD_BTN).click()

    // Verify modal fields
    await expect(window.getByText('New Collection')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('NAME')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Close modal
    await window.getByText('Cancel').click()
  })
})
