import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Skills Page', () => {
  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Skills Test Project')
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await helper.createAgent('Skills Test Agent')
  })

  test('navigate to skills page via sidebar', async ({ window, helper }) => {
    await helper.clickNav('skills')
    await expect(window.locator(SELECTORS.SKILLS_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('skills page shows header with count', async ({ window, helper }) => {
    await helper.clickNav('skills')
    await expect(window.locator(SELECTORS.SKILLS_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByRole('heading', { name: 'Skills' })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('empty state displayed when no skills', async ({ window, helper }) => {
    await helper.clickNav('skills')
    await expect(window.locator(SELECTORS.SKILLS_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('No skills yet')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('new skill button visible', async ({ window, helper }) => {
    await helper.clickNav('skills')
    await expect(window.locator(SELECTORS.SKILLS_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator(SELECTORS.SKILL_NEW_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })

  test('open skill form modal', async ({ window, helper }) => {
    await helper.clickNav('skills')
    await expect(window.locator(SELECTORS.SKILL_NEW_BTN)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    await window.locator(SELECTORS.SKILL_NEW_BTN).click()

    // Verify modal fields
    await expect(window.getByRole('heading', { name: 'New Skill' })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('NAME')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('DESCRIPTION')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('INSTRUCTIONS')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Close modal
    await window.getByText('Cancel').click()
  })

  test('tabs visible: installed and marketplace', async ({ window, helper }) => {
    await helper.clickNav('skills')
    await expect(window.locator(SELECTORS.SKILLS_PAGE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator(SELECTORS.SKILL_TAB_INSTALLED)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.locator(SELECTORS.SKILL_TAB_MARKETPLACE)).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })
})
