import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Workspace Files', () => {
  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Workspace Files Test')
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await helper.createAgent('Workspace Files Agent')
  })

  test('file tree renders', async ({ window, helper }) => {
    await helper.clickNav('artifacts')
    await expect(window.locator(SELECTORS.WORKSPACE_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator(SELECTORS.WORKSPACE_FILE_TREE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('preview panel shows select prompt', async ({ window, helper }) => {
    await helper.clickNav('artifacts')
    await expect(window.locator(SELECTORS.WORKSPACE_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    // When no file is selected, the preview area shows "Select a file to preview"
    // (the data-testid="workspace-preview" only appears when a file IS selected)
    await expect(window.getByText('Select a file to preview')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('refresh button works', async ({ window, helper }) => {
    await helper.clickNav('artifacts')
    await expect(window.locator(SELECTORS.WORKSPACE_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    const refreshBtn = window.locator(SELECTORS.WORKSPACE_REFRESH_BTN)
    await expect(refreshBtn).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Click refresh and verify the page doesn't break
    await refreshBtn.click()

    // File tree should still be visible after refresh
    await expect(window.locator(SELECTORS.WORKSPACE_FILE_TREE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('Select a file to preview')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })
})
