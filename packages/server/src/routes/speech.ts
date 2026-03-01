import { Hono } from 'hono'
import { experimental_transcribe as transcribe } from 'ai'
import type { ISettingsService, TranscriptionId } from '@golemancy/shared'
import type { SpeechStorage } from '../storage/speech'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:speech' })

const TEST_TIMEOUT_MS = 15_000

interface SpeechRouteDeps {
  storage: SpeechStorage
  settingsStorage: ISettingsService
}

function getExtension(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('mpeg')) return 'mp3'
  if (mimeType.includes('wav')) return 'wav'
  return 'webm'
}

export function createSpeechRoutes(deps: SpeechRouteDeps) {
  const app = new Hono()

  // POST /transcribe — Upload audio + transcribe
  app.post('/transcribe', async (c) => {
    const settings = await deps.settingsStorage.get()
    const sttConfig = settings.speechToText

    if (!sttConfig?.enabled) {
      return c.json({ error: 'STT_NOT_ENABLED' }, 400)
    }
    if (!sttConfig.apiKey) {
      return c.json({ error: 'NO_API_KEY' }, 400)
    }

    const formData = await c.req.formData()
    const audioFile = formData.get('audio') as File | null
    if (!audioFile) {
      return c.json({ error: 'MISSING_AUDIO_FILE' }, 400)
    }

    const audioDurationMs = Number(formData.get('audioDurationMs') ?? 0)
    const projectId = (formData.get('projectId') as string) || undefined
    const conversationId = (formData.get('conversationId') as string) || undefined

    // Save audio to disk FIRST (persist before transcribe)
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer())
    const extension = getExtension(audioFile.type)
    const { audioFileId, sizeBytes } = await deps.storage.saveAudio(audioBuffer, extension)

    // Create pending record
    const record = await deps.storage.createRecord({
      status: 'pending',
      audioFileId,
      audioDurationMs,
      audioSizeBytes: sizeBytes,
      provider: sttConfig.providerType,
      model: sttConfig.model,
      projectId,
      conversationId,
      usedInMessage: false,
      createdAt: new Date().toISOString(),
    })

    // Transcribe using Vercel AI SDK
    try {
      const { createOpenAI } = await import('@ai-sdk/openai')
      const openai = createOpenAI({
        apiKey: sttConfig.apiKey,
        ...(sttConfig.baseUrl ? { baseURL: sttConfig.baseUrl } : {}),
      })

      const result = await transcribe({
        model: openai.transcription(sttConfig.model),
        audio: audioBuffer,
        ...(sttConfig.language ? { providerOptions: { openai: { language: sttConfig.language } } } : {}),
      })

      const updated = await deps.storage.updateRecord(record.id, {
        status: 'success',
        text: result.text,
      })
      log.info({ id: record.id, model: sttConfig.model }, 'transcription succeeded')
      return c.json(updated)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      const updated = await deps.storage.updateRecord(record.id, {
        status: 'failed',
        error: errorMsg,
      })
      log.warn({ id: record.id, error: errorMsg }, 'transcription failed')
      return c.json(updated)
    }
  })

  // GET /history — List all transcription records
  app.get('/history', async (c) => {
    const limit = Number(c.req.query('limit') ?? 50)
    const offset = Number(c.req.query('offset') ?? 0)
    const records = await deps.storage.listRecords(limit, offset)
    return c.json(records)
  })

  // GET /audio/:audioFileId — Stream audio file
  app.get('/audio/:audioFileId', async (c) => {
    const audioFileId = c.req.param('audioFileId')
    const filePath = await deps.storage.findAudioFile(audioFileId)

    if (!filePath) {
      return c.json({ error: 'AUDIO_NOT_FOUND' }, 404)
    }

    const { default: fs } = await import('node:fs/promises')
    const buffer = await fs.readFile(filePath)

    // Determine content type from extension
    const ext = filePath.split('.').pop() ?? 'webm'
    const contentTypeMap: Record<string, string> = {
      webm: 'audio/webm',
      ogg: 'audio/ogg',
      mp4: 'audio/mp4',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
    }

    return c.body(buffer, 200, {
      'Content-Type': contentTypeMap[ext] ?? 'application/octet-stream',
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, max-age=86400',
    })
  })

  // DELETE /:id — Delete single record
  app.delete('/:id', async (c) => {
    const id = c.req.param('id') as TranscriptionId
    const freedBytes = await deps.storage.deleteRecord(id)
    return c.json({ ok: true, freedBytes })
  })

  // POST /:id/retry — Re-transcribe audio (works for both failed and success records)
  app.post('/:id/retry', async (c) => {
    const id = c.req.param('id') as TranscriptionId
    const record = await deps.storage.getRecord(id)

    if (!record) {
      return c.json({ error: 'RECORD_NOT_FOUND' }, 404)
    }
    if (record.status === 'pending') {
      return c.json({ error: 'TRANSCRIPTION_IN_PROGRESS' }, 400)
    }

    const settings = await deps.settingsStorage.get()
    const sttConfig = settings.speechToText

    if (!sttConfig?.enabled || !sttConfig.apiKey) {
      return c.json({ error: 'STT_NOT_CONFIGURED' }, 400)
    }

    // Read the audio file from disk
    const filePath = await deps.storage.findAudioFile(record.audioFileId)
    if (!filePath) {
      return c.json({ error: 'AUDIO_NOT_FOUND_ON_DISK' }, 404)
    }

    const { default: fs } = await import('node:fs/promises')
    const audioBuffer = await fs.readFile(filePath)

    // Mark as pending
    await deps.storage.updateRecord(id, { status: 'pending', error: undefined })

    try {
      const { createOpenAI } = await import('@ai-sdk/openai')
      const openai = createOpenAI({
        apiKey: sttConfig.apiKey,
        ...(sttConfig.baseUrl ? { baseURL: sttConfig.baseUrl } : {}),
      })

      const result = await transcribe({
        model: openai.transcription(sttConfig.model),
        audio: audioBuffer,
        ...(sttConfig.language ? { providerOptions: { openai: { language: sttConfig.language } } } : {}),
      })

      const updated = await deps.storage.updateRecord(id, {
        status: 'success',
        text: result.text,
      })
      log.info({ id, model: sttConfig.model }, 'retry transcription succeeded')
      return c.json(updated)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      const updated = await deps.storage.updateRecord(id, {
        status: 'failed',
        error: errorMsg,
      })
      log.warn({ id, error: errorMsg }, 'retry transcription failed')
      return c.json(updated)
    }
  })

  // DELETE /history — Clear all history
  app.delete('/history', async (c) => {
    const result = await deps.storage.clearAll()
    return c.json(result)
  })

  // GET /storage — Get storage usage stats
  app.get('/storage', async (c) => {
    const usage = await deps.storage.getStorageUsage()
    return c.json(usage)
  })

  // POST /test — Test STT provider connection
  app.post('/test', async (c) => {
    const config = await c.req.json()
    log.info({ provider: config.providerType, model: config.model }, 'testing STT provider')

    if (!config.apiKey) {
      return c.json({ ok: false, error: 'No API key provided' })
    }

    try {
      const { createOpenAI } = await import('@ai-sdk/openai')
      const openai = createOpenAI({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      })

      // Create a minimal silent audio for testing (WAV header only)
      const silentWav = createSilentWav()
      const start = Date.now()

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS)

      try {
        await transcribe({
          model: openai.transcription(config.model),
          audio: silentWav,
          abortSignal: controller.signal,
        })
      } catch (transcribeErr: unknown) {
        // "No transcript generated." means the API processed our silent audio
        // successfully but returned empty text — this confirms connectivity works.
        const msg = transcribeErr instanceof Error ? transcribeErr.message : String(transcribeErr)
        if (!msg.includes('No transcript generated')) {
          throw transcribeErr
        }
      } finally {
        clearTimeout(timeout)
      }

      const latencyMs = Date.now() - start
      log.info({ latencyMs }, 'STT provider test succeeded')
      return c.json({ ok: true, latencyMs })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      log.warn({ error: message }, 'STT provider test failed')
      return c.json({ ok: false, error: message })
    }
  })

  return app
}

/** Create a minimal valid WAV file (silence) for testing connectivity. */
function createSilentWav(): Buffer {
  const sampleRate = 8000
  const numSamples = sampleRate // 1 second of silence
  const bitsPerSample = 16
  const numChannels = 1
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = numSamples * numChannels * (bitsPerSample / 8)

  const buffer = Buffer.alloc(44 + dataSize)
  // RIFF header
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  // fmt sub-chunk
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  // data sub-chunk
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  // Silence (all zeros) — already zeroed by Buffer.alloc

  return buffer
}
