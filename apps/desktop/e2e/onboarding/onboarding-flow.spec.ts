import { test, expect } from '../fixtures/onboarding'
import { SELECTORS, TIMEOUTS } from '../constants'

test.describe('Onboarding Flow', () => {
  test('Welcome step renders with logo and Get Started button', async ({ window }) => {
    // Onboarding page should be visible (empty providers → triggers onboarding)
    await expect(window.locator(SELECTORS.ONBOARDING_PAGE)).toBeVisible({
      timeout: TIMEOUTS.APP_READY,
    })

    // Welcome step is the initial step
    await expect(window.locator(SELECTORS.ONBOARDING_WELCOME_STEP)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Get Started button should be visible
    await expect(window.locator(SELECTORS.ONBOARDING_GET_STARTED_BTN)).toBeVisible()

    // Skip button should be visible on non-final steps
    await expect(window.locator(SELECTORS.ONBOARDING_SKIP_BTN)).toBeVisible()
  })

  test('Welcome step has language selector', async ({ window }) => {
    await expect(window.locator(SELECTORS.ONBOARDING_WELCOME_STEP)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Language dropdown should show "English" by default
    await expect(window.getByText('English')).toBeVisible()
  })

  test('Get Started navigates to Provider step', async ({ window }) => {
    await expect(window.locator(SELECTORS.ONBOARDING_WELCOME_STEP)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Click Get Started
    await window.locator(SELECTORS.ONBOARDING_GET_STARTED_BTN).click()

    // Provider step should appear
    await expect(window.locator(SELECTORS.ONBOARDING_PROVIDER_STEP)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('Provider step shows preset provider grid', async ({ window }) => {
    // Navigate to Provider step (don't rely on previous test state)
    const welcomeStep = window.locator(SELECTORS.ONBOARDING_WELCOME_STEP)
    if (await welcomeStep.isVisible().catch(() => false)) {
      await window.locator(SELECTORS.ONBOARDING_GET_STARTED_BTN).click()
    }
    await expect(window.locator(SELECTORS.ONBOARDING_PROVIDER_STEP)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Provider grid should show well-known providers (use exact match to avoid duplicates)
    await expect(window.getByText('Anthropic', { exact: true }).first()).toBeVisible()
    await expect(window.getByText('OpenAI', { exact: true }).first()).toBeVisible()
    await expect(window.getByText('Google', { exact: true }).first()).toBeVisible()
  })

  test('Provider step: selecting a preset shows API key input', async ({ window }) => {
    // Navigate to Provider step if needed
    const welcomeStep = window.locator(SELECTORS.ONBOARDING_WELCOME_STEP)
    if (await welcomeStep.isVisible().catch(() => false)) {
      await window.locator(SELECTORS.ONBOARDING_GET_STARTED_BTN).click()
    }
    await expect(window.locator(SELECTORS.ONBOARDING_PROVIDER_STEP)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Click on Anthropic provider (use first() to avoid strict mode with duplicate text)
    await window.getByText('Anthropic', { exact: true }).first().click()

    // API key input should appear
    await expect(window.locator(SELECTORS.ONBOARDING_API_KEY_INPUT)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Test Connection button should appear
    await expect(window.locator(SELECTORS.ONBOARDING_TEST_PROVIDER_BTN)).toBeVisible()
  })

  test('Back button returns to Welcome step from Provider step', async ({ window }) => {
    // Navigate to Provider step if needed
    const welcomeStep = window.locator(SELECTORS.ONBOARDING_WELCOME_STEP)
    if (await welcomeStep.isVisible().catch(() => false)) {
      await window.locator(SELECTORS.ONBOARDING_GET_STARTED_BTN).click()
    }
    await expect(window.locator(SELECTORS.ONBOARDING_PROVIDER_STEP)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Back button should be visible
    await expect(window.locator(SELECTORS.ONBOARDING_BACK_BTN)).toBeVisible()

    // Click Back
    await window.locator(SELECTORS.ONBOARDING_BACK_BTN).click()

    // Should return to Welcome step
    await expect(window.locator(SELECTORS.ONBOARDING_WELCOME_STEP)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })

  test('Skip button completes onboarding and goes to project list', async ({ window }) => {
    // Navigate back to a non-final step first
    await expect(window.locator(SELECTORS.ONBOARDING_WELCOME_STEP)).toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Skip button should be visible
    await expect(window.locator(SELECTORS.ONBOARDING_SKIP_BTN)).toBeVisible()

    // Click Skip
    await window.locator(SELECTORS.ONBOARDING_SKIP_BTN).click()

    // Should navigate away from onboarding — project list or empty state
    // The app should show the main layout (app shell / create project button)
    await expect(window.locator(SELECTORS.ONBOARDING_PAGE)).not.toBeVisible({
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  })
})
