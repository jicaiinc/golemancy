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

  test('edit project name via project settings', async ({ window, helper }) => {
    await helper.goHome()

    // Enter a project
    const projectCard = window.locator('[data-testid^="project-item-"]').first()
    await expect(projectCard).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await projectCard.click()
    await expect(window.locator(SELECTORS.SIDEBAR)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Navigate to settings
    await helper.clickNav('settings')

    // Click General tab
    const generalTab = window.locator(SELECTORS.PROJECT_SETTINGS_TAB('general'))
    await expect(generalTab).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await generalTab.click()

    // Find project name input and change it
    await expect(window.getByText('PROJECT NAME')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    const nameInput = window.locator('input').filter({ has: window.locator('..').filter({ hasText: 'PROJECT NAME' }) }).first()
    // The PixelInput has label + input structure — target the input within the name section
    const projectNameInput = window.locator('[data-testid="save-btn"]').locator('..').locator('..').locator('input').first()
    await projectNameInput.fill('Renamed Project')

    // Click save
    await window.locator(SELECTORS.SAVE_BTN).click()
  })

  test('project icon selector shows icons', async ({ window, helper }) => {
    await helper.goHome()

    const projectCard = window.locator('[data-testid^="project-item-"]').first()
    await expect(projectCard).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await projectCard.click()
    await expect(window.locator(SELECTORS.SIDEBAR)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    await helper.clickNav('settings')

    const generalTab = window.locator(SELECTORS.PROJECT_SETTINGS_TAB('general'))
    await expect(generalTab).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await generalTab.click()

    // Verify ICON label and selectable icon buttons
    await expect(window.getByText('ICON')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    // There should be multiple icon buttons (8 icons defined in the component)
    const iconButtons = window.locator('button').filter({ hasText: /^.$/ }).locator('visible=true')
    // At minimum, some icon buttons should exist in the icon section
    await expect(window.getByText('ICON').locator('..').locator('button').first()).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('navigate to all project settings tabs', async ({ window, helper }) => {
    // Use store to get a known project ID instead of clicking cards (more reliable)
    const projects = await helper.store.get<Array<{ id: string }>>('projects')
    expect(projects.length).toBeGreaterThan(0)
    const projectId = projects[0].id

    await helper.navigateTo(`/projects/${projectId}`)
    await expect(window.locator(SELECTORS.SIDEBAR)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    await helper.clickNav('settings')

    // General tab
    const generalTab = window.locator(SELECTORS.PROJECT_SETTINGS_TAB('general'))
    await expect(generalTab).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await generalTab.click()
    await expect(window.getByText('BASIC INFO')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Agent tab
    const agentTab = window.locator(SELECTORS.PROJECT_SETTINGS_TAB('agent'))
    await expect(agentTab).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await agentTab.click()
    await expect(window.getByText('MAIN AGENT', { exact: true })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Permissions tab
    const permissionsTab = window.locator(SELECTORS.PROJECT_SETTINGS_TAB('permissions'))
    await expect(permissionsTab).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await permissionsTab.click()
  })
})
