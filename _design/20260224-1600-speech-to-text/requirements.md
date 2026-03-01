# Requirements Analysis: Speech-to-Text

> Analyst: Requirements Analyst
> Date: 2026-02-24
> Source: `_requirement/20260224-1600-speech-to-text.md`

---

## 1. User Flows

### Flow A: First-time Setup (Configure STT in Settings)

```
User opens Global Settings
  │
  ├─ Clicks "Speech" tab (new tab, alongside General / Providers)
  │
  ├─ Sees STT is disabled (default state)
  │
  ├─ Toggles "Enable Speech-to-Text" → ON
  │
  ├─ Selects Provider Type:
  │   ├─ "OpenAI" → baseURL field optional (for proxy), default models pre-filled
  │   └─ "Custom OpenAI-Compatible" → baseURL required, model field manual
  │
  ├─ Enters API Key
  │
  ├─ (Optional) Enters Base URL
  │
  ├─ Selects or types Model name
  │   └─ OpenAI: dropdown with gpt-4o-mini-transcribe, gpt-4o-transcribe, whisper-1
  │   └─ Custom: free-text input
  │
  ├─ (Optional) Sets Language (default: auto-detect)
  │
  ├─ Clicks "Test Connection"
  │   ├─ Success → shows "✓ OK (latency ms)", testStatus = 'ok'
  │   └─ Failure → shows error message, testStatus = 'error'
  │
  └─ Configuration auto-saved on change (consistent with existing Providers tab pattern)
```

### Flow B: Record and Transcribe (Happy Path)

```
User is in Chat page with input focused
  │
  ├─ Sees microphone button in ChatInput bottom toolbar (left of Send)
  │   └─ Button only visible when STT is enabled + configured
  │
  ├─ Clicks mic button
  │   ├─ [macOS first time] Electron requests microphone permission via systemPreferences
  │   ├─ Permission denied → toast error "Microphone access denied. Enable in System Preferences."
  │   └─ Permission granted → continue
  │
  ├─ Recording starts:
  │   ├─ Mic button transforms to Stop button (red, pulsing)
  │   ├─ Input area replaced by waveform visualization (pixel block columns)
  │   ├─ Timer shows elapsed recording duration (MM:SS)
  │   └─ Waveform animates in real-time based on audio amplitude
  │
  ├─ User clicks Stop button (or presses... no keyboard shortcut in v1)
  │
  ├─ Recording stops:
  │   ├─ Audio blob captured from MediaRecorder
  │   ├─ Input area shows "Uploading..." state
  │   ├─ Audio uploaded to server: POST /api/speech/transcribe (multipart)
  │   ├─ Server saves audio file to dataDir/speech/audio/
  │   ├─ Server calls Vercel AI SDK experimental_transcribe
  │   └─ Server returns TranscriptionRecord
  │
  ├─ Transcription succeeds:
  │   ├─ Transcribed text inserted into ChatInput textarea
  │   ├─ User can edit text before sending
  │   ├─ TranscriptionRecord saved with status='success', usedInMessage=false
  │   └─ usedInMessage flips to true when user sends the message
  │
  └─ User sends message normally (Enter or Send button)
```

### Flow C: Transcription Fails → Manual Retry

```
Recording stops, audio uploaded
  │
  ├─ Server transcription fails (API error, timeout, invalid key, etc.)
  │
  ├─ ChatInput shows error state:
  │   ├─ Red error banner: "Transcription failed: {error message}"
  │   ├─ "Retry" button (re-sends same audio to server)
  │   └─ "Dismiss" button (clears error, returns to normal input)
  │
  ├─ User clicks "Retry":
  │   ├─ POST /api/speech/:id/retry
  │   ├─ Server re-uses saved audio file (not re-uploaded)
  │   ├─ Success → text inserted into input (same as Flow B)
  │   └─ Failure → error state again, user can retry again
  │
  └─ User clicks "Dismiss":
      ├─ Error cleared, normal input restored
      └─ TranscriptionRecord remains in history with status='failed' (audio preserved)
```

### Flow D: Browse and Manage Transcription History

