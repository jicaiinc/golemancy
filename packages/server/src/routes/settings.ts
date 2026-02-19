import { Hono } from 'hono'
import type { ISettingsService, ProviderSdkType } from '@golemancy/shared'
import { generateText } from 'ai'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:settings' })

const TEST_TIMEOUT_MS = 10_000

async function createTestModel(sdkType: ProviderSdkType, apiKey?: string, baseUrl?: string, model?: string) {
  switch (sdkType) {
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic')
      return createAnthropic({ apiKey, baseURL: baseUrl })(model ?? 'claude-haiku-4-5')
    }
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai')
      return createOpenAI({ apiKey, baseURL: baseUrl })(model ?? 'gpt-4o-mini')
    }
    case 'google': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
      return createGoogleGenerativeAI({ apiKey, baseURL: baseUrl })(model ?? 'gemini-2.0-flash')
    }
    case 'openai-compatible':
    default: {
      const { createOpenAI } = await import('@ai-sdk/openai')
      return createOpenAI({ apiKey, baseURL: baseUrl })(model ?? 'gpt-4o-mini')
    }
  }
}

export function createSettingsRoutes(storage: ISettingsService) {
  const app = new Hono()

  app.get('/', async (c) => {
    log.debug('getting settings')
    const settings = await storage.get()
    return c.json(settings)
  })

  app.patch('/', async (c) => {
    const data = await c.req.json()
    log.debug('updating settings')
    const updated = await storage.update(data)
    return c.json(updated)
  })

  app.post('/providers/:slug/test', async (c) => {
    const slug = c.req.param('slug')
    log.info({ slug }, 'testing provider')

    const settings = await storage.get()
    const entry = settings.providers[slug]
    if (!entry) {
      return c.json({ ok: false, error: `Provider "${slug}" not found` }, 404)
    }
    if (!entry.apiKey && !entry.baseUrl?.includes('localhost')) {
      return c.json({ ok: false, error: 'No API key configured' }, 400)
    }

    const testModel = entry.models[0]
    if (!testModel) {
      return c.json({ ok: false, error: 'No models configured for this provider' }, 400)
    }

    try {
      const model = await createTestModel(entry.sdkType, entry.apiKey, entry.baseUrl, testModel)
      const start = Date.now()

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS)

      try {
        await generateText({
          model,
          prompt: 'Say "ok"',
          maxOutputTokens: 5,
          abortSignal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
      }

      const latencyMs = Date.now() - start
      log.info({ slug, latencyMs }, 'provider test succeeded')
      return c.json({ ok: true, latencyMs })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      log.warn({ slug, error: message }, 'provider test failed')
      return c.json({ ok: false, error: message })
    }
  })

  return app
}
