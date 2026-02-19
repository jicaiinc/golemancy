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
    await expect(window.getByRole('button', { name: 'Providers' })).toBeVisible()
    await expect(window.getByRole('button', { name: 'Appearance' })).toBeVisible()
    await expect(window.getByRole('button', { name: 'Profile' })).toBeVisible()
    await expect(window.getByRole('button', { name: 'Paths' })).toBeVisible()
  })

  test('providers section shows PROVIDERS header', async ({ window, helper }) => {
    await helper.navigateTo('/settings')
    // Use exact match to avoid matching the tab button "Providers" and empty state text
    await expect(window.getByText('PROVIDERS', { exact: true })).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('providers section shows configured providers from seed data', async ({ window, helper }) => {
    await helper.navigateTo('/settings')
    // E2E seed data includes Anthropic and OpenAI providers
    await expect(window.getByText('Anthropic').first()).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.getByText('OpenAI').first()).toBeVisible()
  })

  test('add provider button is visible', async ({ window, helper }) => {
    await helper.navigateTo('/settings')
    // Use role to avoid matching the empty state text that also mentions "+ Add Provider"
    await expect(window.getByRole('button', { name: '+ Add Provider' })).toBeVisible()
  })

  test('add provider shows preset options', async ({ window, helper }) => {
    await helper.navigateTo('/settings')
    await window.getByRole('button', { name: '+ Add Provider' }).click()
    // Should show preset provider options
    await expect(window.getByText('SELECT PROVIDER')).toBeVisible()
    await expect(window.getByText('Google').first()).toBeVisible()
    await expect(window.getByText('DeepSeek')).toBeVisible()
    await expect(window.getByText('Custom')).toBeVisible()
  })

  test('add preset provider creates a new provider card', async ({ window, helper }) => {
    await helper.navigateTo('/settings')
    await window.getByRole('button', { name: '+ Add Provider' }).click()
    await window.getByText('Google').first().click()
    // Should now show Google provider card
    await expect(window.getByText('Google').first()).toBeVisible()
    // Should show status indicator (no key = ⚪ No Key)
    await expect(window.getByText('No Key').first()).toBeVisible()
  })

  test('provider card shows model count', async ({ window, helper }) => {
    await helper.navigateTo('/settings')
    // Seed providers have models (e.g. Anthropic has 3)
    await expect(window.getByText(/Models \(\d+\)/).first()).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('expand models shows model list', async ({ window, helper }) => {
    await helper.navigateTo('/settings')
    // Click on the Models section to expand it
    const modelsButton = window.getByText(/Models \(\d+\)/).first()
    await modelsButton.click()
    // Should see model names and Add Model button
    await expect(window.getByText('+ Add Model').first()).toBeVisible()
  })

  test('custom provider flow', async ({ window, helper }) => {
    await helper.navigateTo('/settings')
    await window.getByRole('button', { name: '+ Add Provider' }).click()
    await window.getByText('Custom').click()
    // Should show custom provider form
    await expect(window.getByText('CUSTOM PROVIDER')).toBeVisible()
    await expect(window.getByText('SDK TYPE')).toBeVisible()
  })
})