```
User navigates to Transcription History page (new global route: /speech-history)
  │
  ├─ Page shows all transcription records, grouped by date (newest first)
  │
  ├─ Each record card displays:
  │   ├─ Timestamp
  │   ├─ Status badge: success (green) / failed (red) / pending (amber)
  │   ├─ Audio duration (MM:SS)
  │   ├─ Transcribed text (if success) — truncated with expand
  │   ├─ Error message (if failed) — truncated with expand
  │   ├─ Source context: project name + conversation (if linked)
  │   └─ Action buttons:
  │       ├─ ▶ Play — plays audio via <audio> element using getAudioUrl()
  │       ├─ 📋 Copy — copies transcribed text to clipboard (success only)
  │       ├─ 🔄 Retry — re-triggers transcription (failed only)
  │       └─ 🗑 Delete — deletes record + audio file (with confirmation)
  │
  ├─ Bottom of page: Storage summary bar
  │   ├─ "X recordings · Y.YY MB used"
  │   └─ "Clear All History" button (with confirmation dialog)
  │       └─ Calls DELETE /api/speech/history
  │       └─ Shows result: "Deleted X records, freed Y MB"
  │
  └─ Empty state: "No transcription history yet."
```

---

## 2. Acceptance Criteria

### Feature 1: Chat Input — Microphone Button

- [ ] **AC-1.1**: When STT is enabled and configured (testStatus='ok' or 'untested'), a microphone icon button appears in ChatInput toolbar, between the image-attach button and Send/Stop button.
- [ ] **AC-1.2**: When STT is disabled or not configured, the microphone button is NOT rendered.
- [ ] **AC-1.3**: When isStreaming=true or disabled=true, the microphone button is disabled (grayed out).
- [ ] **AC-1.4**: Clicking the microphone button when already recording does nothing (button transforms to Stop during recording).

### Feature 2: Recording State

- [ ] **AC-2.1**: On mic click, the browser's MediaRecorder starts capturing audio (webm/opus or best available codec).
- [ ] **AC-2.2**: During recording, the ChatInput textarea area is replaced by a waveform visualization + elapsed timer.
- [ ] **AC-2.3**: The waveform renders as pixel-style block columns (Canvas 2D), amplitude-responsive via AnalyserNode.
- [ ] **AC-2.4**: A red "Stop" button replaces the mic button during recording.
- [ ] **AC-2.5**: Clicking Stop ends the recording and transitions to the transcribing state.
- [ ] **AC-2.6**: The recording timer displays in MM:SS format, updating every second.

### Feature 3: Transcription Flow

- [ ] **AC-3.1**: After stopping, the audio blob is uploaded to `POST /api/speech/transcribe` as multipart form data.
- [ ] **AC-3.2**: During upload/transcription, ChatInput shows a loading state ("Transcribing...").
- [ ] **AC-3.3**: On success, the transcribed text is inserted into the textarea value. The user can edit before sending.
- [ ] **AC-3.4**: On failure, an inline error message + Retry button + Dismiss button appear in ChatInput.
- [ ] **AC-3.5**: Retry calls `POST /api/speech/:id/retry` (reuses saved audio, does NOT re-upload).
- [ ] **AC-3.6**: Dismiss clears the error and returns to normal input state.
- [ ] **AC-3.7**: The audio file is persisted on the server regardless of transcription success or failure.

### Feature 4: Global Settings — Speech Tab

- [ ] **AC-4.1**: A "Speech" tab appears in Global Settings alongside "General" and "Providers".
- [ ] **AC-4.2**: The tab contains an Enable/Disable toggle for STT.
- [ ] **AC-4.3**: When enabled, the tab shows: Provider Type selector, API Key input, Base URL input, Model selector, Language input.
- [ ] **AC-4.4**: Provider Type options: "OpenAI" and "Custom OpenAI-Compatible".
- [ ] **AC-4.5**: When Provider = "OpenAI", Base URL is optional (for proxy), and Model dropdown pre-fills with: `gpt-4o-mini-transcribe`, `gpt-4o-transcribe`, `whisper-1`.
- [ ] **AC-4.6**: When Provider = "Custom", Base URL is required (validation error if empty), and Model is a free-text input.
- [ ] **AC-4.7**: "Test Connection" button sends `POST /api/speech/test` and displays success (with latency) or error.
- [ ] **AC-4.8**: STT config is stored in `GlobalSettings.speechToText` (separate from chat providers).
- [ ] **AC-4.9**: API Key field uses password masking with show/hide toggle (consistent with Providers tab).

