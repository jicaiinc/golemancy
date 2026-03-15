import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Template Full — Categories, Detail & UI Flow', () => {
  test.beforeAll(async ({ helper }) => {
    await helper.goHome()

    // Ensure defaultModel is configured (required for template creation)
    const settings = await helper.apiGet('/api/settings')
    if (!settings.defaultModel) {
      await helper.apiPatch('/api/settings', {
        defaultModel: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
      })
    }
  })

  test('template selector shows all category filters', async ({ window }) => {
    await window.click(SELECTORS.CREATE_PROJECT_BTN)
    await expect(window.getByText('From Template')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await window.getByText('From Template').first().click()

    // "All" category should be visible
    await expect(window.locator(SELECTORS.TEMPLATE_CATEGORY_ALL)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Multiple templates should be listed
    await expect(window.getByText('Writing Assistant')).toBeVisible()
    await expect(window.getByText('Deep Research')).toBeVisible()
    await expect(window.getByText('Smart Secretary')).toBeVisible()

    await window.click(SELECTORS.CANCEL_BTN)
  })

  test('category filter narrows template list', async ({ window }) => {
    await window.click(SELECTORS.CREATE_PROJECT_BTN)
    await expect(window.getByText('From Template')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await window.getByText('From Template').first().click()

    // Click All to see all templates
    await window.locator(SELECTORS.TEMPLATE_CATEGORY_ALL).click()

    // At least 18 templates should be visible in "All"
    const allItems = window.locator('[data-testid^="template-item-"]')
    await expect(allItems.first()).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    const allCount = await allItems.count()
    expect(allCount).toBeGreaterThanOrEqual(18)

    await window.click(SELECTORS.CANCEL_BTN)
  })

  test('selecting template shows detail panel with description', async ({ window }) => {
    await window.click(SELECTORS.CREATE_PROJECT_BTN)
    await expect(window.getByText('From Template')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await window.getByText('From Template').first().click()

    // Click on Smart Secretary template
    await window.getByText('Smart Secretary').first().click()

    // Detail panel should appear with template info
    await expect(window.locator(SELECTORS.TEMPLATE_DETAIL_PANEL)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Name input should auto-fill
    await expect(window.locator(SELECTORS.PROJECT_NAME_INPUT)).toHaveValue('Smart Secretary')

    await window.click(SELECTORS.CANCEL_BTN)
  })

  test('selecting different template updates detail and name', async ({ window }) => {
    await window.click(SELECTORS.CREATE_PROJECT_BTN)
    await expect(window.getByText('From Template')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await window.getByText('From Template').first().click()

    // Select first template
    await window.getByText('Translator').first().click()
    await expect(window.locator(SELECTORS.PROJECT_NAME_INPUT)).toHaveValue('Translator')

    // Switch to another template (i18n display name is "Document Hub", raw name is "Doc Hub")
    await window.getByText('Document Hub').first().click()
    await expect(window.locator(SELECTORS.PROJECT_NAME_INPUT)).toHaveValue('Doc Hub')

    await window.click(SELECTORS.CANCEL_BTN)
  })

  test('UI flow: select template → create → enter project → verify agents in sidebar', async ({
    window,
    helper,
  }) => {
    await helper.goHome()
    await window.click(SELECTORS.CREATE_PROJECT_BTN)
    await expect(window.getByText('From Template')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Select "From Template" and pick Translator (simple: 1 agent, no team)
    await window.getByText('From Template').first().click()
    await window.getByText('Translator').first().click()

    // Customize name
    await window.locator(SELECTORS.PROJECT_NAME_INPUT).fill('E2E Template Flow Test')

    // Click create
    await window.click(SELECTORS.CONFIRM_BTN)

    // Should navigate into the project with sidebar visible
    await expect(window.locator(SELECTORS.SIDEBAR)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Navigate to agents to verify they were created
    await helper.clickNav('agents')
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // At least 1 agent should exist (from template)
    const agentCards = window.locator('[data-testid^="agent-item-"]')
    await expect(agentCards.first()).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
  })
})
