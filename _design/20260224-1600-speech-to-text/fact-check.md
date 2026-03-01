# Fact-Check Report: Speech-to-Text Feature

> Date: 2026-02-24
> Status: VERIFIED

---

## 1. Vercel AI SDK `experimental_transcribe`

### Verdict: CONFIRMED

**Import path:**
```ts
import { experimental_transcribe as transcribe } from 'ai'
```
Source: AI SDK docs (`ai-sdk-core/36-transcription.mdx`), verified via Context7.

**Function signature:**
```ts
const result = await transcribe({
  model: openai.transcription('whisper-1'),   // TranscriptionModel
  audio: Buffer | Uint8Array | URL,            // audio input
  providerOptions?: { openai: { ... } },       // optional provider-specific options
})
```

**Return type:**
```ts
{ text: string }  // destructured as { text: transcript }
```

**Audio input types (verified):**
- `Buffer` (from `fs.readFile`)
- `Uint8Array`
- `URL` (remote audio URL)

**Project version compatibility:**
- `ai`: `^6.0.82` — `experimental_transcribe` exists in v6. **COMPATIBLE.**
- `@ai-sdk/openai`: `^3.0.27` — has `.transcription()` method. **COMPATIBLE.**

### `createOpenAI({ baseURL }).transcription()` — CONFIRMED

The `createOpenAI()` returns a provider instance with the same shape as the default `openai` export. It supports:
- `provider(modelName)` — chat model (callable)
- `provider.transcription(modelName)` — transcription model
- `provider.embedding(modelName)` — embedding model

Project already uses this pattern for chat models:
```ts
// packages/server/src/agent/model.ts:23-24
const { createOpenAI } = await import('@ai-sdk/openai')
return createOpenAI({ apiKey: entry.apiKey, baseURL: entry.baseUrl })(model)
```

For transcription, the equivalent is:
```ts
const { createOpenAI } = await import('@ai-sdk/openai')
const provider = createOpenAI({ apiKey, baseURL })
const model = provider.transcription('whisper-1')
```

**NOTE**: For `openai-compatible` providers, we should also use `createOpenAI` (NOT `createOpenAICompatible` from `@ai-sdk/openai-compatible`), since the project already uses `createOpenAI` for openai-compatible providers. This is consistent with existing code in `model.ts:56-57`.

---

## 2. OpenAI Transcription API (`/v1/audio/transcriptions`)

### Verdict: CONFIRMED

**Endpoint:** `POST /v1/audio/transcriptions`

**Supported audio formats:**
- flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, **webm**

**Maximum file size:** 25 MB

**Available models (verified names):**
| Model | Notes |
|-------|-------|
| `gpt-4o-mini-transcribe` | Lightweight, faster |
| `gpt-4o-transcribe` | Higher quality |
| `whisper-1` | Open source Whisper V2 |
| `gpt-4o-transcribe-diarize` | Speaker diarization |

**Key model constraints:**
- `gpt-4o-transcribe` / `gpt-4o-mini-transcribe`: only `json` response format supported
- `gpt-4o-transcribe`: max audio duration 1500 seconds (25 minutes)
- `whisper-1`: no streaming support
- All models accept `language` parameter (ISO-639-1 code, e.g. "en", "zh")

**Requirement doc accuracy:** The three preset models (`gpt-4o-mini-transcribe`, `gpt-4o-transcribe`, `whisper-1`) are all **CORRECT**.