### Feature 5: Transcription History Page

- [ ] **AC-5.1**: A new route `/speech-history` renders the TranscriptionHistoryPage using GlobalLayout.
- [ ] **AC-5.2**: Records are grouped by date, sorted newest-first.
- [ ] **AC-5.3**: Each record shows: timestamp, status badge, duration, text/error preview, source context.
- [ ] **AC-5.4**: Play button streams audio from `GET /api/speech/audio/:id` in the browser.
- [ ] **AC-5.5**: Copy button copies the transcribed text to clipboard (only shown for status='success').
- [ ] **AC-5.6**: Retry button triggers `POST /api/speech/:id/retry` (only shown for status='failed').
- [ ] **AC-5.7**: Delete button removes the record and audio file after user confirmation.
- [ ] **AC-5.8**: Storage summary at bottom shows total record count and total bytes used.
- [ ] **AC-5.9**: "Clear All History" deletes all records and audio files after confirmation, shows deletion summary.
- [ ] **AC-5.10**: Empty state: "No transcription history yet." message when no records exist.

### Feature 6: Server API

- [ ] **AC-6.1**: `POST /api/speech/transcribe` accepts multipart audio, saves file, performs transcription, returns `TranscriptionRecord`.
- [ ] **AC-6.2**: `GET /api/speech/history` returns all `TranscriptionRecord` items, sorted by createdAt desc.
- [ ] **AC-6.3**: `GET /api/speech/audio/:id` serves the audio file with correct MIME type.
- [ ] **AC-6.4**: `DELETE /api/speech/:id` deletes a single record and its audio file.
- [ ] **AC-6.5**: `POST /api/speech/:id/retry` re-transcribes using existing audio file, updates the record.
- [ ] **AC-6.6**: `DELETE /api/speech/history` clears all records and audio files, returns `{ deletedCount, freedBytes }`.
- [ ] **AC-6.7**: `GET /api/speech/storage` returns `{ totalBytes, recordCount }`.
- [ ] **AC-6.8**: `POST /api/speech/test` validates provider config by attempting a minimal transcription or API ping.
- [ ] **AC-6.9**: Transcription uses Vercel AI SDK `experimental_transcribe` with `createOpenAI({ baseURL })`.
- [ ] **AC-6.10**: Audio files are stored in `dataDir/speech/audio/` directory.
- [ ] **AC-6.11**: Transcription records stored in global SQLite DB (not project-level).

### Feature 7: Electron — Microphone Permission

- [ ] **AC-7.1**: On macOS, the Electron main process calls `systemPreferences.askForMediaAccess('microphone')` before recording starts.
- [ ] **AC-7.2**: If permission is denied, the UI shows an informative error message guiding the user to System Preferences.
- [ ] **AC-7.3**: Permission check is exposed via IPC from main process to renderer (through preload).

### Feature 8: Data Model

- [ ] **AC-8.1**: `TranscriptionId` is a new branded type in `packages/shared/src/types/common.ts`.
- [ ] **AC-8.2**: `SpeechToTextSettings` type is added to `GlobalSettings` as optional field `speechToText`.
- [ ] **AC-8.3**: `TranscriptionRecord` type includes all fields from the requirement spec.
- [ ] **AC-8.4**: `ISpeechService` interface is added to `packages/shared/src/services/interfaces.ts`.
- [ ] **AC-8.5**: Both Mock and HTTP implementations of `ISpeechService` are created.

### Feature 9: Store

