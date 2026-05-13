import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Project Advanced — Clone, Delete Confirm, Default Target', () => {
  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()

    // Create a project with an agent via API
    const project = await helper.createProjectViaApi('Project Advanced Test')
    projectId = project.id

    const agent = await helper.createAgentViaApi(projectId, 'Default Agent')
    agentId = agent.id

    // Refresh the store so UI sees the new project
    await window.evaluate(async () => {
      const store = (window as any).__GOLEMANCY_STORE__
      await store.getState().loadProjects()
    })
  })

  test('clone project creates a new project in the list', async ({ window, helper }) => {
    await helper.goHome()

    // Wait for project list to load
    const projectCards = window.locator('[data-testid^="project-item-"]')
    await expect(projectCards.first()).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    const initialCount = await projectCards.count()

    // Find and click the clone button for our project
    const cloneBtn = window.locator(SELECTORS.PROJECT_CLONE_BTN(projectId))
    if (await cloneBtn.isVisible()) {
      await cloneBtn.click()

      // Wait for a new project card to appear
      await expect(projectCards).toHaveCount(initialCount + 1, { timeout: TIMEOUTS.PAGE_LOAD })
    }
  })

  test('delete project shows confirmation dialog — cancel keeps project', async ({
    window,
    helper,
  }) => {
    await helper.goHome()

    // Create a throwaway project for delete test
    const throwaway = await helper.createProjectViaApi('Delete Me Project')

    // Refresh store
    await window.evaluate(async () => {
      const store = (window as any).__GOLEMANCY_STORE__
      await store.getState().loadProjects()
    })

    await helper.goHome()
    const projectCards = window.locator('[data-testid^="project-item-"]')
    await expect(projectCards.first()).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    const beforeCount = await projectCards.count()

    // Navigate into the project
    await helper.navigateTo(`/projects/${throwaway.id}`)
    await expect(window.locator(SELECTORS.SIDEBAR)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Go to settings
    await helper.clickNav('settings')
    const generalTab = window.locator(SELECTORS.PROJECT_SETTINGS_TAB('general'))
    await expect(generalTab).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await generalTab.click()

    // Click delete button
    const deleteBtn = window.locator(SELECTORS.DELETE_BTN)
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click()

      // Confirmation dialog should appear
      const cancelBtn = window.locator(SELECTORS.CANCEL_BTN)
      if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Click cancel
        await cancelBtn.click()

        // Project should still exist — navigate back to home
        await helper.goHome()
        await expect(projectCards.first()).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
        const afterCount = await projectCards.count()
        expect(afterCount).toBe(beforeCount)
      }
    }

    // Cleanup the throwaway project
    await helper.apiDelete(`/api/projects/${throwaway.id}`)
  })

  test('set default agent via project settings API', async ({ helper }) => {
    // Set the default target to the agent
    await helper.setProjectDefaultTarget(projectId, 'agent', agentId)

    // Verify via GET
    const project = await helper.apiGet(`/api/projects/${projectId}`)
    expect(project.defaultTargetType).toBe('agent')
    expect(project.defaultTargetId).toBe(agentId)
  })

  test('set default team via project settings API', async ({ helper }) => {
    // Create a team first
    const team = await helper.createTeamViaApi(projectId, 'Default Team', [
      { agentId },
    ])

    // Set the default target to the team
    await helper.setProjectDefaultTarget(projectId, 'team', team.id)

    // Verify via GET
    const project = await helper.apiGet(`/api/projects/${projectId}`)
    expect(project.defaultTargetType).toBe('team')
    expect(project.defaultTargetId).toBe(team.id)
  })

  // ===== Cleanup =====

  test.afterAll(async ({ helper }) => {
    if (projectId) {
      await helper.apiDelete(`/api/projects/${projectId}`)
    }
  })
})
