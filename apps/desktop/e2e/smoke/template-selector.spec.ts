import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Template Selector', () => {
  test.beforeAll(async ({ helper }) => {
    await helper.goHome()
  })

  test('create project modal shows template selector', async ({ window }) => {
    await window.click(SELECTORS.CREATE_PROJECT_BTN)

    // Template selector should show "Blank Project" and template cards
    await expect(window.getByText('Blank Project')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('Writing Assistant')).toBeVisible()
    await expect(window.getByText('Deep Research')).toBeVisible()

    // Close modal
    await window.click(SELECTORS.CANCEL_BTN)
  })

  test('selecting a template auto-fills project name', async ({ window }) => {
    await window.click(SELECTORS.CREATE_PROJECT_BTN)
    await expect(window.locator(SELECTORS.PROJECT_NAME_INPUT)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Click Writing Assistant template card
    await window.getByText('Writing Assistant').first().click()

    // Name should auto-fill
    const nameInput = window.locator(SELECTORS.PROJECT_NAME_INPUT)
    await expect(nameInput).toHaveValue('Writing Assistant')

    // Close modal
    await window.click(SELECTORS.CANCEL_BTN)
  })

  test('selecting blank project does not auto-fill name', async ({ window }) => {
    await window.click(SELECTORS.CREATE_PROJECT_BTN)
    await expect(window.locator(SELECTORS.PROJECT_NAME_INPUT)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // First select a template to set a name
    await window.getByText('Deep Research').first().click()
    await expect(window.locator(SELECTORS.PROJECT_NAME_INPUT)).toHaveValue('Deep Research')

    // Then click Blank Project
    await window.getByText('Blank Project').first().click()

    // Description input should reappear (only shown for blank projects)
    await expect(window.locator(SELECTORS.PROJECT_DESC_INPUT)).toBeVisible()

    // Close modal
    await window.click(SELECTORS.CANCEL_BTN)
  })

  test('template cards show category badges', async ({ window }) => {
    await window.click(SELECTORS.CREATE_PROJECT_BTN)
    await expect(window.getByText('Writing Assistant')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Category badges should be visible
    await expect(window.getByText('Creative')).toBeVisible()
    await expect(window.getByText('Research')).toBeVisible()

    // Close modal
    await window.click(SELECTORS.CANCEL_BTN)
  })
})
