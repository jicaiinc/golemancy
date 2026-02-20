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
    // Navigate away first to ensure fresh component state
    await helper.navigateTo('/')
    await helper.navigateTo('/settings')
    // Current UI has 2 tabs: General and Providers
    await expect(window.locator('[data-testid="tab-general"]')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.locator('[data-testid="tab-providers"]')).toBeVisible()
  })

  test('providers tab shows PROVIDERS header', async ({ window, helper }) => {
    await helper.navigateTo('/')
    await helper.navigateTo('/settings')
    await window.locator('[data-testid="tab-providers"]').click()
    await expect(window.getByText('PROVIDERS', { exact: true })).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('providers tab shows configured providers', async ({ window, helper }) => {
    // Ensure settings are loaded with providers from server
    // loadSettings() runs on app startup but may not have completed yet
    await window.evaluate(async () => {
      const store = (window as any).__GOLEMANCY_STORE__
      // Force re-fetch settings from server to ensure providers are loaded
      await store.getState().loadSettings()
    })

    await helper.navigateTo('/')
    await helper.navigateTo('/settings')
    await window.locator('[data-testid="tab-providers"]').click()
    // Use span selector to target ProviderCard names (avoid hidden <option> in DefaultModel select)
    await expect(window.locator('span', { hasText: 'Anthropic' }).first()).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.locator('span', { hasText: 'OpenAI' }).first()).toBeVisible()
  })

  test('add provider button is visible', async ({ window, helper }) => {
    await helper.navigateTo('/')
    await helper.navigateTo('/settings')
    await window.locator('[data-testid="tab-providers"]').click()
    await expect(window.getByRole('button', { name: '+ Add Provider' })).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('add provider shows preset options', async ({ window, helper }) => {
    await helper.navigateTo('/')
    await helper.navigateTo('/settings')
    await window.locator('[data-testid="tab-providers"]').click()
    await expect(window.getByRole('button', { name: '+ Add Provider' })).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await window.getByRole('button', { name: '+ Add Provider' }).click()
    await expect(window.getByText('SELECT PROVIDER')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await expect(window.getByText('DeepSeek').first()).toBeVisible()
    await expect(window.getByText('Custom').first()).toBeVisible()
  })

  test('add preset provider creates a new provider card', async ({ window, helper }) => {
    await helper.navigateTo('/')
    await helper.navigateTo('/settings')
    await window.locator('[data-testid="tab-providers"]').click()
    await expect(window.getByRole('button', { name: '+ Add Provider' })).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await window.getByRole('button', { name: '+ Add Provider' }).click()
    await expect(window.getByText('SELECT PROVIDER')).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    // Click a preset that's guaranteed to not already exist
    await window.getByText('DeepSeek').first().click()
    // Should now show DeepSeek provider card
    await expect(window.getByText('DeepSeek').first()).toBeVisible()
  })

  test('custom provider flow', async ({ window, helper }) => {
    await helper.navigateTo('/')
    await helper.navigateTo('/settings')
    await window.locator('[data-testid="tab-providers"]').click()
    await expect(window.getByRole('button', { name: '+ Add Provider' })).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
    await window.getByRole('button', { name: '+ Add Provider' }).click()
    await window.getByText('Custom').click()
    // Should show custom provider form
    await expect(window.getByText('CUSTOM PROVIDER')).toBeVisible()
    await expect(window.getByText('SDK TYPE')).toBeVisible()
  })

  test('general tab is default', async ({ window, helper }) => {
    // Navigate away to force component remount and reset activeTab state
    await helper.navigateTo('/')
    await helper.navigateTo('/settings')
    const generalTab = window.locator('[data-testid="tab-general"]')
    await expect(generalTab).toHaveClass(/bg-surface/, { timeout: TIMEOUTS.PAGE_LOAD })
  })
})
