import fs from 'fs'

/**
 * Cleanup for onboarding tests — removes the onboarding temp data directory.
 */
export default function onboardingTeardown() {
  const testDataDir = process.env.GOLEMANCY_ONBOARDING_DATA_DIR
  if (testDataDir && fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true })
    console.log(`[e2e:onboarding] Cleaned up test data dir: ${testDataDir}`)
  }
}
