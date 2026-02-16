import fs from 'node:fs'
import path from 'node:path'
import { describe } from 'vitest'
import type { GlobalSettings, AIProvider, ProviderConfig } from '@golemancy/shared'

/** Monorepo root — two levels up from packages/server/ */
const ROOT_DIR = path.resolve(__dirname, '../../../../')

/**
 * Read root `.env` and build a `GlobalSettings` object for live tests.
 * Returns `null` when no API key is available.
 */
export function loadLiveSettings(): GlobalSettings | null {
  const envPath = path.join(ROOT_DIR, '.env')
  if (!fs.existsSync(envPath)) return null

  const env: Record<string, string> = {}
  const content = fs.readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
  }

  const providers: ProviderConfig[] = []

  if (env.OPENAI_API_KEY) {
    providers.push({
      provider: 'openai',
      apiKey: env.OPENAI_API_KEY,
      defaultModel: env.OPENAI_MODEL || 'gpt-4o-mini',
    })
  }
  if (env.ANTHROPIC_API_KEY) {
    providers.push({
      provider: 'anthropic',
      apiKey: env.ANTHROPIC_API_KEY,
      defaultModel: env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
    })
  }
  if (env.GOOGLE_API_KEY) {
    providers.push({
      provider: 'google',
      apiKey: env.GOOGLE_API_KEY,
      defaultModel: env.GOOGLE_MODEL || 'gemini-2.5-flash',
    })
  }
  if (env.AI_GATEWAY_API_KEY) {
    providers.push({
      provider: 'custom',
      apiKey: env.AI_GATEWAY_API_KEY,
      defaultModel: 'gpt-4o-mini',
      baseUrl: env.AI_GATEWAY_BASE_URL,
    })
  }

  if (providers.length === 0) return null

  const defaultProvider = (env.ACTIVE_PROVIDER as AIProvider) || providers[0].provider

  return {
    providers,
    defaultProvider,
    theme: 'dark',
    userProfile: { name: 'Test User', email: 'test@golemancy.dev' },
    defaultWorkingDirectoryBase: '/tmp/golemancy-test',
  }
}

/**
 * Wrapper around `describe` that skips the suite when no API key is available.
 * Passes the loaded `GlobalSettings` into the callback.
 */
export function describeWithApiKey(
  name: string,
  fn: (settings: GlobalSettings) => void,
): void {
  const settings = loadLiveSettings()
  if (settings) {
    describe(name, () => fn(settings))
  } else {
    describe.skip(name, () => fn(null!))
  }
}
