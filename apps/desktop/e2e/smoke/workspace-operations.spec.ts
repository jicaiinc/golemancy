import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Workspace Operations — File Preview & Directory Expand', () => {
  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()

    // Create project and agent
    projectId = await helper.createProject('Workspace Ops Test')
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await helper.createAgent('Workspace Agent')

    // Seed workspace files
    helper.seedWorkspaceFile(projectId, 'test.txt', 'Hello from test file!')
    helper.seedWorkspaceFile(projectId, 'subdir/nested.txt', 'Nested file content')
    helper.seedWorkspaceFile(projectId, 'subdir/deep/level3.txt', 'Deeply nested')
  })

  test('file tree shows seeded files after refresh', async ({ window, helper }) => {
    await helper.clickNav('artifacts')
    await expect(window.locator(SELECTORS.WORKSPACE_PAGE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Click refresh to pick up seeded files
    const refreshBtn = window.locator(SELECTORS.WORKSPACE_REFRESH_BTN)
    await expect(refreshBtn).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await refreshBtn.click()

    // File tree should contain our seeded file
    await expect(window.locator(SELECTORS.WORKSPACE_FILE_TREE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.getByText('test.txt')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('clicking a file shows preview with content', async ({ window, helper }) => {
    await helper.clickNav('artifacts')
    await expect(window.locator(SELECTORS.WORKSPACE_PAGE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Refresh to ensure files are loaded
    await window.locator(SELECTORS.WORKSPACE_REFRESH_BTN).click()
    await expect(window.getByText('test.txt')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Click on the test file
    await window.getByText('test.txt').click()

    // Preview panel should appear with the file content
    await expect(window.locator(SELECTORS.WORKSPACE_PREVIEW)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.getByText('Hello from test file!')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('directory can be expanded to show nested files', async ({ window, helper }) => {
    await helper.clickNav('artifacts')
    await expect(window.locator(SELECTORS.WORKSPACE_PAGE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Refresh to ensure files are loaded
    await window.locator(SELECTORS.WORKSPACE_REFRESH_BTN).click()

    // The directory "subdir" should be visible in the tree
    await expect(window.getByText('subdir')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Click on subdir to expand it
    await window.getByText('subdir').click()

    // After expanding, nested.txt should become visible
    await expect(window.getByText('nested.txt')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })
})
