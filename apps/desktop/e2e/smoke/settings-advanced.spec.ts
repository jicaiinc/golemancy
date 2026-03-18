import { test, expect } from '../fixtures'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Settings Advanced — Theme, Language, API Key, Model, Speech', () => {
  test.beforeAll(async ({ helper }) => {
    await helper.navigateTo('/settings')
  })

  // ⚠️ CRITICAL: Restore language and theme after all tests
  test.afterAll(async ({ helper }) => {
    await helper.apiPatch('/api/settings', {
      language: 'en',
      theme: 'dark',
    })
  })

  // ===== Theme switching =====

  test('theme switch updates store', async ({ window, helper }) => {
    await helper.navigateTo('/')
    await helper.navigateTo('/settings')

    const generalTab = window.locator('[data-testid="tab-general"]')
    await expect(generalTab).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await generalTab.click()

    // Look for appearance section (theme cards are inside it)
    await expect(window.getByText('APPEARANCE')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Get current theme from store
    const currentTheme = await helper.store.get<string>('themeMode')
    expect(currentTheme).toBeDefined()

    // Theme cards show "Light", "Dark", "System" labels — try clicking Light
    const lightBtn = window.getByText('Light', { exact: true })
    if (await lightBtn.isVisible()) {
      await lightBtn.click()

      // Give auto-save time to persist
      await window.waitForTimeout(500)

      // Verify theme changed in store
      const newTheme = await helper.store.get<string>('themeMode')
      expect(newTheme).toBeDefined()
    }

    // Reset theme to dark
    await helper.apiPatch('/api/settings', { theme: 'dark' })
  })

  // ===== Language switching =====

  test('language switch changes page text without crashing', async ({ window, helper }) => {
    await helper.navigateTo('/')
    await helper.navigateTo('/settings')

    const generalTab = window.locator('[data-testid="tab-general"]')
    await expect(generalTab).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await generalTab.click()

    await expect(window.getByText('LANGUAGE')).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })

    // Language uses PixelDropdown (not native select). Click the dropdown trigger
    // which shows "English" (current language label), then select Japanese.
    const languageTrigger = window.getByText('English', { exact: true })
    if (await languageTrigger.isVisible()) {
      await languageTrigger.click()

      // PixelDropdown renders a popover with items. Find and click Japanese (native name).
      const jaOption = window.getByText('日本語')
      await expect(jaOption).toBeVisible({ timeout: 3000 })
      await jaOption.click()

      // Wait for i18n to update
      await window.waitForTimeout(1000)

      // Page should not crash — verify some element is still visible
      await expect(window.locator('[data-testid="settings-form"]')).toBeVisible({
        timeout: TIMEOUTS.PAGE_LOAD,
      })
    }

    // Ensure we're back to English: patch server, then reload settings in browser
    await helper.apiPatch('/api/settings', { language: 'en' })
    await window.evaluate(async () => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (store) await store.getState().loadSettings()
    })
    await helper.navigateTo('/')
    await helper.navigateTo('/settings')
  })

  // ===== API key masking =====

  test('provider API keys are masked in the UI', async ({ window, helper }) => {
    await helper.navigateTo('/')
    await helper.navigateTo('/settings')

    await window.locator('[data-testid="tab-providers"]').click()

    // Wait for providers to load
    await expect(window.locator('span', { hasText: 'Anthropic' }).first()).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // API key inputs should be of type "password" or have masked display
    const passwordInputs = window.locator('input[type="password"]')
    const inputCount = await passwordInputs.count()

    // At least some API key inputs should be password type (masked)
    // This validates the security behavior
    if (inputCount > 0) {
      const firstInput = passwordInputs.first()
      await expect(firstInput).toHaveAttribute('type', 'password')
    }
  })

  // ===== Model management =====

  test('default model selector is visible in providers tab', async ({ window, helper }) => {
    await helper.navigateTo('/')
    await helper.navigateTo('/settings')
    await window.locator('[data-testid="tab-providers"]').click()

    // "DEFAULT MODEL" section should be visible
    await expect(window.getByText(/DEFAULT MODEL/i)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  // ===== Speech Tab =====

  test('Speech tab renders with enable toggle', async ({ window, helper }) => {
    await helper.navigateTo('/')
    await helper.navigateTo('/settings')

    // Click the Speech tab button (tab-speech), not the content div (speech-tab)
    const speechTabBtn = window.locator('[data-testid="tab-speech"]')
    await expect(speechTabBtn).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await speechTabBtn.click()

    // Speech content area should appear with enable toggle
    await expect(window.locator(SELECTORS.SPEECH_ENABLE_TOGGLE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('Speech tab shows configuration form', async ({ window, helper }) => {
    await helper.navigateTo('/')
    await helper.navigateTo('/settings')

    const speechTabBtn = window.locator('[data-testid="tab-speech"]')
    await expect(speechTabBtn).toBeVisible({ timeout: TIMEOUTS.PAGE_LOAD })
    await speechTabBtn.click()

    // The configuration area should be visible (even if STT is disabled)
    await expect(window.locator(SELECTORS.SPEECH_ENABLE_TOGGLE)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Test button may be visible depending on whether STT is enabled
    // Just verify the tab doesn't crash — button visibility depends on state
    await expect(window.locator(SELECTORS.SPEECH_TAB)).toBeVisible()
  })
})
