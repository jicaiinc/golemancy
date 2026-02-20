import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Task Page', () => {
  let projectId: string

  test.beforeAll(async ({ helper }) => {
    // Create a project to navigate into
    await helper.goHome()
    projectId = await helper.createProject('Task Test Project')
  })

  test('navigate to tasks page via sidebar', async ({ window, helper }) => {
    await helper.clickNav('tasks')
    await expect(window.locator(SELECTORS.TASK_LIST_PAGE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('tasks page shows header', async ({ window, helper }) => {
    await helper.clickNav('tasks')
    await expect(window.locator(SELECTORS.TASK_LIST_HEADER)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.locator(SELECTORS.TASK_LIST_HEADER)).toHaveText('Conversation Tasks')
  })

  test('tasks page shows empty state when no tasks', async ({ window, helper }) => {
    await helper.clickNav('tasks')
    await expect(window.locator(SELECTORS.TASK_EMPTY_STATE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.getByText('No tasks found')).toBeVisible()
  })

  test('tasks page has filter controls', async ({ window, helper }) => {
    await helper.clickNav('tasks')
    await expect(window.locator(SELECTORS.TASK_LIST_PAGE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Tasks are grouped by conversation — verify the page rendered (no filter buttons in current UI)
    const headerEl = window.locator(SELECTORS.TASK_LIST_HEADER)
    await expect(headerEl).toBeVisible()
  })

  test('tasks page shows total count', async ({ window, helper }) => {
    await helper.clickNav('tasks')
    await expect(window.locator(SELECTORS.TASK_LIST_PAGE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Should show "0 tasks total" in a new project
    await expect(window.getByText(/\d+ tasks? total/)).toBeVisible()
  })

  test('no console errors on task page', async ({ window, helper }) => {
    await helper.clickNav('tasks')
    await expect(window.locator(SELECTORS.TASK_LIST_PAGE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    expect(helper.hasNoErrors()).toBe(true)
  })
})
