import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Workspace Page', () => {
  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Workspace Test Project')
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await helper.createAgent('Workspace Test Agent')
  })

  test('navigate to workspace page via sidebar', async ({ window, helper }) => {
    await helper.clickNav('artifacts')
    await expect(window.locator(SELECTORS.WORKSPACE_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('workspace page shows header', async ({ window, helper }) => {
    await helper.clickNav('artifacts')
    await expect(window.locator(SELECTORS.WORKSPACE_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByRole('heading', { name: 'Artifacts' })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('refresh button visible', async ({ window, helper }) => {
    await helper.clickNav('artifacts')
    await expect(window.locator(SELECTORS.WORKSPACE_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator(SELECTORS.WORKSPACE_REFRESH_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('file tree panel visible', async ({ window, helper }) => {
    await helper.clickNav('artifacts')
    await expect(window.locator(SELECTORS.WORKSPACE_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator(SELECTORS.WORKSPACE_FILE_TREE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('preview panel shows select prompt', async ({ window, helper }) => {
    await helper.clickNav('artifacts')
    await expect(window.locator(SELECTORS.WORKSPACE_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('Select a file to preview')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })
})
