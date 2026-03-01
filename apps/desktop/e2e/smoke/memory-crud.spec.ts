import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Memory CRUD', () => {
  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Memory CRUD Test')
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await helper.createAgent('Memory CRUD Agent')
  })

  test('create memory via UI', async ({ window, helper }) => {
    await helper.clickNav('memory')
    await expect(window.locator(SELECTORS.MEMORY_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Click add button
    await window.locator(SELECTORS.MEMORY_ADD_BTN).click()

    // Modal should appear
    await expect(window.getByText('Add Memory Entry')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Fill in the form — labels are rendered as separate <label> elements
    // CONTENT is a textarea, SOURCE and TAGS are inputs
    const contentArea = window.locator('textarea').first()
    await contentArea.fill('Test memory content for E2E')

    // SOURCE input — find by placeholder
    const sourceInput = window.getByPlaceholder('e.g. Researcher')
    await sourceInput.fill('E2E Test')

    // TAGS input — find by placeholder
    const tagsInput = window.getByPlaceholder('e.g. strategy, audience')
    await tagsInput.fill('e2e, test')

    // Save
    await window.getByRole('button', { name: 'Save' }).click()

    // Verify memory-card appears (scope within card to avoid matching hidden modal textarea)
    await expect(window.locator(SELECTORS.MEMORY_CARD)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator(SELECTORS.MEMORY_CARD).getByText('Test memory content for E2E')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('edit memory', async ({ window, helper }) => {
    await helper.clickNav('memory')
    await expect(window.locator(SELECTORS.MEMORY_CARD)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Click Edit on the memory card
    await window.locator(SELECTORS.MEMORY_CARD).getByRole('button', { name: 'Edit' }).first().click()

    // Modal should show "Edit Memory Entry"
    await expect(window.getByText('Edit Memory Entry')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Update content
    const contentArea = window.locator('textarea').first()
    await contentArea.fill('Updated memory content')

    // Save
    await window.getByRole('button', { name: 'Save' }).click()

    // Verify updated content (scope within card)
    await expect(window.locator(SELECTORS.MEMORY_CARD).getByText('Updated memory content')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('search memory', async ({ window, helper }) => {
    await helper.clickNav('memory')
    await expect(window.locator(SELECTORS.MEMORY_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Type in search
    const searchInput = window.locator(SELECTORS.MEMORY_SEARCH)
    await searchInput.fill('Updated memory')

    // The card with matching content should still be visible
    await expect(window.locator(SELECTORS.MEMORY_CARD)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Search for something that doesn't exist
    await searchInput.fill('nonexistent content xyz')

    // No matching memories message should appear
    await expect(window.getByText('No matching memories')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Clear search
    await searchInput.fill('')
    await expect(window.locator(SELECTORS.MEMORY_CARD)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('delete memory', async ({ window, helper }) => {
    await helper.clickNav('memory')
    await expect(window.locator(SELECTORS.MEMORY_CARD)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Click the × button on the memory card
    await window.locator(SELECTORS.MEMORY_CARD).getByRole('button', { name: '×' }).first().click()

    // Verify empty state
    await expect(window.getByText('No memories yet')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })
})
