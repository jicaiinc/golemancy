import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Template Selector', () => {
  test.beforeAll(async ({ helper }) => {
    await helper.goHome()
  })

  test('create project modal shows blank and template options', async ({ window }) => {
    await window.click(SELECTORS.CREATE_PROJECT_BTN)

    // Two creation mode options should be visible
    await expect(window.getByText('Blank Project')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('From Template')).toBeVisible()

    // Template list should NOT be visible until "From Template" is clicked
    await expect(window.getByText('Writing Assistant')).not.toBeVisible()

    // Close modal
    await window.click(SELECTORS.CANCEL_BTN)
  })

  test('clicking From Template shows master-detail panel', async ({ window }) => {
    await window.click(SELECTORS.CREATE_PROJECT_BTN)
    await expect(window.getByText('From Template')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Expand template browser
    await window.getByText('From Template').first().click()

    // Category filter and template list should appear
    await expect(window.locator(SELECTORS.TEMPLATE_CATEGORY_ALL)).toBeVisible()
    await expect(window.getByText('Writing Assistant')).toBeVisible()
    await expect(window.getByText('Deep Research')).toBeVisible()

    // Placeholder text should show in detail panel
    await expect(window.getByText('Select a template to see details')).toBeVisible()

    // Close modal
    await window.click(SELECTORS.CANCEL_BTN)
  })

  test('selecting a template shows detail and auto-fills name', async ({ window }) => {
    await window.click(SELECTORS.CREATE_PROJECT_BTN)
    await expect(window.locator(SELECTORS.PROJECT_NAME_INPUT)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Expand and select a template
    await window.getByText('From Template').first().click()
    await window.getByText('Writing Assistant').first().click()

    // Detail panel should show description
    await expect(window.getByText(/AI writing expert/)).toBeVisible()

    // Name should auto-fill
    await expect(window.locator(SELECTORS.PROJECT_NAME_INPUT)).toHaveValue('Writing Assistant')

    // Close modal
    await window.click(SELECTORS.CANCEL_BTN)
  })

  test('switching back to blank collapses template panel', async ({ window }) => {
    await window.click(SELECTORS.CREATE_PROJECT_BTN)
    await expect(window.locator(SELECTORS.PROJECT_NAME_INPUT)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Expand and select a template
    await window.getByText('From Template').first().click()
    await window.getByText('Deep Research').first().click()
    await expect(window.locator(SELECTORS.PROJECT_NAME_INPUT)).toHaveValue('Deep Research')

    // Click Blank Project
    await window.getByText('Blank Project').first().click()

    // Master-detail panel should collapse — category filter gone
    await expect(window.locator(SELECTORS.TEMPLATE_CATEGORY_ALL)).not.toBeVisible()

    // Description input should reappear (only shown for blank projects)
    await expect(window.locator(SELECTORS.PROJECT_DESC_INPUT)).toBeVisible()

    // Close modal
    await window.click(SELECTORS.CANCEL_BTN)
  })
})
