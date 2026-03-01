# Architecture Design: Speech-to-Text (STT)

> Architect: architect
> Date: 2026-02-24
> Requirement: `_requirement/20260224-1600-speech-to-text.md`

---

## 1. Data Flow

### 1.1 Recording → Upload → Transcribe → Display

```
                     UI (Renderer)                              Server (Hono)
┌─────────────────────────────────────────┐     ┌──────────────────────────────────────┐
│                                         │     │                                      │
│  ChatInput                              │     │  routes/speech.ts                    │
│  ┌──────────────────────────────────┐   │     │                                      │
│  │ 1. User clicks mic button        │   │     │                                      │
│  │ 2. MediaRecorder.start()         │   │     │                                      │
│  │    + AnalyserNode → Canvas       │   │     │                                      │
│  │ 3. User clicks stop              │   │     │                                      │
│  │ 4. MediaRecorder.stop() → Blob   │   │     │                                      │
│  │ 5. POST /api/speech/transcribe   │───────▶│  6. Save audio to disk               │
│  │    (multipart/form-data)         │   │     │     dataDir/speech/audio/{uuid}.webm  │
│  │                                  │   │     │  7. experimental_transcribe()         │
│  │ 8. Response: TranscriptionRecord │◀───────│  8. Insert record to global SQLite    │
│  │ 9. text → append to textarea     │   │     │     Return TranscriptionRecord        │
│  │                                  │   │     │                                      │
│  └──────────────────────────────────┘   │     │                                      │
│                                         │     │                                      │
└─────────────────────────────────────────┘     └──────────────────────────────────────┘
```

### 1.2 Key Design Decisions

- **Audio persisted first, transcribe second**: The server saves the audio file to disk _before_ calling the AI API. If transcription fails, the audio is preserved and can be retried.
- **Multipart upload**: Audio blob sent as `multipart/form-data` with metadata (duration, projectId, conversationId) as form fields. This avoids base64 overhead.
- **Global SQLite DB**: Transcription records are stored in the global `speech.db` (not per-project DB) because:
  - The history page is global (not project-scoped)
  - Audio files are stored in a single `speech/audio/` directory
  - Storage usage calculation spans all projects
- **No WebSocket needed**: Transcription is a single request-response cycle. No streaming needed.

---

## 2. New Types (packages/shared)

### 2.1 `packages/shared/src/types/common.ts` — Add TranscriptionId

```typescript
export type TranscriptionId = Brand<string, 'TranscriptionId'>
```

### 2.2 `packages/shared/src/types/speech.ts` — New file

```typescript
import type { TranscriptionId, ProjectId, ConversationId } from './common'

// --- STT Provider Config (stored in GlobalSettings.speechToText) ---

export type SttProviderType = 'openai' | 'openai-compatible'

export interface SpeechToTextSettings {
  enabled: boolean
  providerType: SttProviderType
  apiKey?: string
  baseUrl?: string
  model: string
  language?: string
  testStatus?: 'untested' | 'ok' | 'error'
}

// --- Transcription Record ---

export type TranscriptionStatus = 'pending' | 'success' | 'failed'

export interface TranscriptionRecord {
  id: TranscriptionId
  createdAt: string        // ISO 8601
  status: TranscriptionStatus
  audioFileId: string      // UUID filename (no extension)
  audioDurationMs: number
  audioSizeBytes: number
  text?: string            // transcribed text (present when status='success')
  error?: string           // error message (present when status='failed')
  provider: string         // e.g. 'openai', 'openai-compatible'
  model: string            // e.g. 'gpt-4o-mini-transcribe'
  projectId?: ProjectId    // optional context
  conversationId?: ConversationId  // optional context
  usedInMessage: boolean   // whether user sent the text as a chat message
}

// --- Storage Usage ---

export interface SpeechStorageUsage {
  totalBytes: number
  recordCount: number
}
```

### 2.3 `packages/shared/src/types/settings.ts` — Extend GlobalSettings

```typescript
import type { SpeechToTextSettings } from './speech'

export interface GlobalSettings {
  providers: Record<string, ProviderEntry>
  defaultModel?: AgentModelConfig
  theme: ThemeMode
  speechToText?: SpeechToTextSettings  // NEW
}
```

### 2.4 `packages/shared/src/types/index.ts` — Re-export

Add:
```typescript
export * from './speech'
```

### 2.5 `packages/shared/src/services/interfaces.ts` — Add ISpeechService

