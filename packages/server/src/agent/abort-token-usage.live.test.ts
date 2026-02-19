/**
 * Live test: Verify token usage behavior when streamText is aborted.
 *
 * Questions to answer:
 * 1. Does result.totalUsage resolve or reject after abort?
 * 2. If it resolves, does it contain partial token counts?
 * 3. Does onFinish fire on abort? Does onAbort fire?
 *
 * Run: pnpm --filter @golemancy/server test:live -- abort-token-usage
 */
import { describe, it, expect } from 'vitest'
import { streamText } from 'ai'
import { describeWithApiKey } from '../test/live-settings'
import { resolveModel } from './model'
import type { GlobalSettings } from '@golemancy/shared'

function runAbortTests(providerKey: string, settings: GlobalSettings) {
  const provider = settings.providers[providerKey]
  if (!provider) return

  const modelConfig = { provider: providerKey, model: provider.models[0] }
  const tag = `[${providerKey}/${provider.models[0]}]`

  describe(providerKey, () => {
    it('baseline: normal completion reports totalUsage', async () => {
      const model = await resolveModel(settings, modelConfig)

      const result = streamText({
        model,
        prompt: 'Say "hello" and nothing else.',
        maxOutputTokens: 20,
      })

      const chunks: string[] = []
      for await (const chunk of result.textStream) {
        chunks.push(chunk)
      }

      const usage = await result.totalUsage
      console.log(`${tag} baseline text: "${chunks.join('')}"`)
      console.log(`${tag} baseline totalUsage:`, JSON.stringify(usage))

      expect(usage.inputTokens).toBeGreaterThan(0)
      expect(usage.outputTokens).toBeGreaterThan(0)
    })

    it('totalUsage vs sum of step.usage consistency', async () => {
      const model = await resolveModel(settings, modelConfig)

      let stepsFromFinish: any[] = []
      let totalUsageFromFinish: any = null

      const result = streamText({
        model,
        prompt: 'Say "hello world" and nothing else.',
        maxOutputTokens: 50,
        onFinish: ({ steps, totalUsage }) => {
          stepsFromFinish = steps
          totalUsageFromFinish = totalUsage
        },
      })

      // Consume entire stream
      for await (const _chunk of result.textStream) { /* drain */ }

      const totalUsage = await result.totalUsage

      // Sum from steps
      let stepsInputTokens = 0
      let stepsOutputTokens = 0
      for (const step of stepsFromFinish) {
        stepsInputTokens += step.usage?.inputTokens ?? 0
        stepsOutputTokens += step.usage?.outputTokens ?? 0
      }

      console.log(`${tag} consistency check:`)
      console.log(`  totalUsage (promise):`, JSON.stringify(totalUsage))
      console.log(`  totalUsage (onFinish):`, JSON.stringify(totalUsageFromFinish))
      console.log(`  steps count: ${stepsFromFinish.length}`)
      console.log(`  steps sum: input=${stepsInputTokens}, output=${stepsOutputTokens}`)
      console.log(`  match: input=${totalUsage.inputTokens === stepsInputTokens}, output=${totalUsage.outputTokens === stepsOutputTokens}`)

      expect(stepsFromFinish.length).toBeGreaterThan(0)
      expect(totalUsage.inputTokens).toBe(stepsInputTokens)
      expect(totalUsage.outputTokens).toBe(stepsOutputTokens)
    })

    it('abort: onAbort steps contain completed step usage', async () => {
      const model = await resolveModel(settings, modelConfig)
      const ac = new AbortController()

      let abortSteps: any[] = []

      const result = streamText({
        model,
        prompt: 'Write a very long detailed essay about the complete history of mathematics from ancient civilizations to modern day. Cover every major mathematician and their contributions. Make it at least 2000 words.',
        abortSignal: ac.signal,
        onAbort: ({ steps }) => {
          abortSteps = steps
        },
      })

      let chunkCount = 0
      try {
        for await (const _chunk of result.textStream) {
          chunkCount++
          if (chunkCount >= 5) {
            ac.abort()
            break
          }
        }
      } catch { /* expected */ }

      await new Promise(r => setTimeout(r, 500))

      let stepsInputTokens = 0
      let stepsOutputTokens = 0
      for (const step of abortSteps) {
        stepsInputTokens += step.usage?.inputTokens ?? 0
        stepsOutputTokens += step.usage?.outputTokens ?? 0
      }

      console.log(`${tag} abort steps check:`)
      console.log(`  onAbort steps count: ${abortSteps.length}`)
      console.log(`  steps sum: input=${stepsInputTokens}, output=${stepsOutputTokens}`)
      if (abortSteps.length > 0) {
        console.log(`  step[0].usage:`, JSON.stringify(abortSteps[0].usage))
      }
    })

    it('abort AFTER partial consumption', async () => {
      const model = await resolveModel(settings, modelConfig)
      const ac = new AbortController()

      let onFinishCalled = false
      let onAbortCalled = false
      let onFinishUsage: any = null

      const result = streamText({
        model,
        prompt: 'Write a very long detailed essay about the complete history of mathematics from ancient civilizations to modern day. Cover every major mathematician and their contributions. Make it at least 2000 words.',
        abortSignal: ac.signal,
        onFinish: ({ usage }) => {
          onFinishCalled = true
          onFinishUsage = usage
        },
        onAbort: () => { onAbortCalled = true },
      })

      let chunkCount = 0
      let partialText = ''
      try {
        for await (const chunk of result.textStream) {
          partialText += chunk
          chunkCount++
          if (chunkCount >= 5) {
            ac.abort()
            break
          }
        }
      } catch (err: any) {
        console.log(`${tag} abort-partial stream error: ${err.name}: ${err.message}`)
      }

      await new Promise(r => setTimeout(r, 1000))

      console.log(`${tag} abort-partial: ${chunkCount} chunks, ${partialText.length} chars consumed`)
      console.log(`${tag} abort-partial onFinishCalled: ${onFinishCalled}`)
      console.log(`${tag} abort-partial onAbortCalled: ${onAbortCalled}`)
      if (onFinishUsage) console.log(`${tag} abort-partial onFinish.usage:`, JSON.stringify(onFinishUsage))

      try {
        const usage = await result.totalUsage
        console.log(`${tag} abort-partial totalUsage RESOLVED:`, JSON.stringify(usage))
      } catch (err: any) {
        console.log(`${tag} abort-partial totalUsage REJECTED: ${err.name}: ${err.message}`)
      }
    })

    it('abort IMMEDIATELY (pre-abort)', async () => {
      const model = await resolveModel(settings, modelConfig)
      const ac = new AbortController()

      let onFinishCalled = false
      let onAbortCalled = false

      ac.abort() // abort before streamText

      const result = streamText({
        model,
        prompt: 'Write a long essay about astronomy.',
        abortSignal: ac.signal,
        onFinish: () => { onFinishCalled = true },
        onAbort: () => { onAbortCalled = true },
      })

      try {
        for await (const _chunk of result.textStream) {
          console.log(`${tag} abort-immediate: unexpected chunk received`)
        }
      } catch (err: any) {
        console.log(`${tag} abort-immediate stream error: ${err.name}: ${err.message}`)
      }

      await new Promise(r => setTimeout(r, 1000))

      console.log(`${tag} abort-immediate onFinishCalled: ${onFinishCalled}`)
      console.log(`${tag} abort-immediate onAbortCalled: ${onAbortCalled}`)

      try {
        const usage = await result.totalUsage
        console.log(`${tag} abort-immediate totalUsage RESOLVED:`, JSON.stringify(usage))
      } catch (err: any) {
        console.log(`${tag} abort-immediate totalUsage REJECTED: ${err.name}: ${err.message}`)
      }
    })

    it('abort DURING streaming with 1s delay', async () => {
      const model = await resolveModel(settings, modelConfig)
      const ac = new AbortController()

      let onFinishCalled = false
      let onAbortCalled = false

      const result = streamText({
        model,
        prompt: 'Count from 1 to 200, one number per line. Write every single number.',
        abortSignal: ac.signal,
        onFinish: () => { onFinishCalled = true },
        onAbort: () => { onAbortCalled = true },
      })

      const timeoutId = setTimeout(() => ac.abort(), 1000)

      let fullText = ''
      try {
        for await (const chunk of result.textStream) {
          fullText += chunk
        }
        clearTimeout(timeoutId)
        console.log(`${tag} abort-delayed: stream completed naturally, ${fullText.length} chars`)
      } catch (err: any) {
        console.log(`${tag} abort-delayed: interrupted after ${fullText.length} chars, error: ${err.name}`)
      }

      await new Promise(r => setTimeout(r, 1000))

      console.log(`${tag} abort-delayed onFinishCalled: ${onFinishCalled}`)
      console.log(`${tag} abort-delayed onAbortCalled: ${onAbortCalled}`)

      try {
        const usage = await result.totalUsage
        console.log(`${tag} abort-delayed totalUsage RESOLVED:`, JSON.stringify(usage))
      } catch (err: any) {
        console.log(`${tag} abort-delayed totalUsage REJECTED: ${err.name}: ${err.message}`)
      }
    })
  })
}

// Only test providers known to work (skip openai/ai-gateway which have key issues)
const PROVIDERS_TO_TEST = ['anthropic', 'google']

describeWithApiKey('abort-token-usage', (settings) => {
  if (!settings) return
  for (const key of PROVIDERS_TO_TEST) {
    if (settings.providers[key]) {
      runAbortTests(key, settings)
    }
  }
})
