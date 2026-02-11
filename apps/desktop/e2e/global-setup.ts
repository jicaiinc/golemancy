import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Parse a simple .env file (key=value lines, # comments, blank lines ignored).
 */
function parseEnvFile(filePath: string): Record<string, string> {
  const env: Record<string, string> = {}
  if (!fs.existsSync(filePath)) return env

  const content = fs.readFileSync(filePath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim()
    if (key) env[key] = value
  }
  return env
}

export default async function globalSetup() {
  // Read .env.e2e.local for API keys
  const envLocalPath = path.resolve(__dirname, '../.env.e2e.local')
  const envVars = parseEnvFile(envLocalPath)

  // Create temp data directory
  const testDataDir = path.join(os.tmpdir(), `solocraft-e2e-${process.pid}`)
  fs.mkdirSync(testDataDir, { recursive: true })

  // Seed settings.json matching FileSettingsStorage format (GlobalSettings)
  const providers: Array<{
    provider: string
    apiKey: string
    defaultModel: string
  }> = []

  if (envVars.TEST_GOOGLE_API_KEY) {
    providers.push({
      provider: 'google',
      apiKey: envVars.TEST_GOOGLE_API_KEY,
      defaultModel: 'gemini-2.0-flash',
    })
  }
  if (envVars.TEST_OPENAI_API_KEY) {
    providers.push({
      provider: 'openai',
      apiKey: envVars.TEST_OPENAI_API_KEY,
      defaultModel: 'gpt-4o-mini',
    })
  }
  if (envVars.TEST_ANTHROPIC_API_KEY) {
    providers.push({
      provider: 'anthropic',
      apiKey: envVars.TEST_ANTHROPIC_API_KEY,
      defaultModel: 'claude-sonnet-4-5-20250929',
    })
  }

  const settings = {
    providers,
    defaultProvider: envVars.TEST_ACTIVE_PROVIDER || 'google',
    theme: 'dark' as const,
    userProfile: {
      name: 'E2E Test User',
      email: 'e2e@test.local',
    },
    defaultWorkingDirectoryBase: '',
  }

  fs.writeFileSync(
    path.join(testDataDir, 'settings.json'),
    JSON.stringify(settings, null, 2)
  )

  // Store path in env for tests to use
  process.env.SOLOCRAFT_TEST_DATA_DIR = testDataDir

  console.log(`[e2e] Test data dir: ${testDataDir}`)
  console.log(`[e2e] Providers configured: ${providers.map((p) => p.provider).join(', ') || 'none'}`)
}
