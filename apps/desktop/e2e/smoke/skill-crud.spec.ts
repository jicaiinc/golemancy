import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Skill CRUD', () => {
  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Skill CRUD Test')
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await helper.createAgent('Skill CRUD Agent')
  })

  test('create skill via UI', async ({ window, helper }) => {
    await helper.clickNav('skills')
    await expect(window.locator(SELECTORS.SKILLS_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Click new skill button
    await window.locator(SELECTORS.SKILL_NEW_BTN).click()

    // Modal should appear
    await expect(window.getByRole('heading', { name: 'New Skill' })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Fill in the form — NAME, DESCRIPTION, INSTRUCTIONS
    // NAME input — first input in the modal (autoFocus)
    const nameInput = window.locator('.flex.flex-col.gap-4 input').first()
    await nameInput.fill('Test Skill')

    // DESCRIPTION input — second input
    const descInput = window.locator('.flex.flex-col.gap-4 input').nth(1)
    await descInput.fill('A test skill for E2E')

    // INSTRUCTIONS textarea
    const instructionsArea = window.getByPlaceholder('Write skill instructions in markdown...')
    await instructionsArea.fill('# Test Instructions\nDo something useful.')

    // Save
    await window.getByRole('button', { name: 'Save' }).click()

    // Verify skill-card appears (use exact match to avoid substring match with description)
    await expect(window.locator(SELECTORS.SKILL_CARD)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator(SELECTORS.SKILL_CARD).getByText('Test Skill', { exact: true })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('tabs: switch between installed and marketplace', async ({ window, helper }) => {
    await helper.clickNav('skills')
    await expect(window.locator(SELECTORS.SKILLS_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Both tabs should be visible
    await expect(window.locator(SELECTORS.SKILL_TAB_INSTALLED)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator(SELECTORS.SKILL_TAB_MARKETPLACE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Switch to marketplace tab
    await window.locator(SELECTORS.SKILL_TAB_MARKETPLACE).click()
    await expect(window.getByText('Coming Soon')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Switch back to installed tab — skill card should still exist from previous test
    await window.locator(SELECTORS.SKILL_TAB_INSTALLED).click()
    await expect(window.locator(SELECTORS.SKILL_CARD)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('edit skill', async ({ window, helper }) => {
    await helper.clickNav('skills')
    await expect(window.locator(SELECTORS.SKILL_CARD)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Click Edit on the skill card
    await window.locator(SELECTORS.SKILL_CARD).getByRole('button', { name: 'Edit' }).first().click()

    // Modal should show "Edit Skill"
    await expect(window.getByRole('heading', { name: 'Edit Skill' })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Update name
    const nameInput = window.locator('.flex.flex-col.gap-4 input').first()
    await nameInput.fill('Updated Skill Name')

    // Save
    await window.getByRole('button', { name: 'Save' }).click()

    // Verify updated name (scope within card)
    await expect(window.locator(SELECTORS.SKILL_CARD).getByText('Updated Skill Name', { exact: true })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('delete skill', async ({ window, helper }) => {
    await helper.clickNav('skills')
    await expect(window.locator(SELECTORS.SKILL_CARD)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Click the × button on the skill card
    await window.locator(SELECTORS.SKILL_CARD).getByRole('button', { name: '×' }).first().click()

    // Verify empty state
    await expect(window.getByText('No skills yet')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })
})
