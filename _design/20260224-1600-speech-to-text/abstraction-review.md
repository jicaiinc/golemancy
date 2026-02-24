# Abstraction Review: Speech-to-Text Architecture

> Reviewer: Abstraction Strategist
> Date: 2026-02-24
> Status: **APPROVED with minor suggestions**

---

## Summary

The architecture is well-designed and consistently follows existing codebase patterns. All 9 review criteria pass. There are 3 minor suggestions (none blocking) to improve type safety and reduce redundancy.

---

## 1. Service Interface Design (`ISpeechService`)

**Verdict: PASS**

The 8-method interface is clean, focused, and covers all requirements:

- `transcribe()` accepts `File | Blob` (browser-native types) — correct for a client-side service interface
- `getAudioUrl()` returns `string` synchronously — consistent with `IWorkspaceService.getFileUrl()` pattern
- `testProvider()` takes the full `SpeechToTextSettings` config — correct since STT is configured independently from chat providers
- `listHistory()` uses `{ limit, offset }` — deliberately different from `PaginationParams` (`{ page, pageSize }`). This is appropriate: history is append-only log data best served with cursor-style pagination, not random page access. **Acceptable divergence.**
- `clearHistory()` returns `{ deletedCount, freedBytes }` — actionable feedback for the UI
- `retry()` and `deleteRecord()` follow standard patterns

**Minor suggestion**: In `transcribe()` metadata, use branded types instead of raw strings:
```typescript
// Current (architecture.md):
metadata: { audioDurationMs: number; projectId?: string; conversationId?: string }

// Suggested:
metadata: { audioDurationMs: number; projectId?: ProjectId; conversationId?: ConversationId }
```
All other service interfaces (`IConversationService`, `IAgentService`, etc.) use branded ID types in their signatures. The HTTP implementation can cast from strings, but the interface contract should enforce type safety. This is a minor consistency fix.

---

## 2. Type System

**Verdict: PASS**

- `TranscriptionId = Brand<string, 'TranscriptionId'>` — follows the exact pattern of the existing 10 branded types in `common.ts`. Correct placement.
- New `speech.ts` file in `packages/shared/src/types/` — clean separation, re-exported via `index.ts`.
- `TranscriptionRecord` — well-defined, all fields serve clear purposes. `usedInMessage: boolean` is a nice touch for analytics.
- `SpeechStorageUsage` — minimal and sufficient.
- `SttProviderType = 'openai' | 'openai-compatible'` — deliberately narrower than `ProviderSdkType`. Correct: STT only supports OpenAI-compatible APIs.

**Minor suggestion**: `testStatus?: 'untested' | 'ok' | 'error'` in `SpeechToTextSettings` is identical to the existing `ProviderTestStatus` type in `settings.ts`. Consider reusing it:
```typescript
// In speech.ts:
import type { ProviderTestStatus } from './settings'

export interface SpeechToTextSettings {
  // ...
  testStatus?: ProviderTestStatus  // reuse existing type
}
```
This is purely a DRY improvement — functionally equivalent either way.

---

## 3. Module Boundaries

**Verdict: PASS**

Strict one-way dependency `desktop → ui → shared ← server` is fully respected:

| Layer | New files | Imports from |
|-------|-----------|--------------|
| `shared` | `types/speech.ts`, `services/interfaces.ts` ext | `types/common.ts` only (within shared) |
| `server` | `db/speech-*.ts`, `storage/speech.ts`, `routes/speech.ts` | `@golemancy/shared`, server internals |
| `ui` | `services/http/speech.ts`, `services/mock/speech.ts`, store slice | `@golemancy/shared`, UI internals |
| `desktop` | IPC handler, preload extension | Electron APIs, no cross-package imports |

No boundary violations detected.

---

## 4. Storage Split

**Verdict: PASS**

The storage split aligns perfectly with the project's philosophy:

