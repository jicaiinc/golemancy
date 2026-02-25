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
    case 'deepseek': {
      const { createDeepSeek } = await import('@ai-sdk/deepseek')
      return createDeepSeek({ apiKey, baseURL: baseUrl })(model ?? 'deepseek-chat')
    }
    case 'xai': {
      const { createXai } = await import('@ai-sdk/xai')
      return createXai({ apiKey, baseURL: baseUrl })(model ?? 'grok-3-mini')
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
      return createMoonshotAI({ apiKey, baseURL: baseUrl })(model ?? 'moonshot-v1-8k')
    }
    case 'alibaba': {
      const { createAlibaba } = await import('@ai-sdk/alibaba')
      return createAlibaba({ apiKey, baseURL: baseUrl })(model ?? 'qwen-turbo')
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

  app.post('/claude-code/test', async (c) => {
    log.info('testing Claude Code SDK connection')

    const CLAUDE_CODE_TEST_TIMEOUT_MS = 15_000

    try {
      const { query } = await import('@anthropic-ai/claude-agent-sdk')

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), CLAUDE_CODE_TEST_TIMEOUT_MS)
      const start = Date.now()

      let resultModel: string | undefined

      try {
        const sdkQuery = query({
          prompt: 'Say "ok"',
          options: {
            maxTurns: 1,
            abortController: controller,
          } as Parameters<typeof query>[0]['options'],
        })

        for await (const msg of sdkQuery) {
          const m = msg as Record<string, unknown>
          if (m.type === 'system' && m.model) {
            resultModel = m.model as string
          }
        }
      } finally {
        clearTimeout(timeout)
      }

      const latencyMs = Date.now() - start
      log.info({ latencyMs, model: resultModel }, 'Claude Code SDK test succeeded')
      return c.json({ ok: true, latencyMs, model: resultModel })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      log.warn({ error: message }, 'Claude Code SDK test failed')
      return c.json({ ok: false, error: message })
    }
  })

  return app
}
