import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

test.describe('Settings', () => {
  test('settings page loads', async ({ window, helper }) => {
    await helper.navigateTo('/settings')
    await expect(window.locator('[data-testid="settings-form"]')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('settings tabs are visible', async ({ window, helper }) => {
    await helper.navigateTo('/settings')
    // Use getByRole to target tab buttons specifically (avoid strict mode violations)
    await expect(window.getByRole('button', { name: 'Providers' })).toBeVisible()
    await expect(window.getByRole('button', { name: 'Appearance' })).toBeVisible()
    await expect(window.getByRole('button', { name: 'Profile' })).toBeVisible()
    await expect(window.getByRole('button', { name: 'Paths' })).toBeVisible()
    await expect(window.getByRole('button', { name: 'General' })).toBeVisible()
  })

  test('provider section is visible', async ({ window, helper }) => {
    await helper.navigateTo('/settings')
    await expect(window.getByText('DEFAULT PROVIDER')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    // Use .first() to avoid strict mode violations when provider appears in multiple places
    await expect(window.getByText('OpenAI').first()).toBeVisible()
    await expect(window.getByText('Anthropic').first()).toBeVisible()
    await expect(window.getByText('Google').first()).toBeVisible()
  })
})
