import { test as base, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { MAIN_ENTRY, ROOT_DIR, TIMEOUTS } from '../constants'
import { getNodePath } from './platform'

export type OnboardingFixtures = {
  electronApp: ElectronApplication
  window: Page
}

/**
 * Onboarding-specific electron fixtures.
 * Uses GOLEMANCY_ONBOARDING_DATA_DIR (empty providers) so the app
 * launches into the onboarding flow instead of the main dashboard.
 */
export const onboardingFixtures = base.extend<object, OnboardingFixtures>({
  electronApp: [async ({}, use) => {
    const testDataDir = process.env.GOLEMANCY_ONBOARDING_DATA_DIR
    if (!testDataDir) {
      throw new Error('GOLEMANCY_ONBOARDING_DATA_DIR not set – did globalSetup run?')
    }

    const nodePath = getNodePath()

    const app = await _electron.launch({
      args: [MAIN_ENTRY],
      env: {
        ...process.env,
        GOLEMANCY_DATA_DIR: testDataDir,
        GOLEMANCY_FORK_EXEC_PATH: nodePath,
        GOLEMANCY_ROOT_DIR: ROOT_DIR,
        NODE_ENV: 'test',
      },
      timeout: TIMEOUTS.APP_LAUNCH,
    })

    await use(app)
    await app.close()
  }, { scope: 'worker' }],

  window: [async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()

    await page.waitForSelector('#root > *', {
      state: 'attached',
      timeout: TIMEOUTS.APP_READY,
    })

    await use(page)
  }, { scope: 'worker' }],
})

export const test = onboardingFixtures
export { expect } from '@playwright/test'
