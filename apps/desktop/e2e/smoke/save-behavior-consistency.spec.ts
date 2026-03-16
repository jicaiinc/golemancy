import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Save Behavior Consistency', () => {
  let projectId: string
  let agentId: string
  let skillId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Save Behavior Test')

    // Create agent via UI
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    agentId = await helper.createAgent('Save Test Agent', 'Agent for save behavior testing.')

    // Create a skill via API for the skills tab test
    const skill = await helper.apiPost(`/api/projects/${projectId}/skills`, {
      name: 'E2E Save Test Skill',
      description: 'Skill for save behavior test',
      instructions: 'Test instructions for save behavior.',
    })
    skillId = skill.id

    // Navigate to agent detail
    await window.evaluate(() => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (store) store.getState().clearProject()
    })
    await helper.navigateTo(`/projects/${projectId}/agents/${agentId}`)
    await expect(window.getByText('Save Test Agent')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  // Track original theme for restoration
  let originalTheme: string

  test.afterAll(async ({ helper, window }) => {
    // Restore theme and language to defaults if changed
    if (originalTheme) {
      await window.evaluate((theme: string) => {
        const store = (window as any).__GOLEMANCY_STORE__
        if (store) store.getState().setTheme(theme)
      }, originalTheme)
    }
  })

  test('Skills tab: assign triggers auto-save', async ({ window, helper }) => {
    // Switch to Skills tab
    await window.locator('[data-testid="tab-skills"]').click()
    await expect(window.getByText('ASSIGNED SKILLS')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Click the assign button for our skill
    await window.locator(SELECTORS.SKILL_ASSIGN_BTN(skillId)).click()

    // Wait for store to reflect the skill assignment (auto-save — no Save button click)
    await helper.store.waitFor(
      `state.agents.find(a => a.id === '${agentId}')?.skillIds?.includes('${skillId}')`,
      TIMEOUTS.PAGE_LOAD,
    )

    // Verify skill appears in assigned list
    await expect(window.locator(SELECTORS.SKILL_ASSIGNED(skillId))).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('Tools tab: toggle triggers auto-save', async ({ window, helper }) => {
    // Switch to Tools tab
    await window.locator('[data-testid="tab-tools"]').click()
    await expect(window.getByText('BUILT-IN TOOLS')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // bash is enabled by default — toggle it OFF
    const bashToggle = window.locator(SELECTORS.TOOL_TOGGLE('bash'))
    await expect(bashToggle).toBeVisible()
    await bashToggle.click()

    // Wait for store to reflect bash toggled off (auto-save — no Save button click)
    await helper.store.waitFor(
      `state.agents.find(a => a.id === '${agentId}')?.builtinTools?.bash === false`,
      TIMEOUTS.PAGE_LOAD,
    )

    // Toggle bash back ON
    await bashToggle.click()

    // Wait for store to reflect the revert
    await helper.store.waitFor(
      `state.agents.find(a => a.id === '${agentId}')?.builtinTools?.bash === true`,
      TIMEOUTS.PAGE_LOAD,
    )
  })

  test('General tab: edit requires explicit Save click', async ({ window, helper }) => {
    // Switch to General tab
    await window.locator('[data-testid="tab-general"]').click()

    // Find the agent name input by label
    const nameField = window.getByLabel('AGENT NAME')
    await expect(nameField).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Change the name
    await nameField.fill('Save Test Agent Renamed')

    // Wait a moment — store should NOT have updated yet (explicit save required)
    await window.waitForTimeout(1000)

    const agentBeforeSave = await window.evaluate((aid: string) => {
      const store = (window as any).__GOLEMANCY_STORE__
      return store?.getState()?.agents?.find((a: any) => a.id === aid)
    }, agentId)

    // Name in store should still be the old value
    expect(agentBeforeSave.name).toBe('Save Test Agent')

    // Now click Save (use testid for reliability)
    const saveBtn = window.locator('[data-testid="save-btn"]')
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    // Wait for the saved indicator
    await helper.store.waitFor(
      `state.agents.find(a => a.id === '${agentId}')?.name === 'Save Test Agent Renamed'`,
      TIMEOUTS.PAGE_LOAD,
    )

    // Verify store updated
    const agentAfterSave = await window.evaluate((aid: string) => {
      const store = (window as any).__GOLEMANCY_STORE__
      return store?.getState()?.agents?.find((a: any) => a.id === aid)
    }, agentId)

    expect(agentAfterSave.name).toBe('Save Test Agent Renamed')

    // Rename back for other tests
    await nameField.fill('Save Test Agent')
    await saveBtn.click()
    await helper.store.waitFor(
      `state.agents.find(a => a.id === '${agentId}')?.name === 'Save Test Agent'`,
      TIMEOUTS.PAGE_LOAD,
    )
  })

  test('Model Config tab: edit requires explicit Save click', async ({ window, helper }) => {
    // Switch to Model Config tab
    await window.locator('[data-testid="tab-model-config"]').click()
    await expect(window.getByText('MODEL CONFIG', { exact: true })).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // The compact threshold control should be visible
    await expect(window.getByText('COMPACT THRESHOLD')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Read the current compactThreshold value from store
    const agentBefore = await window.evaluate((aid: string) => {
      const store = (window as any).__GOLEMANCY_STORE__
      return store?.getState()?.agents?.find((a: any) => a.id === aid)
    }, agentId)
    const originalThreshold = agentBefore?.compactThreshold

    // Find the compact threshold text input (type="text", not type="number")
    const thresholdInput = window.locator('input[type="text"]').first()
    await expect(thresholdInput).toBeVisible()

    // Focus and change the value
    const newValue = (originalThreshold ?? 800000) === 800000 ? '400000' : '800000'
    await thresholdInput.click()
    await thresholdInput.fill(newValue)
    // Blur to apply the input
    await thresholdInput.blur()

    // Wait — store should NOT have updated yet (explicit save required)
    await window.waitForTimeout(1000)

    const agentBeforeSave = await window.evaluate((aid: string) => {
      const store = (window as any).__GOLEMANCY_STORE__
      return store?.getState()?.agents?.find((a: any) => a.id === aid)
    }, agentId)
    // compactThreshold in store should still be the original value
    expect(agentBeforeSave.compactThreshold).toBe(originalThreshold)

    // Now click Save
    const saveBtn = window.getByRole('button', { name: /^Save$|^save$/i }).first()
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    // Wait for the save to complete
    await helper.store.waitFor(
      `state.agents.find(a => a.id === '${agentId}')?.compactThreshold === ${newValue}`,
      TIMEOUTS.PAGE_LOAD,
    )

    // Verify store updated to the new value
    const agentAfterSave = await window.evaluate((aid: string) => {
      const store = (window as any).__GOLEMANCY_STORE__
      return store?.getState()?.agents?.find((a: any) => a.id === aid)
    }, agentId)
    expect(agentAfterSave.compactThreshold).toBe(Number(newValue))
  })

  test('Project default agent: select triggers auto-save', async ({ helper, window }) => {
    // Navigate to project settings
    await helper.navigateTo(`/projects/${projectId}/settings`)
    await window.waitForTimeout(1000)

    // The General tab should be visible with the default agent selector
    // Find the select element for default target
    const select = window.locator('select').first()
    await expect(select).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Select our agent as the default
    await select.selectOption(agentId)

    // Verify via API that the project was auto-saved (no Save button for this)
    // Wait a moment for the auto-save to complete
    await window.waitForTimeout(2000)

    const project = await helper.apiGet(`/api/projects/${projectId}`)
    expect(project.defaultTargetId).toBe(agentId)
    expect(project.defaultTargetType).toBe('agent')
  })

  test('Global theme: switch triggers auto-save', async ({ window, helper }) => {
    // Record original theme for afterAll restoration
    originalTheme = await window.evaluate(() => {
      const store = (window as any).__GOLEMANCY_STORE__
      return store?.getState()?.themeMode ?? 'dark'
    })

    // Navigate to global settings
    await helper.navigateTo('/settings')
    await window.waitForTimeout(1000)

    // Click the theme button via UI (not store)
    const targetTheme = originalTheme === 'dark' ? 'Light' : 'Dark'
    const targetThemeValue = targetTheme.toLowerCase()
    await window.getByText(targetTheme, { exact: true }).click()

    // Verify the store updated via auto-save
    await helper.store.waitFor(
      `state.themeMode === '${targetThemeValue}'`,
      TIMEOUTS.PAGE_LOAD,
    )

    const newTheme = await window.evaluate(() => {
      const store = (window as any).__GOLEMANCY_STORE__
      return store?.getState()?.themeMode
    })
    expect(newTheme).toBe(targetThemeValue)

    // Restore original theme via UI click
    const restoreLabel = originalTheme === 'dark' ? 'Dark' : originalTheme === 'light' ? 'Light' : 'System'
    await window.getByText(restoreLabel, { exact: true }).click()

    // Verify restoration
    await helper.store.waitFor(
      `state.themeMode === '${originalTheme}'`,
      TIMEOUTS.PAGE_LOAD,
    )
    const restoredTheme = await window.evaluate(() => {
      const store = (window as any).__GOLEMANCY_STORE__
      return store?.getState()?.themeMode
    })
    expect(restoredTheme).toBe(originalTheme)
  })
})
