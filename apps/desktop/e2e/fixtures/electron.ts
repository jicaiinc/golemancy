import { execSync } from 'child_process'
import { test as base, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { MAIN_ENTRY, ROOT_DIR, SELECTORS, TIMEOUTS } from '../constants'

export type ElectronFixtures = {
  electronApp: ElectronApplication
  window: Page
}

/**
 * Worker-scoped fixtures for Electron app lifecycle.
 * The app is launched once per worker and shared across tests.
 */
export const electronFixtures = base.extend<object, ElectronFixtures>({
  electronApp: [async ({}, use) => {
    const testDataDir = process.env.GOLEMANCY_TEST_DATA_DIR
    if (!testDataDir) {
      throw new Error('GOLEMANCY_TEST_DATA_DIR not set – did globalSetup run?')
    }

    // Resolve absolute path to node — Electron GUI processes on macOS
    // don't inherit shell PATH, so bare 'node' would fail in fork().
    const nodePath = execSync('which node', { encoding: 'utf-8' }).trim()

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

    // Wait for the React app to render (root div has children).
    // Note: app-shell only exists within ProjectLayout, but the app starts at /
    await page.waitForSelector('#root > *', {
      state: 'attached',
      timeout: TIMEOUTS.APP_READY,
    })

    await use(page)
  }, { scope: 'worker' }],
})