```typescript
import type {
  TranscriptionId, TranscriptionRecord, SpeechToTextSettings, SpeechStorageUsage,
} from '../types'

export interface ISpeechService {
  /** Upload audio + transcribe. Returns the created record. */
  transcribe(
    audio: File | Blob,
    metadata: {
      audioDurationMs: number
      projectId?: string
      conversationId?: string
    },
  ): Promise<TranscriptionRecord>

  /** List all transcription records, newest first. */
  listHistory(params?: { limit?: number; offset?: number }): Promise<TranscriptionRecord[]>

  /** Get the URL to stream/download an audio file. */
  getAudioUrl(audioFileId: string): string

  /** Delete a single transcription record + its audio file. */
  deleteRecord(id: TranscriptionId): Promise<void>

  /** Clear all history records + audio files. Returns stats. */
  clearHistory(): Promise<{ deletedCount: number; freedBytes: number }>

  /** Retry transcription for a failed record. */
  retry(id: TranscriptionId): Promise<TranscriptionRecord>

  /** Test the STT provider connection with a tiny audio snippet. */
  testProvider(config: SpeechToTextSettings): Promise<{ ok: boolean; error?: string; latencyMs?: number }>

  /** Get total storage used by audio files. */
  getStorageUsage(): Promise<SpeechStorageUsage>
}
```

---

## 3. Server Architecture

### 3.1 Global Speech Database

**Location**: `dataDir/speech.db` (alongside existing `data.db`)

**Path helper** in `packages/server/src/utils/paths.ts`:
```typescript
export function getSpeechDbPath(): string {
  return path.join(getDataDir(), 'speech.db')
}
```

**New file**: `packages/server/src/db/speech-db.ts`
```typescript
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as speechSchema from './speech-schema'

export function createSpeechDatabase(dbPath: string) {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('foreign_keys = ON')
  return drizzle(sqlite, { schema: speechSchema })
}

export type SpeechDatabase = ReturnType<typeof createSpeechDatabase>
```

**Why a separate DB file?** The existing `data.db` is unused (all project data uses per-project DBs). Creating `speech.db` is clean and self-contained. If we later need more global tables, we can use `data.db` or keep domain-specific DBs.

### 3.2 Drizzle Schema

**New file**: `packages/server/src/db/speech-schema.ts`

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const transcriptionRecords = sqliteTable('transcription_records', {
  id: text('id').primaryKey(),                    // TranscriptionId (UUID)
  status: text('status').notNull().default('pending'), // 'pending' | 'success' | 'failed'
  audioFileId: text('audio_file_id').notNull(),   // UUID of saved audio file
  audioDurationMs: integer('audio_duration_ms').notNull(),
  audioSizeBytes: integer('audio_size_bytes').notNull(),
  text: text('text'),                              // transcribed text
  error: text('error'),                            // error message
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  projectId: text('project_id'),                   // optional
  conversationId: text('conversation_id'),         // optional
  usedInMessage: integer('used_in_message').notNull().default(0), // boolean as int
  createdAt: text('created_at').notNull(),
})
```

**Migration**: In `packages/server/src/db/speech-migrate.ts`:
```typescript
export function migrateSpeechDatabase(db: SpeechDatabase) {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS transcription_records (
      id                TEXT PRIMARY KEY,
      status            TEXT NOT NULL DEFAULT 'pending',
      audio_file_id     TEXT NOT NULL,
      audio_duration_ms INTEGER NOT NULL,
      audio_size_bytes  INTEGER NOT NULL,
      text              TEXT,
      error             TEXT,
      provider          TEXT NOT NULL,
      model             TEXT NOT NULL,
      project_id        TEXT,
      conversation_id   TEXT,
      used_in_message   INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL
    )
  `)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_transcription_created ON transcription_records(created_at DESC)`)
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_transcription_status ON transcription_records(status)`)
}
```

### 3.3 Storage Layer

**New file**: `packages/server/src/storage/speech.ts`

```typescript
import type { SpeechDatabase } from '../db/speech-db'

export class SpeechStorage {
  constructor(
    private db: SpeechDatabase,
    private audioDir: string,  // dataDir/speech/audio/
  ) {}

  /** Save audio blob to disk, return the audioFileId (UUID). */
  async saveAudio(buffer: Buffer, extension: string): Promise<{ audioFileId: string; sizeBytes: number }>

  /** Insert a new transcription record. */
  async createRecord(data: Omit<TranscriptionRecord, 'id'>): Promise<TranscriptionRecord>

  /** Update record (e.g., after transcription success/failure). */
  async updateRecord(id: TranscriptionId, data: Partial<TranscriptionRecord>): Promise<TranscriptionRecord>

  /** Get a single record by ID. */
  async getRecord(id: TranscriptionId): Promise<TranscriptionRecord | null>

  /** List records, newest first. */
  async listRecords(limit?: number, offset?: number): Promise<TranscriptionRecord[]>

  /** Delete record + audio file. Returns bytes freed. */
  async deleteRecord(id: TranscriptionId): Promise<number>

  /** Delete all records + audio files. Returns { count, bytes }. */
  async clearAll(): Promise<{ deletedCount: number; freedBytes: number }>

  /** Get audio file path on disk. */
  getAudioFilePath(audioFileId: string): string

  /** Calculate total storage used by audio files. */
  async getStorageUsage(): Promise<{ totalBytes: number; recordCount: number }>
}
```

