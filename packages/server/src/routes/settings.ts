import { Hono } from 'hono'
import type { ISettingsService, GlobalSettings, ProviderConfig } from '@golemancy/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:settings' })

/** Mask an API key: show first 4 chars + asterisks, or fully mask if too short */
function maskApiKey(key: string): string {
  if (!key || key.length <= 4) return '****'
  return key.slice(0, 4) + '*'.repeat(Math.min(key.length - 4, 12))
}

/** Return settings with all provider API keys masked */
function maskSettings(settings: GlobalSettings): GlobalSettings {
  return {
    ...settings,
    providers: settings.providers.map((p: ProviderConfig) => ({
      ...p,
      apiKey: maskApiKey(p.apiKey),
    })),
  }
}

/** Allowed top-level fields for PATCH /api/settings */
const ALLOWED_FIELDS = new Set<keyof GlobalSettings>([
  'providers',
  'defaultProvider',
  'theme',
  'userProfile',
  'defaultWorkingDirectoryBase',
])

export function createSettingsRoutes(storage: ISettingsService) {
  const app = new Hono()

  app.get('/', async (c) => {
    log.debug('getting settings')
    const settings = await storage.get()
    return c.json(maskSettings(settings))
  })

  app.patch('/', async (c) => {
    const data = await c.req.json()
    log.debug('updating settings')

    // Field whitelist: only allow known GlobalSettings fields
    const sanitized: Record<string, unknown> = {}
    for (const key of Object.keys(data)) {
      if (ALLOWED_FIELDS.has(key as keyof GlobalSettings)) {
        sanitized[key] = data[key]
      }
    }

    const updated = await storage.update(sanitized as Partial<GlobalSettings>)
    return c.json(maskSettings(updated))
  })

  return app
}
