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
      return createAnthropic({ apiKey, baseURL: baseUrl })(model ?? 'claude-sonnet-4-5')
    }
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai')
      return createOpenAI({ apiKey, baseURL: baseUrl })(model ?? 'gpt-4o')
    }
    case 'google': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
      return createGoogleGenerativeAI({ apiKey, baseURL: baseUrl })(model ?? 'gemini-2.5-flash')
    }
    case 'deepseek': {
      const { createDeepSeek } = await import('@ai-sdk/deepseek')
      return createDeepSeek({ apiKey, baseURL: baseUrl })(model ?? 'deepseek-chat')
    }
    case 'xai': {
      const { createXai } = await import('@ai-sdk/xai')
      return createXai({ apiKey, baseURL: baseUrl })(model ?? 'grok-3')
    }
    case 'groq': {
      const { createGroq } = await import('@ai-sdk/groq')
      return createGroq({ apiKey, baseURL: baseUrl })(model ?? 'llama-3.3-70b-versatile')
    }
    case 'mistral': {
      const { createMistral } = await import('@ai-sdk/mistral')
      return createMistral({ apiKey, baseURL: baseUrl })(model ?? 'mistral-large-latest')
    }
    case 'moonshot': {
      const { createMoonshotAI } = await import('@ai-sdk/moonshotai')
      return createMoonshotAI({ apiKey, baseURL: baseUrl })(model ?? 'kimi-k2')
    }
    case 'alibaba': {
      const { createAlibaba } = await import('@ai-sdk/alibaba')
      return createAlibaba({ apiKey, baseURL: baseUrl })(model ?? 'qwen-max')
    }
    case 'openai-compatible':
    default: {
      const { createOpenAI } = await import('@ai-sdk/openai')
      return createOpenAI({ apiKey, baseURL: baseUrl })(model ?? 'gpt-4o')
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
      return c.json({ ok: false, error: 'PROVIDER_NOT_FOUND' }, 404)
    }
    if (!entry.apiKey && !entry.baseUrl?.includes('localhost')) {
      return c.json({ ok: false, error: 'NO_API_KEY' }, 400)
    }

    const testModel = entry.models[0]
    if (!testModel) {
      return c.json({ ok: false, error: 'NO_MODELS_CONFIGURED' }, 400)
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
          maxOutputTokens: 20,
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
