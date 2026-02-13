import fs from 'fs'
import { execSync } from 'child_process'

export default async function globalTeardown() {
  // Remove temp data directory
  const testDataDir = process.env.GOLEMANCY_TEST_DATA_DIR
  if (testDataDir && fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true })
    console.log(`[e2e] Cleaned up test data dir: ${testDataDir}`)
  }

  // Kill lingering server processes — match the exact server entry path
  try {
    execSync("pkill -f 'packages/server/src/index\\.ts'", { stdio: 'ignore' })
  } catch {
    // No matching processes — expected
  }
}
