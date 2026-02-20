import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Project Dashboard', () => {
  let projectId: string

  test.beforeAll(async ({ helper, window }) => {
    await helper.goHome()
    projectId = await helper.createProject('Dashboard Test')

    // Navigate to agents page and create one
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await window.locator(SELECTORS.CREATE_AGENT_BTN).waitFor({
      state: 'visible',
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await helper.createAgent('Dashboard Agent')
  })

  test('dashboard loads as project index page', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}`)

    // Token Summary Cards
    await expect(window.getByText('Total Tokens')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('Input Tokens')).toBeVisible()
    await expect(window.getByText('Output Tokens')).toBeVisible()
    await expect(window.getByText('API Calls')).toBeVisible()

    // TimeRangeSelector buttons
    await expect(window.getByText('Today')).toBeVisible()
    await expect(window.getByText('7 Days')).toBeVisible()
    await expect(window.getByText('30 Days')).toBeVisible()
    await expect(window.getByText('All Time')).toBeVisible()

    // Runtime Status section
    await expect(window.getByText('RUNTIME STATUS')).toBeVisible()

    // Overview section
    await expect(window.getByRole('heading', { name: 'AGENTS' })).toBeVisible()
    await expect(window.getByRole('heading', { name: 'RECENT CHATS' })).toBeVisible()
  })

  test('time range selector switches', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}`)
    await expect(window.getByText('Total Tokens')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // 'Today' should be active (primary variant → bg-accent-green)
    const todayBtn = window.getByText('Today', { exact: true })
    await expect(todayBtn).toHaveClass(/bg-accent-green/)

    // Click '7 Days'
    const sevenDaysBtn = window.getByText('7 Days', { exact: true })
    await sevenDaysBtn.click()

    // '7 Days' becomes active, 'Today' becomes ghost
    await expect(sevenDaysBtn).toHaveClass(/bg-accent-green/)
    await expect(todayBtn).toHaveClass(/bg-transparent/)
  })

  test('token breakdown tabs switch', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}`)
    await expect(window.getByText('Total Tokens')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Both tabs visible
    const byAgentTab = window.locator('[data-testid="tab-by-agent"]')
    const byModelTab = window.locator('[data-testid="tab-by-model"]')
    await expect(byAgentTab).toBeVisible()
    await expect(byModelTab).toBeVisible()

    // 'By Agent' is active by default
    await expect(byAgentTab).toHaveClass(/bg-surface/)

    // Click 'By Model'
    await byModelTab.click()

    // Verify 'By Model' tab becomes active
    await expect(byModelTab).toHaveClass(/bg-surface/)
    // Content: title if data exists, or "No data" for empty projects
    const hasTitle = await window.getByText('TOKEN BY MODEL').isVisible().catch(() => false)
    const hasNoData = await window.getByText('No data').isVisible().catch(() => false)
    expect(hasTitle || hasNoData).toBeTruthy()
  })

  test('runtime status tabs work', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}`)
    await expect(window.getByText('RUNTIME STATUS')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Runtime tabs exist
    const runningTab = window.locator('[data-testid="tab-running"]')
    const upcomingTab = window.locator('[data-testid="tab-upcoming"]')
    const recentTab = window.locator('[data-testid="tab-recent"]')
    await expect(runningTab).toBeVisible()
    await expect(upcomingTab).toBeVisible()
    await expect(recentTab).toBeVisible()

    // Click Upcoming tab
    await upcomingTab.click()
    await expect(window.getByText('No upcoming tasks')).toBeVisible()

    // Click Recent tab
    await recentTab.click()
    await expect(window.getByText('No recent items')).toBeVisible()
  })

  test('navigate to dashboard via sidebar', async ({ window, helper }) => {
    // Navigate away from dashboard first
    await helper.navigateTo(`/projects/${projectId}/agents`)
    await expect(window.locator(SELECTORS.CREATE_AGENT_BTN)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Navigate back via sidebar
    await helper.clickNav('dashboard')

    // Verify dashboard content loaded
    await expect(window.getByText('Total Tokens')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('RUNTIME STATUS')).toBeVisible()
  })

  test('overview agents section shows created agent', async ({ window, helper }) => {
    await helper.navigateTo(`/projects/${projectId}`)
    await expect(window.getByRole('heading', { name: 'AGENTS' })).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Agent name should appear in the overview
    await expect(window.getByText('Dashboard Agent')).toBeVisible()

    // Status badge should show 'idle' (multiple agents may have idle status)
    await expect(window.getByText('idle').first()).toBeVisible()
  })
})

test.describe('Global Dashboard', () => {
  test('global dashboard page loads', async ({ window, helper }) => {
    await helper.navigateTo('/dashboard')

    await expect(window.getByText('Global Dashboard')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await expect(window.getByText('Cross-project overview')).toBeVisible()

    // TimeRangeSelector visible
    await expect(window.getByText('Today')).toBeVisible()
    await expect(window.getByText('7 Days')).toBeVisible()

    // Runtime status
    await expect(window.getByText('RUNTIME STATUS')).toBeVisible()
  })

  test('global dashboard shows breakdown tabs', async ({ window, helper }) => {
    await helper.navigateTo('/dashboard')
    await expect(window.getByText('Global Dashboard')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // All three tabs visible
    const byProjectTab = window.locator('[data-testid="tab-by-project"]')
    const byModelTab = window.locator('[data-testid="tab-by-model"]')
    const byAgentTab = window.locator('[data-testid="tab-by-agent"]')
    await expect(byProjectTab).toBeVisible()
    await expect(byModelTab).toBeVisible()
    await expect(byAgentTab).toBeVisible()

    // Click 'By Model'
    await byModelTab.click()
    await expect(byModelTab).toHaveClass(/bg-surface/)

    // Click 'By Agent'
    await byAgentTab.click()
    await expect(byAgentTab).toHaveClass(/bg-surface/)
  })

  test('global dashboard shows top projects', async ({ window, helper }) => {
    await helper.navigateTo('/dashboard')
    await expect(window.getByText('Global Dashboard')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    await expect(window.getByText('TOP PROJECTS')).toBeVisible()
  })
})
