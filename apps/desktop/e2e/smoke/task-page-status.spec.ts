import { test, expect } from '../fixtures'

/**
 * Task page status tests.
 *
 * The TaskListPage component exists but is NOT routed in routes.tsx.
 * There is no sidebar nav entry for tasks, and no /tasks route under ProjectLayout.
 * The server API at /api/projects/:pid/tasks exists and works, but the UI surface
 * is not accessible.
 *
 * These tests are marked as fixme until the task page is re-integrated into navigation.
 */
test.describe('Task Page Status', () => {
  test.fixme('task page should be accessible via route', async () => {
    // routes.tsx does not include a 'tasks' route under ProjectLayout.
    // When the task page is re-added, this test should:
    // 1. Navigate to /projects/:pid/tasks
    // 2. Verify TASK_LIST_PAGE selector is visible
    // 3. Verify empty state renders
  })

  test.fixme('task page should be accessible via sidebar navigation', async () => {
    // No nav-tasks sidebar link exists in the current UI.
    // When re-added, this test should call helper.clickNav('tasks')
    // and verify the task list page renders.
  })

  test('task API endpoint exists and responds', async ({ helper }) => {
    await helper.goHome()
    const project = await helper.createProjectViaApi('Task Status Test')

    // The server API works even though the UI route doesn't exist
    const response = await helper.apiGetRaw(`/api/projects/${project.id}/tasks`)
    expect(response.status()).toBe(200)
  })
})