| Data | Storage | Reasoning |
|------|---------|-----------|
| Transcription records | SQLite (`speech.db`) | High-frequency, queryable, sortable, paginated — exact SQLite use case |
| Audio files | File system (`dataDir/speech/audio/`) | Binary blobs, not queryable, referenced by UUID — exact file system use case |
| STT config | `settings.json` (file) | Human-readable config, low-frequency writes — matches existing settings pattern |

**Global `speech.db`** (separate from per-project DBs) is the correct choice because:
1. Speech history is global (not project-scoped per requirement)
2. Storage usage spans all projects
3. A dedicated DB file is self-contained and can be deleted independently

The decision to create a separate `speech-db.ts` factory (Option 1 in fact-check) rather than parameterizing the existing `createDatabase` is correct — avoids modifying working code.

---

## 5. Dependency Direction

**Verdict: PASS**

No circular or wrong-direction dependencies found.

Dependency graph for new code:
```
shared/types/speech.ts → shared/types/common.ts  (within shared ✓)
shared/services/interfaces.ts → shared/types/*     (within shared ✓)
server/routes/speech.ts → server/storage/speech.ts  (within server ✓)
server/routes/speech.ts → server/storage/settings.ts (within server ✓)
server/storage/speech.ts → server/db/speech-db.ts    (within server ✓)
ui/services/http/speech.ts → shared (ISpeechService) (ui → shared ✓)
ui/stores/useAppStore.ts → ui/services/container.ts  (within ui ✓)
desktop/main → electron APIs                          (desktop only ✓)
```

The route handler's dependency on both `SpeechStorage` and `ISettingsService` (for reading STT config) is appropriate — the route is the orchestration layer that combines config + storage + AI SDK.

---

## 6. Store Slice Design

**Verdict: PASS**

The `SpeechSlice` + `SpeechActions` follow the exact same pattern as the existing 13 slices:

- **State shape**: `speechHistory: TranscriptionRecord[]`, `speechHistoryLoading: boolean`, `speechStorageUsage: SpeechStorageUsage | null` — minimal, no over-engineering
- **Actions**: call `getServices().speech.*`, update state with loading guards — standard pattern
- **`transcribeAudio()` returns the record without adding to history** — correct: the ChatInput caller manages the flow (append text to input), and the history page loads independently via `loadSpeechHistory()`
- **Global scope**: Unlike project-scoped slices (agents, conversations, etc.), speech state is not cleared on `selectProject()` or `clearProject()`. This is correct because speech history is global.

One note: the `speechHistory` and `speechStorageUsage` are only loaded on the TranscriptionHistoryPage visit (lazy), not eagerly on app start. This follows the workspace slice pattern (`workspaceEntries` is lazy-loaded on page visit). Good.

---

## 7. Route Design

**Verdict: PASS**

The 8 endpoints are RESTful and consistent with existing route patterns:

| Endpoint | Method | Purpose | Pattern match |
|----------|--------|---------|---------------|
| `/api/speech/transcribe` | POST | Upload + transcribe | Action endpoint (like `/api/chat/send`) |
| `/api/speech/history` | GET | List records | Collection endpoint |
| `/api/speech/audio/:audioFileId` | GET | Stream audio | Resource endpoint (like `/api/projects/:id/uploads/*`) |
| `/api/speech/:id` | DELETE | Delete single | Standard resource delete |
| `/api/speech/:id/retry` | POST | Retry failed | Action on resource (like `/api/cron-jobs/:id/trigger`) |
| `/api/speech/history` | DELETE | Clear all | Bulk delete (unique but clear) |
| `/api/speech/storage` | GET | Usage stats | Info endpoint (like `/api/dashboard/summary`) |
| `/api/speech/test` | POST | Test provider | Action endpoint (like `/api/settings/test-provider`) |

The route mounting pattern (`app.route('/api/speech', createSpeechRoutes(deps))`) follows the established factory pattern with dependency injection. Consistent.

---

## 8. Settings Type Design

**Verdict: PASS**

Adding `speechToText?: SpeechToTextSettings` as an optional field on `GlobalSettings` is the correct approach:

