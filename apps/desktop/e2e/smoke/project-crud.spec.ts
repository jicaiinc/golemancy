import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Project CRUD', () => {
  test('project list shows existing projects or empty state', async ({ window, helper }) => {
    await helper.goHome()
    // Either mock projects exist (create-project-btn visible + project cards)
    // or empty state is shown (still has create-project-btn)
    await expect(window.locator(SELECTORS.CREATE_PROJECT_BTN)).toBeVisible()
  })

  test('create project modal opens', async ({ window, helper }) => {
    await helper.goHome()

    // Click create project button
    await window.click(SELECTORS.CREATE_PROJECT_BTN)

    // Modal should appear with the form elements
    await expect(window.locator(SELECTORS.PROJECT_NAME_INPUT)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.locator(SELECTORS.CONFIRM_BTN)).toBeVisible()
    await expect(window.locator(SELECTORS.CANCEL_BTN)).toBeVisible()

    // Close the modal
    await window.click(SELECTORS.CANCEL_BTN)
  })

  test('create a new project via UI', async ({ window, helper }) => {
    await helper.goHome()

    // Use the helper to create a project
    const projectId = await helper.createProject('E2E Test Project', 'Created by E2E test')
    expect(projectId).toBeTruthy()

    // After creation, should be inside the project (sidebar visible)
    await expect(window.locator(SELECTORS.SIDEBAR)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('project appears in list after creation', async ({ window, helper }) => {
    await helper.goHome()

    // Project cards should exist
    const projectCard = window.locator('[data-testid^="project-item-"]').first()
    await expect(projectCard).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('navigate into project by clicking card', async ({ window, helper }) => {
    await helper.goHome()

    // Click on the first project card
    const projectCard = window.locator('[data-testid^="project-item-"]').first()
    await projectCard.click()

    // Should now be inside the project with sidebar visible
    await expect(window.locator(SELECTORS.SIDEBAR)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })
})