### 3.4 Route Layer

**New file**: `packages/server/src/routes/speech.ts`

```typescript
import { Hono } from 'hono'

interface SpeechRouteDeps {
  storage: SpeechStorage
  settingsStorage: ISettingsService
}

export function createSpeechRoutes(deps: SpeechRouteDeps) {
  const app = new Hono()

  // POST /transcribe — Upload audio + transcribe
  // Content-Type: multipart/form-data
  // Fields: audio (file), audioDurationMs, projectId?, conversationId?
  app.post('/transcribe', async (c) => { ... })

  // GET /history — List all transcription records
  // Query: ?limit=50&offset=0
  app.get('/history', async (c) => { ... })

  // GET /audio/:audioFileId — Stream audio file
  app.get('/audio/:audioFileId', async (c) => { ... })

  // DELETE /:id — Delete single record
  app.delete('/:id', async (c) => { ... })

  // POST /:id/retry — Retry failed transcription
  app.post('/:id/retry', async (c) => { ... })

  // DELETE /history — Clear all history
  app.delete('/history', async (c) => { ... })

  // GET /storage — Get storage usage stats
  app.get('/storage', async (c) => { ... })

  // POST /test — Test STT provider connection
  // Body: SpeechToTextSettings
  app.post('/test', async (c) => { ... })

  return app
}
```

### 3.5 Transcription Implementation

In the `/transcribe` route handler:

```typescript
// 1. Read SpeechToTextSettings from settings.json
const settings = await deps.settingsStorage.get()
const sttConfig = settings.speechToText

// 2. Validate config
if (!sttConfig?.enabled) return c.json({ error: 'STT not enabled' }, 400)

// 3. Parse multipart form data
const formData = await c.req.formData()
const audioFile = formData.get('audio') as File
const audioDurationMs = Number(formData.get('audioDurationMs'))

// 4. Save audio to disk FIRST (persist before transcribe)
const { audioFileId, sizeBytes } = await storage.saveAudio(
  Buffer.from(await audioFile.arrayBuffer()),
  getExtension(audioFile.type),  // 'webm', 'ogg', etc.
)

// 5. Create pending record
const record = await storage.createRecord({
  status: 'pending',
  audioFileId,
  audioDurationMs,
  audioSizeBytes: sizeBytes,
  provider: sttConfig.providerType,
  model: sttConfig.model,
  projectId: formData.get('projectId') as string | undefined,
  conversationId: formData.get('conversationId') as string | undefined,
  usedInMessage: false,
  createdAt: new Date().toISOString(),
})

// 6. Transcribe using Vercel AI SDK
try {
  const { createOpenAI } = await import('@ai-sdk/openai')
  const openai = createOpenAI({
    apiKey: sttConfig.apiKey,
    ...(sttConfig.baseUrl ? { baseURL: sttConfig.baseUrl } : {}),
  })

  const result = await experimental_transcribe({
    model: openai.transcription(sttConfig.model),
    audio: {
      data: Buffer.from(await audioFile.arrayBuffer()),
      mimeType: audioFile.type,
    },
    ...(sttConfig.language ? { providerOptions: { openai: { language: sttConfig.language } } } : {}),
  })

  const updated = await storage.updateRecord(record.id, {
    status: 'success',
    text: result.text,
  })
  return c.json(updated)
} catch (err) {
  const updated = await storage.updateRecord(record.id, {
    status: 'failed',
    error: err instanceof Error ? err.message : String(err),
  })
  return c.json(updated)
}
```

### 3.6 Route Mounting

In `packages/server/src/app.ts`:

```typescript
// Add to ServerDependencies:
speechStorage?: SpeechStorage

// Add route mount:
if (deps.speechStorage) {
  app.route('/api/speech', createSpeechRoutes({
    storage: deps.speechStorage,
    settingsStorage: deps.settingsStorage,
  }))
}
```

### 3.7 Server Initialization

In `packages/server/src/index.ts`:

```typescript
import { createSpeechDatabase } from './db/speech-db'
import { migrateSpeechDatabase } from './db/speech-migrate'
import { SpeechStorage } from './storage/speech'

// In main():
const speechDbPath = getSpeechDbPath()
const speechDb = createSpeechDatabase(speechDbPath)
migrateSpeechDatabase(speechDb)

const audioDir = path.join(getDataDir(), 'speech', 'audio')
await fs.mkdir(audioDir, { recursive: true })

const speechStorage = new SpeechStorage(speechDb, audioDir)

// Add to deps:
deps.speechStorage = speechStorage
```