- **Leverages existing infrastructure**: `FileSettingsStorage.get()` / `.update()` already handles `GlobalSettings`. No new storage code needed for config.
- **Optional field (`?`)**: STT is an opt-in feature. Before first configuration, `speechToText` is `undefined`, and the mic button is hidden (`speechToText?.enabled` check). Clean progressive disclosure.
- **Separate from `providers`**: STT config is deliberately NOT inside the `providers: Record<string, ProviderEntry>` map. This is correct because:
  1. STT is a single-provider config (not a collection)
  2. STT models (`whisper-1`, `gpt-4o-transcribe`) are different from chat models
  3. The test mechanism is different (audio transcription vs text generation)
- **`apiKey` in plain JSON**: Same security model as existing `ProviderEntry.apiKey`. Consistent (both stored in `settings.json` on local filesystem, accessed only via localhost with per-session auth token).

---

## 9. Separation of Concerns

**Verdict: PASS**

Clean boundaries between the three concerns:

```
┌─────────────────────┐  ┌──────────────────────┐  ┌────────────────────┐
│   Speech Config      │  │  Speech Records      │  │  Audio Files       │
│   (settings.json)    │  │  (speech.db)          │  │  (speech/audio/)   │
│                      │  │                       │  │                    │
│  SpeechToTextSettings│  │  TranscriptionRecord  │  │  {uuid}.webm       │
│  - enabled           │  │  - id, status, text   │  │                    │
│  - providerType      │  │  - audioFileId ───────┼──┼──► UUID reference  │
│  - apiKey, baseUrl   │  │  - timestamps         │  │                    │
│  - model, language   │  │  - metadata           │  │                    │
│  - testStatus        │  │                       │  │                    │
└──────────┬───────────┘  └──────────┬────────────┘  └────────────────────┘
           │                         │
           │  ┌──────────────────┐   │
           └──►  Route Handler   ◄───┘
              │  (orchestrator)  │
              └──────────────────┘
```

- **Config** is read-only during transcription (never mutated by the transcription flow)
- **Records** reference audio files by UUID, not by file path (loose coupling)
- **Audio persistence happens before transcription** (fail-safe: audio never lost)
- **UI mirrors this split**: Settings Tab for config, History Page for records — no mixing

---

## Final Verdict

| # | Criteria | Verdict |
|---|----------|---------|
| 1 | Service interface design | **PASS** (minor: use branded IDs in metadata) |
| 2 | Type system | **PASS** (minor: reuse ProviderTestStatus) |
| 3 | Module boundaries | **PASS** |
| 4 | Storage split | **PASS** |
| 5 | Dependency direction | **PASS** |
| 6 | Store slice design | **PASS** |
| 7 | Route design | **PASS** |
| 8 | Settings type design | **PASS** |
| 9 | Separation of concerns | **PASS** |

**Overall: APPROVED** — Architecture is clean, consistent with existing patterns, and ready for implementation. The 2 minor suggestions (branded IDs in metadata, reuse `ProviderTestStatus`) are non-blocking improvements that can be applied during implementation.

---

## Additional Notes

1. **`experimental_transcribe` audio parameter format**: The architecture uses `{ data: Buffer, mimeType: string }` but the fact-check lists the signature as `audio: Buffer | Uint8Array | URL`. The Vercel AI SDK `DataContent` type likely supports both forms. Verify the exact accepted object shape during implementation — the `{ data, mimeType }` form provides better MIME type hinting and should be preferred if supported.

2. **`HttpSpeechService.transcribe()` uses raw `fetch()` instead of `fetchJson()`**: This is correct and necessary because `fetchJson()` sets `Content-Type: application/json`, which would conflict with `multipart/form-data` boundary auto-detection. The architecture correctly handles this by using raw `fetch()` for the multipart upload. Good attention to detail.

3. **No `ArtifactId`-style naming concern**: The new `TranscriptionId` is domain-appropriate. It's not `SpeechId` or `AudioId` — it specifically identifies the transcription record, which is the primary entity. Clean naming.
