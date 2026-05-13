import { defineConfig } from 'vitest/config'
import path from 'node:path'
import fs from 'node:fs'

/**
 * Auto-detect bundled runtime path for live tests.
 * Sets GOLEMANCY_RESOURCES_PATH so that getBundledPythonPath() / getBundledNodeBinDir()
 * can find the downloaded runtimes in apps/desktop/resources/runtime/.
 */
function detectResourcesPath(): Record<string, string> {
  // Already set externally (e.g., by Electron or CI) — respect it
  if (process.env.GOLEMANCY_RESOURCES_PATH) return {}

  const resourcesDir = path.resolve(__dirname, '../../apps/desktop/resources')
  const runtimeDir = path.join(resourcesDir, 'runtime')
  if (fs.existsSync(runtimeDir)) {
    return { GOLEMANCY_RESOURCES_PATH: resourcesDir }
  }
  return {}
}

export default defineConfig({
  test: {
    include: ['src/**/*.live.test.ts'],
    envDir: '../../',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: detectResourcesPath(),
  },
})