### 3.8 Body Size Limit

The existing body limit is 50MB for `/api/*`. Audio files from recording are typically small (< 5MB for a few minutes of speech). The existing limit is sufficient. However, multipart parsing is needed — Hono supports this natively via `c.req.formData()`.

---

## 4. UI Architecture

### 4.1 Store Slice

Add `SpeechSlice` + `SpeechActions` to `packages/ui/src/stores/useAppStore.ts`:

```typescript
// --- Speech Slice ---
interface SpeechSlice {
  speechHistory: TranscriptionRecord[]
  speechHistoryLoading: boolean
  speechStorageUsage: SpeechStorageUsage | null
}

interface SpeechActions {
  /** Transcribe audio and return the result. Does NOT add to history (caller does). */
  transcribeAudio(
    audio: Blob,
    metadata: { audioDurationMs: number; projectId?: ProjectId; conversationId?: ConversationId },
  ): Promise<TranscriptionRecord>

  /** Load transcription history for the history page. */
  loadSpeechHistory(params?: { limit?: number; offset?: number }): Promise<void>

  /** Retry a failed transcription. */
  retrySpeechRecord(id: TranscriptionId): Promise<TranscriptionRecord>

  /** Delete a single record. */
  deleteSpeechRecord(id: TranscriptionId): Promise<void>

  /** Clear all history. */
  clearSpeechHistory(): Promise<{ deletedCount: number; freedBytes: number }>

  /** Load storage usage stats. */
  loadSpeechStorageUsage(): Promise<void>
}
```

**Implementation pattern** follows existing slices — calls `getServices().speech.*`, updates state, guards with loading flags.

### 4.2 VoiceWaveform Component

**New file**: `packages/ui/src/components/base/VoiceWaveform.tsx`

```typescript
interface VoiceWaveformProps {
  analyser: AnalyserNode | null
  isActive: boolean
  className?: string
}

export function VoiceWaveform({ analyser, isActive, className }: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // ...
}
```

**Rendering approach**:
- Uses `requestAnimationFrame` loop when `isActive=true`
- Reads frequency data from `AnalyserNode.getByteFrequencyData()`
- Groups into 16-24 pixel columns (bars)
- Each bar drawn as stacked pixel blocks (4x4px squares)
- Bar height proportional to frequency amplitude
- Colors: accent-green for low amplitude, accent-amber for medium, accent-red for high
- Background: transparent (inherits container bg)
- Size: Fixed height (~48px), width fills container

**Pixel art style**:
- No anti-aliasing (canvas `imageSmoothingEnabled = false`)
- Sharp 4x4 pixel blocks
- 2px gap between bars
- Colors from design tokens (via CSS custom properties read at render time)

### 4.3 ChatInput Modifications

Modify `packages/ui/src/pages/chat/ChatInput.tsx`:

**New states**:
```typescript
type RecordingState = 'idle' | 'recording' | 'transcribing' | 'error'

const [recordingState, setRecordingState] = useState<RecordingState>('idle')
const [recordingDuration, setRecordingDuration] = useState(0)
const [transcriptionError, setTranscriptionError] = useState<string | null>(null)
const [lastTranscriptionId, setLastTranscriptionId] = useState<TranscriptionId | null>(null)
const mediaRecorderRef = useRef<MediaRecorder | null>(null)
const analyserRef = useRef<AnalyserNode | null>(null)
const audioContextRef = useRef<AudioContext | null>(null)
```

**Recording logic** (extracted to a custom hook `useAudioRecorder`):

```typescript
// packages/ui/src/hooks/useAudioRecorder.ts
export function useAudioRecorder() {
  // Manages: MediaRecorder, AudioContext, AnalyserNode, chunks, duration timer
  return {
    startRecording,   // async — requests permission, creates MediaRecorder + analyser
    stopRecording,    // returns Blob
    cancelRecording,  // cleans up without returning data
    analyser,         // AnalyserNode for waveform visualization
    isRecording,
    durationMs,
  }
}
```

**Recording flow**:
1. Click mic → `startRecording()` → request `getUserMedia({ audio: true })`
2. Create `AudioContext` → `createMediaStreamSource()` → `AnalyserNode` (for viz)
3. Create `MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })`
4. Start timer (updates `durationMs` every 100ms)
5. Click stop → `stopRecording()` → returns `Blob`
6. Upload: `transcribeAudio(blob, { audioDurationMs, projectId, conversationId })`
7. On success: append `text` to textarea input
8. On failure: show error + retry button

