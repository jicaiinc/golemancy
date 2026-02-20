import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Memory Page', () => {
  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Memory Test Project')
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await helper.createAgent('Memory Test Agent')
  })

  test('navigate to memory page via sidebar', async ({ window, helper }) => {
    await helper.clickNav('memory')
    await expect(window.locator(SELECTORS.MEMORY_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('memory page shows header', async ({ window, helper }) => {
    await helper.clickNav('memory')
    await expect(window.locator(SELECTORS.MEMORY_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('Memory Bank')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('empty state displayed when no memories', async ({ window, helper }) => {
    await helper.clickNav('memory')
    await expect(window.locator(SELECTORS.MEMORY_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('No memories yet')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('add entry button visible', async ({ window, helper }) => {
    await helper.clickNav('memory')
    await expect(window.locator(SELECTORS.MEMORY_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator(SELECTORS.MEMORY_ADD_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('open add memory form modal', async ({ window, helper }) => {
    await helper.clickNav('memory')
    await expect(window.locator(SELECTORS.MEMORY_ADD_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    await window.locator(SELECTORS.MEMORY_ADD_BTN).click()

    // Verify modal fields
    await expect(window.getByText('Add Memory Entry')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('CONTENT')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('SOURCE')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('TAGS (comma-separated)')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Close modal
    await window.getByText('Cancel').click()
  })

  test('search input visible', async ({ window, helper }) => {
    await helper.clickNav('memory')
    await expect(window.locator(SELECTORS.MEMORY_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator(SELECTORS.MEMORY_SEARCH)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })
})
