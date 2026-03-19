import fs from 'fs'
import onboardingTeardown from './onboarding-teardown'
import { killLingeringServers } from './fixtures/platform'

export default async function globalTeardown() {
  // Remove temp data directory
  const testDataDir = process.env.GOLEMANCY_TEST_DATA_DIR
  if (testDataDir && fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true })
    console.log(`[e2e] Cleaned up test data dir: ${testDataDir}`)
  }

  // Clean up onboarding data dir
  onboardingTeardown()

  // Kill lingering server processes (cross-platform)
  killLingeringServers()
}