Sources:
- [OpenAI API Reference — Audio](https://platform.openai.com/docs/api-reference/audio/createTranscription)
- [OpenAI Speech to Text Guide](https://platform.openai.com/docs/guides/speech-to-text)

---

## 3. MediaRecorder API in Electron (Chromium)

### Verdict: CONFIRMED

**Default output format in Chromium:**
- `audio/webm;codecs=opus` — this is the standard MIME type for audio recording in Chromium
- All Chromium-based browsers support `audio/webm;codecs=opus`
- Can be verified at runtime: `MediaRecorder.isTypeSupported('audio/webm;codecs=opus')`

**WebM accepted by OpenAI:** YES. `webm` is explicitly in OpenAI's supported format list (see Section 2 above).

**Electron version:**
- Project uses `"electron": "^40.0.0"` (from `apps/desktop/package.json`)
- Electron 40 ships with Chromium 128+ — full MediaRecorder support confirmed
- No polyfills or workarounds needed

**Recording workflow:**
```
MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
  → ondataavailable → collect Blob chunks
  → onstop → new Blob(chunks) → upload to server
```

Sources:
- [MDN MediaRecorder mimeType](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/mimeType)
- [Chrome MediaRecorder Blog](https://developer.chrome.com/blog/mediarecorder)

---

## 4. Electron Microphone Permission (macOS)

### Verdict: CONFIRMED

**API:** `systemPreferences.askForMediaAccess('microphone')`

- Returns `Promise<boolean>` — `true` if granted, `false` if denied
- Available since Electron 4.0. Still the correct API in Electron 40.
- On first call: shows macOS system permission dialog
- If previously denied: no dialog shown, resolves with `false` (user must change in System Preferences)

**Pre-check API:** `systemPreferences.getMediaAccessStatus('microphone')`
- Returns: `'not-determined'` | `'granted'` | `'denied'` | `'restricted'`
- Use this to check before requesting

**Required Info.plist entry:**
```xml
<key>NSMicrophoneUsageDescription</key>
<string>Golemancy needs microphone access for speech-to-text transcription.</string>
```
This must be set in electron-builder config for production builds.

**IPC pattern (from existing code):**
Current IPC handlers in `apps/desktop/src/main/index.ts`:
```ts
ipcMain.handle('window:open', ...)
ipcMain.handle('shell:openPath', ...)
```
New handler should follow the same pattern:
```ts
ipcMain.handle('media:requestMicrophoneAccess', async () => {
  if (process.platform === 'darwin') {
    return systemPreferences.askForMediaAccess('microphone')
  }
  return true  // Windows/Linux don't require explicit permission
})
```

Sources:
- [Electron systemPreferences docs](https://www.electronjs.org/docs/latest/api/system-preferences)
- [BigBinary Blog — Electron Microphone Permission](https://www.bigbinary.com/blog/request-camera-micophone-permission-electron)

---

## 5. drizzle-orm for Global DB

### Verdict: FEASIBLE — Separate DB instance needed

**Current DB architecture:**
- Per-project SQLite databases via `ProjectDbManager` (`packages/server/src/db/project-db.ts`)
- Each project DB: lazy-loaded on first access, cached in `Map<string, AppDatabase>`
- DB creation: `createDatabase(dbPath)` → `new Database(dbPath)` + WAL mode + drizzle wrapper
- Schema: `packages/server/src/db/schema.ts` — per-project tables (conversations, messages, tasks, token_records, compact_records, cron_job_runs)
- Migrations: `migrateDatabase(db)` — imperative SQL `CREATE TABLE IF NOT EXISTS` + ALTER TABLE pattern

**For global STT DB:**
- Create a separate SQLite file (e.g., `dataDir/speech.db`) — NOT inside any project directory
- Use the same `createDatabase()` function with a new schema
- Create a new `speech-schema.ts` with `transcription_records` table
- Create a new migration function for the speech DB (similar to `migrateDatabase` but for the speech schema)
- Initialize once at server startup (singleton, not lazy per-project)

**Pattern:**
```ts
// packages/server/src/db/speech-db.ts
import { createDatabase } from './client'
import { migrateSpeechDatabase } from './speech-migrate'

let speechDb: AppDatabase | null = null

export function getSpeechDb(dataDir: string): AppDatabase {
  if (speechDb) return speechDb
  const dbPath = join(dataDir, 'speech.db')
  speechDb = createDatabase(dbPath)
  migrateSpeechDatabase(speechDb)
  return speechDb
}
```

**NOTE:** The `createDatabase` function in `client.ts` currently binds schema via `drizzle(sqlite, { schema })` using the per-project schema. For the speech DB, we need to either:
1. Create a separate `createSpeechDatabase` that uses the speech schema, OR
2. Pass schema as parameter to `createDatabase`

Option 1 is simpler and avoids changing existing code.

---

## 6. Web Audio API AnalyserNode

### Verdict: CONFIRMED

**`AnalyserNode.getByteFrequencyData()`:**
- Populates a `Uint8Array` with frequency domain data
- Each value: 0–255 (unsigned byte), representing amplitude at that frequency bin
- Values are scaled between `minDecibels` and `maxDecibels`

**`fftSize` property:**
- Must be a power of 2 between 32 and 32768
- Valid values: `32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768`
- Default: `2048`

**`frequencyBinCount` property:**
- Always equals `fftSize / 2`
- Read-only
- Determines the size of the Uint8Array needed for `getByteFrequencyData()`

**Recommended settings for pixel waveform visualization:**
- `fftSize = 256` → `frequencyBinCount = 128` bars (too many for pixel art)
- `fftSize = 64` → `frequencyBinCount = 32` bars (good for pixel-style visualization)
- `fftSize = 32` → `frequencyBinCount = 16` bars (minimum, very coarse)
- For the pixel art style, downsample from a larger FFT (e.g., 256) to ~8-16 visual bars

**Usage pattern:**
```ts
const audioCtx = new AudioContext()
const analyser = audioCtx.createAnalyser()
analyser.fftSize = 256
const source = audioCtx.createMediaStreamSource(stream)
source.connect(analyser)

const bufferLength = analyser.frequencyBinCount  // 128
const dataArray = new Uint8Array(bufferLength)

function draw() {
  requestAnimationFrame(draw)
  analyser.getByteFrequencyData(dataArray)
  // dataArray now has 128 frequency bins, each 0-255
  // Downsample to ~8-16 pixel bars for visualization
}
```

Sources:
- [MDN AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode)
- [MDN getByteFrequencyData](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getByteFrequencyData)
- [MDN frequencyBinCount](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/frequencyBinCount)
- [MDN Web Audio Visualizations](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API)

---

## Summary: Requirement Doc Accuracy

| Item | Status | Notes |
|------|--------|-------|
| `experimental_transcribe` from `ai` | CORRECT | Import path and usage confirmed |
| `createOpenAI({ baseURL }).transcription()` | CORRECT | Supported, matches project pattern |
| AI SDK version compatibility | CORRECT | `ai@^6.0.82` + `@ai-sdk/openai@^3.0.27` both support transcription |
| OpenAI model names | CORRECT | `gpt-4o-mini-transcribe`, `gpt-4o-transcribe`, `whisper-1` all valid |
| OpenAI audio formats | CORRECT | webm is supported (25MB limit) |
| MediaRecorder → webm/opus | CORRECT | Chromium default, accepted by OpenAI |
| Electron 40 MediaRecorder | CORRECT | Full support, no polyfills needed |
| `systemPreferences.askForMediaAccess` | CORRECT | Still valid in Electron 40 |
| AnalyserNode for waveform | CORRECT | `getByteFrequencyData()` → Uint8Array, fftSize/2 = bins |
| Global SQLite DB for transcription | FEASIBLE | Separate DB file alongside per-project DBs |

**All technical choices in the requirement document are verified and correct.**
**No blockers or inaccuracies found.**
