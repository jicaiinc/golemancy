import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

test.describe('Dashboard', () => {
  test('dashboard page loads', async ({ window, helper }) => {
    await helper.navigateTo('/dashboard')
    await expect(window.getByText('Dashboard').first()).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('dashboard has overview section', async ({ window, helper }) => {
    await helper.navigateTo('/dashboard')

    // Should show overview tab button
    await expect(window.locator('button', { hasText: 'Overview' }).first()).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Should have section headers
    await expect(window.getByText('Active Agents').first()).toBeVisible()
    await expect(window.getByText('Recent Tasks').first()).toBeVisible()
    await expect(window.getByText('Recent Activity').first()).toBeVisible()
  })

  test('dashboard tabs work', async ({ window, helper }) => {
    await helper.navigateTo('/dashboard')

    // Wait for Overview tab to be visible first
    await expect(window.locator('button', { hasText: 'Overview' }).first()).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Click "All Agents" tab
    await window.locator('button', { hasText: 'All Agents' }).first().click()
    // Wait for the tab content to change
    await expect(window.locator('button', { hasText: 'All Agents' }).first()).toBeVisible()

    // Switch back to "Overview"
    await window.locator('button', { hasText: 'Overview' }).first().click()

    // Overview sections should be visible again
    await expect(window.getByText('Active Agents').first()).toBeVisible()
  })
})