**UI states in ChatInput toolbar area**:

| State | UI |
|-------|-----|
| `idle` | Mic button visible next to attach button |
| `recording` | VoiceWaveform + duration timer + Stop button (replaces Send) |
| `transcribing` | Loading spinner + "Transcribing..." text |
| `error` | Error text + Retry button + Dismiss button |

**Mic button**: Only shown when `speechToText?.enabled` in global settings. Check via `useAppStore(s => s.settings?.speechToText?.enabled)`.

### 4.4 Speech Settings Tab

**New component in**: `packages/ui/src/pages/settings/SpeechSettingsTab.tsx`

Add new tab to `SETTINGS_TABS` in `GlobalSettingsPage.tsx`:
```typescript
const SETTINGS_TABS = [
  { id: 'general', label: 'General' },
  { id: 'providers', label: 'Providers' },
  { id: 'speech', label: 'Speech' },   // NEW
]
```

**SpeechSettingsTab component structure**:

```
┌─────────────────────────────────────────────┐
│ SPEECH TO TEXT                               │
│                                              │
│ [■ Enabled] toggle                           │
│                                              │
│ ┌─ Provider ─────────────────────────────┐   │
│ │ Type: [OpenAI ▼] [Custom ▼]           │   │
│ │ API Key: [sk-...          ] [Show]     │   │
│ │ Base URL: [https://...]   (optional)   │   │
│ │ Model: [gpt-4o-mini-transcribe ▼]     │   │
│ │ Language: [Auto-detect ▼]             │   │
│ └────────────────────────────────────────┘   │
│                                              │
│ [Test Connection]  ✅ OK (234ms)             │
│                                              │
│ ┌─ Preset Models ────────────────────────┐   │
│ │ OpenAI: gpt-4o-mini-transcribe,        │   │
│ │         gpt-4o-transcribe, whisper-1   │   │
│ └────────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**Behavior**:
- When providerType = 'openai': Model dropdown shows preset list, baseUrl is optional (for proxy)
- When providerType = 'openai-compatible': baseUrl is required, model is free-text input
- `Test Connection` calls `POST /api/speech/test` with the current config
- Changes auto-save on blur / toggle (same pattern as existing provider cards)

**Preset models**:
```typescript
const OPENAI_STT_MODELS = [
  'gpt-4o-mini-transcribe',
  'gpt-4o-transcribe',
  'whisper-1',
]
```

### 4.5 TranscriptionHistoryPage

**New file**: `packages/ui/src/pages/speech/TranscriptionHistoryPage.tsx`

**Layout**: Global-level page (not project-scoped), uses `GlobalLayout`.

**Structure**:
```
┌──────────────────────────────────────────────────┐
│ Transcription History                    [Clear] │
│                                                  │
│ Storage: 23.4 MB (142 recordings)                │
│                                                  │
│ ── Today ────────────────────────────────────── │
│ ┌──────────────────────────────────────────────┐ │
│ │ 14:32  ▶ [play]  "The quick brown fox..."   │ │
│ │ 2.3s  45KB  whisper-1  ✅ success            │ │
│ │                          [Copy] [Delete]     │ │
│ └──────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────┐ │
│ │ 14:15  ▶ [play]  ❌ Failed: API timeout     │ │
│ │ 5.1s  98KB  gpt-4o-transcribe               │ │
│ │                    [Retry] [Copy] [Delete]   │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ ── Yesterday ───────────────────────────────── │
│ ...                                              │
└──────────────────────────────────────────────────┘
```

**Features**:
- Records grouped by date (Today, Yesterday, or full date)
- Each record shows: timestamp, play button, text preview (or error), duration, size, model, status
- Actions per record: Play (uses `<audio>` element), Copy text, Delete, Retry (if failed)
- Clear All button with confirmation dialog
- Storage usage display at top (total bytes + record count)

**Audio playback**: Use native `<audio>` element with `src={getServices().speech.getAudioUrl(audioFileId)}`. The URL includes auth token handling (same pattern as workspace file URLs — Electron session injects Bearer header for matching requests, or the fetchJson auth interceptor can be used).

**Audio URL auth**: Since `<audio>` tags can't set headers, we need the same Electron session interceptor pattern used for uploads. Add `/api/speech/audio/*` to the `onBeforeSendHeaders` filter in `apps/desktop/src/main/index.ts`. For dev mode (no Electron), the mock service returns a data URL.

### 4.6 Routing

In `packages/ui/src/app/routes.tsx`:

```typescript
import { TranscriptionHistoryPage } from '../pages'

// Add as global route (not under /projects/:projectId):
<Route path="/speech-history" element={<TranscriptionHistoryPage />} />
```

In `packages/ui/src/pages/index.tsx`:
```typescript
export { TranscriptionHistoryPage } from './speech'
```

### 4.7 Sidebar Navigation

Add a "Speech History" link to the global nav section (alongside Dashboard, Settings). This is in the sidebar component. The link should show when STT is enabled.

---

## 5. Electron Integration

### 5.1 Microphone Permission (macOS)

In `apps/desktop/src/main/index.ts`:

```typescript
import { systemPreferences } from 'electron'

// IPC handler for microphone permission
ipcMain.handle('media:requestMicrophoneAccess', async () => {
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('microphone')
    if (status === 'granted') return 'granted'
    if (status === 'denied') return 'denied'
    // 'not-determined' or 'restricted' — ask
    const granted = await systemPreferences.askForMediaAccess('microphone')
    return granted ? 'granted' : 'denied'
  }
  // Windows/Linux: Chromium handles permission directly
  return 'granted'
})
```

In `apps/desktop/src/preload/index.ts`:

```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing
  requestMicrophoneAccess: () => ipcRenderer.invoke('media:requestMicrophoneAccess'),
})
```

**Usage in UI**: Before starting recording, call `window.electronAPI?.requestMicrophoneAccess()`. If result is `'denied'`, show a pixel-style toast/alert explaining the user needs to enable microphone access in System Settings.

If `window.electronAPI` is not available (dev mode without Electron), skip the permission check — Chrome's own permission prompt will appear.

### 5.2 Audio URL Auth Header Injection

In `apps/desktop/src/main/index.ts`, extend the `onBeforeSendHeaders` filter:

```typescript
if (serverToken && serverPort) {
  win.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: [
      `http://127.0.0.1:${serverPort}/api/projects/*/uploads/*`,
      `http://localhost:${serverPort}/api/projects/*/uploads/*`,
      // NEW: Speech audio files
      `http://127.0.0.1:${serverPort}/api/speech/audio/*`,
      `http://localhost:${serverPort}/api/speech/audio/*`,
    ] },
    (details, callback) => {
      details.requestHeaders['Authorization'] = `Bearer ${serverToken}`
      callback({ requestHeaders: details.requestHeaders })
    },
  )
}
```

---

## 6. Service Layer

### 6.1 ISpeechService Interface

Already defined in Section 2.5 above. Key points:
- `transcribe()` accepts `File | Blob` (browser-native types)
- `getAudioUrl()` returns a string URL (sync, not async)
- `testProvider()` takes the full config object (not a slug) because STT config is separate from chat providers

### 6.2 HttpSpeechService

**New file**: `packages/ui/src/services/http/speech.ts`

```typescript
import type { ISpeechService, TranscriptionId, TranscriptionRecord, SpeechToTextSettings, SpeechStorageUsage } from '@golemancy/shared'
import { fetchJson, getAuthToken, getBaseUrl } from './base'

export class HttpSpeechService implements ISpeechService {
  constructor(private baseUrl: string) {}

  async transcribe(audio: File | Blob, metadata: { audioDurationMs: number; projectId?: string; conversationId?: string }): Promise<TranscriptionRecord> {
    const formData = new FormData()
    formData.append('audio', audio)
    formData.append('audioDurationMs', String(metadata.audioDurationMs))
    if (metadata.projectId) formData.append('projectId', metadata.projectId)
    if (metadata.conversationId) formData.append('conversationId', metadata.conversationId)

    // NOTE: Do NOT set Content-Type — browser sets multipart boundary automatically
    const res = await fetch(`${this.baseUrl}/api/speech/transcribe`, {
      method: 'POST',
      body: formData,
      headers: {
        ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
      },
    })
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
    return res.json()
  }

  listHistory(params?: { limit?: number; offset?: number }) {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    const suffix = qs.toString() ? `?${qs}` : ''
    return fetchJson<TranscriptionRecord[]>(`${this.baseUrl}/api/speech/history${suffix}`)
  }

  getAudioUrl(audioFileId: string): string {
    return `${this.baseUrl}/api/speech/audio/${audioFileId}`
  }

  async deleteRecord(id: TranscriptionId) {
    await fetchJson(`${this.baseUrl}/api/speech/${id}`, { method: 'DELETE' })
  }

  clearHistory() {
    return fetchJson<{ deletedCount: number; freedBytes: number }>(
      `${this.baseUrl}/api/speech/history`,
      { method: 'DELETE' },
    )
  }

  retry(id: TranscriptionId) {
    return fetchJson<TranscriptionRecord>(
      `${this.baseUrl}/api/speech/${id}/retry`,
      { method: 'POST' },
    )
  }

  testProvider(config: SpeechToTextSettings) {
    return fetchJson<{ ok: boolean; error?: string; latencyMs?: number }>(
      `${this.baseUrl}/api/speech/test`,
      { method: 'POST', body: JSON.stringify(config) },
    )
  }

  getStorageUsage() {
    return fetchJson<SpeechStorageUsage>(`${this.baseUrl}/api/speech/storage`)
  }
}
```

### 6.3 MockSpeechService

**New file**: `packages/ui/src/services/mock/speech.ts`

```typescript
import type { ISpeechService, TranscriptionId, TranscriptionRecord, SpeechToTextSettings, SpeechStorageUsage } from '@golemancy/shared'
import { SEED_TRANSCRIPTION_RECORDS } from './data'

export class MockSpeechService implements ISpeechService {
  private records = new Map<TranscriptionId, TranscriptionRecord>(
    SEED_TRANSCRIPTION_RECORDS.map(r => [r.id, { ...r }])
  )

  async transcribe(_audio: File | Blob, metadata: { audioDurationMs: number }): Promise<TranscriptionRecord> {
    await delay(500)
    const record: TranscriptionRecord = {
      id: genId('trans') as TranscriptionId,
      status: 'success',
      audioFileId: genId('audio'),
      audioDurationMs: metadata.audioDurationMs,
      audioSizeBytes: 24000,
      text: 'This is a mock transcription of the audio recording.',
      provider: 'openai',
      model: 'whisper-1',
      usedInMessage: false,
      createdAt: new Date().toISOString(),
    }
    this.records.set(record.id, record)
    return record
  }

  async listHistory(): Promise<TranscriptionRecord[]> {
    await delay()
    return [...this.records.values()].sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt),
    )
  }

  getAudioUrl(_audioFileId: string): string {
    // Return a silent audio data URL for mock
    return 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA='
  }

  async deleteRecord(id: TranscriptionId): Promise<void> {
    await delay()
    this.records.delete(id)
  }

  async clearHistory(): Promise<{ deletedCount: number; freedBytes: number }> {
    await delay()
    const count = this.records.size
    this.records.clear()
    return { deletedCount: count, freedBytes: count * 24000 }
  }

  async retry(id: TranscriptionId): Promise<TranscriptionRecord> {
    await delay(300)
    const existing = this.records.get(id)
    if (!existing) throw new Error('Record not found')
    const updated = { ...existing, status: 'success' as const, text: 'Retried mock transcription.' }
    this.records.set(id, updated)
    return updated
  }

  async testProvider(_config: SpeechToTextSettings): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
    await delay(200)
    return { ok: true, latencyMs: 150 }
  }

  async getStorageUsage(): Promise<SpeechStorageUsage> {
    await delay()
    return { totalBytes: this.records.size * 24000, recordCount: this.records.size }
  }
}
```

### 6.4 Seed Data

Add to `packages/ui/src/services/mock/data.ts`:

```typescript
import type { TranscriptionId, TranscriptionRecord } from '@golemancy/shared'

export const SEED_TRANSCRIPTION_RECORDS: TranscriptionRecord[] = [
  {
    id: 'trans-1' as TranscriptionId,
    status: 'success',
    audioFileId: 'audio-1',
    audioDurationMs: 3200,
    audioSizeBytes: 48000,
    text: 'Write a blog post about AI trends in 2026.',
    provider: 'openai',
    model: 'whisper-1',
    projectId: 'proj-1' as ProjectId,
    conversationId: 'conv-1' as ConversationId,
    usedInMessage: true,
    createdAt: hourAgo,
  },
  {
    id: 'trans-2' as TranscriptionId,
    status: 'failed',
    audioFileId: 'audio-2',
    audioDurationMs: 5100,
    audioSizeBytes: 76000,
    error: 'API timeout after 30s',
    provider: 'openai',
    model: 'gpt-4o-transcribe',
    usedInMessage: false,
    createdAt: dayAgo,
  },
  {
    id: 'trans-3' as TranscriptionId,
    status: 'success',
    audioFileId: 'audio-3',
    audioDurationMs: 8400,
    audioSizeBytes: 126000,
    text: 'Research the latest Tailwind CSS v4 features and create a summary document.',
    provider: 'openai',
    model: 'gpt-4o-mini-transcribe',
    projectId: 'proj-1' as ProjectId,
    usedInMessage: true,
    createdAt: dayAgo,
  },
]
```

### 6.5 ServiceContainer Updates

In `packages/ui/src/services/container.ts`:
```typescript
export interface ServiceContainer {
  // ... existing
  speech: ISpeechService  // NEW
}
```

In `packages/ui/src/services/http/index.ts`:
```typescript
import { HttpSpeechService } from './speech'

export function createHttpServices(baseUrl: string): ServiceContainer {
  return {
    // ... existing
    speech: new HttpSpeechService(baseUrl),
  }
}
```

In `packages/ui/src/services/mock/index.ts`:
```typescript
import { MockSpeechService } from './speech'

export function createMockServices(): ServiceContainer {
  return {
    // ... existing
    speech: new MockSpeechService(),
  }
}
```

---

## 7. File Inventory

### New Files

| File | Package | Description |
|------|---------|-------------|
| `packages/shared/src/types/speech.ts` | shared | STT types |
| `packages/server/src/db/speech-schema.ts` | server | Drizzle schema |
| `packages/server/src/db/speech-db.ts` | server | DB factory |
| `packages/server/src/db/speech-migrate.ts` | server | Migrations |
| `packages/server/src/storage/speech.ts` | server | Storage layer |
| `packages/server/src/routes/speech.ts` | server | HTTP routes |
| `packages/ui/src/components/base/VoiceWaveform.tsx` | ui | Canvas waveform |
| `packages/ui/src/hooks/useAudioRecorder.ts` | ui | Recording hook |
| `packages/ui/src/pages/speech/TranscriptionHistoryPage.tsx` | ui | History page |
| `packages/ui/src/pages/speech/index.ts` | ui | Page barrel |
| `packages/ui/src/pages/settings/SpeechSettingsTab.tsx` | ui | Settings tab |
| `packages/ui/src/services/http/speech.ts` | ui | HTTP service |
| `packages/ui/src/services/mock/speech.ts` | ui | Mock service |

### Modified Files

| File | Package | Change |
|------|---------|--------|
| `packages/shared/src/types/common.ts` | shared | Add `TranscriptionId` |
| `packages/shared/src/types/settings.ts` | shared | Add `speechToText?` to `GlobalSettings` |
| `packages/shared/src/types/index.ts` | shared | Re-export `speech` |
| `packages/shared/src/services/interfaces.ts` | shared | Add `ISpeechService` |
| `packages/server/src/app.ts` | server | Add `speechStorage` to deps, mount route |
| `packages/server/src/index.ts` | server | Init speech DB + storage |
| `packages/server/src/utils/paths.ts` | server | Add `getSpeechDbPath()` |
| `packages/ui/src/stores/useAppStore.ts` | ui | Add SpeechSlice + SpeechActions |
| `packages/ui/src/services/container.ts` | ui | Add `speech` to `ServiceContainer` |
| `packages/ui/src/services/http/index.ts` | ui | Add `HttpSpeechService` |
| `packages/ui/src/services/mock/index.ts` | ui | Add `MockSpeechService` |
| `packages/ui/src/services/mock/data.ts` | ui | Add seed transcription records |
| `packages/ui/src/pages/chat/ChatInput.tsx` | ui | Add mic button + recording states |
| `packages/ui/src/pages/settings/GlobalSettingsPage.tsx` | ui | Add Speech tab |
| `packages/ui/src/pages/index.tsx` | ui | Export `TranscriptionHistoryPage` |
| `packages/ui/src/app/routes.tsx` | ui | Add `/speech-history` route |
| `apps/desktop/src/main/index.ts` | desktop | Add mic permission IPC + audio URL auth |
| `apps/desktop/src/preload/index.ts` | desktop | Expose `requestMicrophoneAccess` |

---

## 8. Implementation Order (suggested)

1. **shared types** — `speech.ts`, branded ID, extend `GlobalSettings`, `ISpeechService` interface
2. **server DB** — speech-schema, speech-db, speech-migrate
3. **server storage** — `SpeechStorage` class
4. **server routes** — `createSpeechRoutes`, mount in `app.ts`, init in `index.ts`
5. **UI service layer** — `HttpSpeechService`, `MockSpeechService`, seed data, container updates
6. **UI store** — SpeechSlice + SpeechActions
7. **Electron** — mic permission IPC, audio URL auth
8. **UI components** — VoiceWaveform, useAudioRecorder hook
9. **ChatInput** — mic button + recording flow
10. **Settings** — SpeechSettingsTab
11. **History page** — TranscriptionHistoryPage + route + navigation

---

## 9. Open Questions / Assumptions

1. **Audio format**: `MediaRecorder` default in Chromium is `audio/webm;codecs=opus`. This is well-supported by OpenAI's API. No format conversion needed.
2. **Max recording duration**: Not capped in v1. Could add a configurable limit later.
3. **Concurrent recordings**: Only one recording at a time per ChatInput instance.
4. **`experimental_transcribe`**: This is the Vercel AI SDK function for transcription. The Fact Checker should verify the exact import path and API signature.
5. **Body size for audio**: 50MB limit is more than enough. A 10-minute recording at webm/opus bitrate is ~5MB.
