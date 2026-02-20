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

  // Fallback: read root .env and map standard keys to test keys
  const envRootPath = path.resolve(__dirname, '../../../.env')
  const envRoot = parseEnvFile(envRootPath)

  // .env.e2e.local takes priority, fallback to root .env (mapping KEY → TEST_KEY)
  const anthropicKey = envVars.TEST_ANTHROPIC_API_KEY || envRoot.ANTHROPIC_API_KEY
  const openaiKey = envVars.TEST_OPENAI_API_KEY || envRoot.OPENAI_API_KEY
  const googleKey = envVars.TEST_GOOGLE_API_KEY || envRoot.GOOGLE_API_KEY

  // Create temp data directory
  const testDataDir = path.join(os.tmpdir(), `golemancy-e2e-${process.pid}`)
  fs.mkdirSync(testDataDir, { recursive: true })

  // Seed settings.json in V2 Record format (GlobalSettings.providers: Record<string, ProviderEntry>)
  const providers: Record<string, {
    name: string
    sdkType: string
    apiKey?: string
    baseUrl?: string
    models: string[]
    testStatus?: string
  }> = {
    // Always seed Anthropic and OpenAI with dummy keys for smoke tests
    anthropic: {
      name: 'Anthropic',
      sdkType: 'anthropic',
      apiKey: anthropicKey || 'sk-ant-test-dummy-key',
      models: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-6'],
      testStatus: 'ok',
    },
    openai: {
      name: 'OpenAI',
      sdkType: 'openai',
      apiKey: openaiKey || 'sk-test-dummy-key',
      models: ['gpt-4o', 'gpt-4o-mini'],
      testStatus: 'ok',
    },
  }

  // Add real provider keys from env if available
  if (googleKey) {
    providers.google = {
      name: 'Google',
      sdkType: 'google',
      apiKey: googleKey,
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      testStatus: 'ok',
    }
  }

  const settings = {
    providers,
    // Use Google Gemini Flash when available (fastest/cheapest for tests)
    defaultModel: googleKey
      ? { provider: 'google', model: 'gemini-2.5-flash' }
      : { provider: 'anthropic', model: 'claude-sonnet-4-5' },
    theme: 'dark' as const,
  }

  fs.writeFileSync(
    path.join(testDataDir, 'settings.json'),
    JSON.stringify(settings, null, 2)
  )

  // Store path in env for tests to use
  process.env.GOLEMANCY_TEST_DATA_DIR = testDataDir

  // Export API keys to process.env for test availability checks
  if (anthropicKey && anthropicKey !== 'sk-ant-test-dummy-key') {
    process.env.TEST_ANTHROPIC_API_KEY = anthropicKey
  }
  if (openaiKey && openaiKey !== 'sk-test-dummy-key') {
    process.env.TEST_OPENAI_API_KEY = openaiKey
  }
  if (googleKey) {
    process.env.TEST_GOOGLE_API_KEY = googleKey
  }

  console.log(`[e2e] Test data dir: ${testDataDir}`)
  console.log(`[e2e] Providers configured: ${Object.keys(providers).join(', ') || 'none'}`)
}