- [ ] **AC-9.1**: A new `speech` slice is added to `useAppStore` with state for STT settings and history.
- [ ] **AC-9.2**: The slice provides actions: `loadTranscriptionHistory`, `transcribe`, `retryTranscription`, `deleteTranscription`, `clearHistory`, `getStorageUsage`.
- [ ] **AC-9.3**: The speech slice uses `getServices().speech` (module-level DI, consistent with other slices).

### Feature 10: Waveform Visualization

- [ ] **AC-10.1**: `VoiceWaveform` component renders a Canvas element with pixel-block column visualization.
- [ ] **AC-10.2**: Waveform responds to real-time audio amplitude via Web Audio API AnalyserNode.
- [ ] **AC-10.3**: Visual style: pixel blocks (no border-radius), discrete column heights, dark-theme compatible colors.
- [ ] **AC-10.4**: No third-party visualization library is used — pure Canvas 2D.

---

## 3. Edge Cases

### EC-1: STT Not Configured → User Clicks Mic Button

- **Scenario**: STT is disabled or settings incomplete (no API key, no model).
- **Expected**: The mic button is NOT rendered in ChatInput at all (AC-1.2). User cannot reach this state.
- **Fallback**: If settings become stale (e.g., key deleted after page load), the transcribe call will fail → handled by Flow C (error + retry/dismiss).

### EC-2: Recording In Progress → User Navigates Away

- **Scenario**: User starts recording in Chat, then clicks sidebar nav (e.g., Agents page).
- **Expected**: Recording should be automatically stopped and discarded. No orphan MediaRecorder streams.
- **Implementation**: `useEffect` cleanup in the recording hook stops MediaRecorder and releases stream tracks on unmount.
- **Audio preservation**: Since recording was never completed and audio never uploaded, no server-side cleanup needed.

### EC-3: Very Long Recording

- **Scenario**: User records for an extended period (e.g., 10+ minutes).
- **Expected**: No explicit time limit in v1. MediaRecorder will accumulate data in memory.
- **Risk**: Large audio blobs (>50MB) may cause upload timeouts or server memory issues.
- **Mitigation (v1)**: Display elapsed timer prominently so user is aware. Server should set a reasonable upload size limit (e.g., 25MB via Hono body limit). If exceeded, show clear error: "Recording too large. Try a shorter recording."
- **Future**: Chunked upload or streaming could be added later.

### EC-4: Empty Recording (Silence Only)

- **Scenario**: User clicks record, waits in silence, clicks stop.
- **Expected**: Audio is still uploaded and transcribed normally. The transcription API will return empty or near-empty text.
- **Handling**: If transcription returns empty text, treat as success with empty string. Insert nothing into textarea. TranscriptionRecord.text = "" (not null).
- **UI**: No special handling needed — empty text in input is fine, user just won't send it.

### EC-5: Network Error During Upload

- **Scenario**: Server is unreachable or network drops during audio upload.
- **Expected**: Upload fails with a network error.
- **Handling**: ChatInput shows error state (Flow C) with error message like "Network error — check your connection".
- **Audio preservation**: The audio blob is still in browser memory. However, since we don't have client-side storage in v1, the blob is lost if the user dismisses.
- **Note**: The server has NOT received the audio, so there is no server-side record. Retry would need to re-upload. In this case, "Retry" in ChatInput should re-upload the blob (not call /retry endpoint, since no record exists yet).

### EC-6: Server Error During Transcription

- **Scenario**: Audio uploads successfully, but the transcription API call fails (invalid key, quota exceeded, model not found, timeout).
- **Expected**: Server returns error in TranscriptionRecord (status='failed', error='...').
- **Handling**: ChatInput shows error state (Flow C). Audio is preserved on server.
- **Retry**: Uses `POST /api/speech/:id/retry` since audio is already saved.

### EC-7: Concurrent Recording Attempts

- **Scenario**: User double-clicks mic button or tries to start recording while already recording.
- **Expected**: Ignored. Only one recording session can be active at a time. The mic button is replaced by Stop button during recording, preventing double-start.

### EC-8: Browser Microphone API Not Available

- **Scenario**: `navigator.mediaDevices.getUserMedia` is unavailable or throws.
- **Expected**: Show error: "Microphone not available in this browser." This is unlikely in Electron (Chromium) but should be handled defensively.

