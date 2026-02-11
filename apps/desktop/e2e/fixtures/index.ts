import { electronFixtures, type ElectronFixtures } from './electron'
import { ConsoleLogger } from './console-logger'
import { TestHelper } from './test-helper'

export { ConsoleLogger, type LogEntry } from './console-logger'
export { StoreBridge } from './store-bridge'
export { TestHelper } from './test-helper'
export type { ElectronFixtures } from './electron'

type WorkerFixtures = ElectronFixtures & { consoleLogger: ConsoleLogger }

/**
 * Extended test with all E2E fixtures.
 *
 * - `electronApp` (worker-scoped) — the Electron application instance
 * - `window` (worker-scoped) — the first BrowserWindow page
 * - `consoleLogger` (worker-scoped) — single ConsoleLogger attached once per worker
 * - `helper` (test-scoped) — unified TestHelper, clears log entries between tests
 */
const withLogger = electronFixtures.extend<object, WorkerFixtures>({
  consoleLogger: [async ({ window }, use) => {
    const logger = new ConsoleLogger()
    logger.attach(window)
    await use(logger)
  }, { scope: 'worker' }],
})

export const test = withLogger.extend<{ helper: TestHelper }>({
  helper: async ({ window, consoleLogger }, use) => {
    const helper = new TestHelper(window, consoleLogger)
    await use(helper)
  },
})

export { expect } from '@playwright/test'
