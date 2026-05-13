import fs from 'fs'
import os from 'os'
import path from 'path'

/**
 * Independent setup for onboarding tests.
 * Creates an empty data dir with minimal settings (no providers configured)
 * so the app launches into the onboarding flow.
 *
 * Stores the path in GOLEMANCY_ONBOARDING_DATA_DIR (separate from main tests).
 */
export default function onboardingSetup() {
  const testDataDir = path.join(os.tmpdir(), `golemancy-e2e-onboarding-${process.pid}`)
  fs.mkdirSync(testDataDir, { recursive: true })

  // Minimal settings — no providers, so onboarding is triggered
  const settings = {
    providers: {},
    theme: 'dark' as const,
  }

  fs.writeFileSync(
    path.join(testDataDir, 'settings.json'),
    JSON.stringify(settings, null, 2)
  )

  process.env.GOLEMANCY_ONBOARDING_DATA_DIR = testDataDir

  console.log(`[e2e:onboarding] Test data dir: ${testDataDir}`)
}