### EC-9: Audio Format Compatibility

- **Scenario**: MediaRecorder produces a codec not supported by the transcription API.
- **Expected**: MediaRecorder should request `audio/webm;codecs=opus` (widely supported). The server may need to convert to a format the API accepts (e.g., WAV or MP3) if webm/opus is not supported by the chosen provider.
- **Note**: OpenAI's transcription API supports webm, mp3, mp4, wav, etc. — webm should work directly.

### EC-10: Settings Changed While Recording

- **Scenario**: User changes STT provider/model in another tab while a recording is in progress.
- **Expected**: The in-flight transcription uses the config that was active when recording started. No mid-recording config switch.

---

## 4. Out of Scope (v1)

The following are explicitly **NOT** included in this implementation:

1. **Auto-retry / fallback providers** — Only manual retry via user click. No automatic retry on failure. No fallback to a secondary STT provider.

2. **Project-level STT config override** — STT is Global (App-level) only. No per-project provider or model override. The three-layer config hierarchy (Global → Project → Agent) does NOT apply to STT in v1.

3. **TTS (Text-to-Speech)** — No text-to-speech / voice output. This feature is input-only (voice → text).

4. **Real-time streaming transcription** — No live/partial transcription during recording. The full audio is transcribed after recording stops. No interim results displayed.

5. **Keyboard shortcuts for recording** — No hotkey to start/stop recording. Only mouse/tap interaction with the mic button.

6. **Audio editing / trimming** — No ability to trim silence or edit audio before transcription.

7. **Multiple language detection in one recording** — The `language` setting is a single value. Mixed-language recordings rely on the model's capabilities.

8. **Offline transcription** — Requires network access to an OpenAI-compatible API. No local/on-device models.

9. **Transcription history filtering/search** — v1 shows all records sorted by date. No search, filter by status, or filter by project.

10. **Audio waveform in history page** — History page uses simple Play button, not a waveform scrubber. Waveform is only during live recording in ChatInput.

---

## 5. Component / File Impact Summary

| Area | Files Affected | Type |
|------|---------------|------|
| Shared types | `packages/shared/src/types/common.ts` (new branded type) | Modify |
| Shared types | `packages/shared/src/types/settings.ts` (SpeechToTextSettings) | Modify |
| Shared types | `packages/shared/src/types/speech.ts` (TranscriptionRecord) | New |
| Service interfaces | `packages/shared/src/services/interfaces.ts` (ISpeechService) | Modify |
| UI — ChatInput | `packages/ui/src/pages/chat/ChatInput.tsx` | Modify |
| UI — VoiceWaveform | `packages/ui/src/components/VoiceWaveform.tsx` | New |
| UI — Speech Settings | Part of `GlobalSettingsPage.tsx` (new SpeechTab) | Modify |
| UI — History page | `packages/ui/src/pages/speech/TranscriptionHistoryPage.tsx` | New |
| UI — Pages index | `packages/ui/src/pages/index.tsx` | Modify |
| UI — Routes | `packages/ui/src/app/routes.tsx` | Modify |
| UI — Store | `packages/ui/src/stores/useAppStore.ts` (speech slice) | Modify |
| UI — Services mock | `packages/ui/src/services/mock/` (MockSpeechService + data) | New + Modify |
| UI — Services HTTP | `packages/ui/src/services/http/services.ts` (HttpSpeechService) | Modify |
| UI — Service container | `packages/ui/src/services/container.ts` | Modify |
| UI — Recording hook | `packages/ui/src/hooks/useAudioRecorder.ts` | New |
| Server — Routes | `packages/server/src/routes/speech.ts` | New |
| Server — Storage | `packages/server/src/storage/speech.ts` | New |
| Server — DB schema | `packages/server/src/db/speech-schema.ts` | New |
| Server — App | `packages/server/src/app.ts` (register speech routes) | Modify |
| Electron — Main | `apps/desktop/src/main/index.ts` (mic permission IPC) | Modify |
| Electron — Preload | `apps/desktop/src/preload/index.ts` (expose mic permission) | Modify |
