# Design Summary: Speech-to-Text

> Team Lead Summary
> Date: 2026-02-24

## Design Phase Results

All 5 design tasks completed and reviewed:

| Document | Author | Status |
|----------|--------|--------|
| architecture.md | Architect | Done |
| fact-check.md | Fact Checker | All 6 items verified, no blockers |
| ui-design.md | UI/UX Designer | Done |
| requirements.md | Requirements Analyst | 45+ acceptance criteria, 10 edge cases |
| abstraction-review.md | Abstraction Strategist | APPROVED (9/9 pass, 2 minor suggestions) |

## Minor Adjustments from Abstraction Review

Apply during implementation:
1. Use branded `ProjectId`/`ConversationId` in `ISpeechService.transcribe()` metadata (not raw strings)
2. Reuse existing `ProviderTestStatus` type for `SpeechToTextSettings.testStatus`

## Implementation Plan — 11 Tasks

Ordered by dependency. Tasks marked with `||` can run in parallel.

### Phase 1: Foundation (shared types + server DB)

**Task 7**: Shared types — `speech.ts`, `TranscriptionId` in `common.ts`, extend `GlobalSettings`, `ISpeechService` interface
- No dependencies, pure types

**Task 8**: Server DB — `speech-schema.ts`, `speech-db.ts`, `speech-migrate.ts`, `paths.ts` update
- Depends on: Task 7

**Task 9**: Server storage — `SpeechStorage` class
- Depends on: Task 8

**Task 10**: Server routes — `routes/speech.ts`, mount in `app.ts`, init in `index.ts`
- Depends on: Task 9

### Phase 2: UI Service Layer (|| with Phase 1 server tasks)

**Task 11**: UI services — `HttpSpeechService`, `MockSpeechService`, seed data, container update
- Depends on: Task 7

**Task 12**: Store slice — SpeechSlice + SpeechActions in useAppStore
- Depends on: Task 11

### Phase 3: Electron

**Task 13**: Electron integration — mic permission IPC handler + preload + audio URL auth
- Depends on: Task 7

### Phase 4: UI Components

**Task 14**: VoiceWaveform component + useAudioRecorder hook
- Depends on: Task 12

**Task 15**: ChatInput modifications — mic button, recording states, transcription flow
- Depends on: Task 14

**Task 16**: Speech Settings Tab — SpeechSettingsTab component, add to GlobalSettingsPage
- Depends on: Task 12

**Task 17**: Transcription History Page — page + route + navigation
- Depends on: Task 12

### Dependency Graph

```
Task 7 (shared types)
  ├── Task 8 (server DB) → Task 9 (storage) → Task 10 (routes)
  ├── Task 11 (UI services) → Task 12 (store)
  │     ├── Task 14 (waveform + hook) → Task 15 (ChatInput)
  │     ├── Task 16 (Settings Tab)
  │     └── Task 17 (History Page)
  └── Task 13 (Electron)
```

### Parallel Opportunities

- Tasks 8-10 (server) || Tasks 11-12 (UI services) — can run in parallel after Task 7
- Task 13 (Electron) || everything else after Task 7
- Tasks 15, 16, 17 — can run in parallel after Task 12 (if separate engineers)

### File Inventory

**13 new files**: speech.ts (shared), speech-schema/db/migrate (server), storage/speech.ts (server), routes/speech.ts (server), VoiceWaveform.tsx, useAudioRecorder.ts, TranscriptionHistoryPage.tsx, speech/index.ts, SpeechSettingsTab.tsx, http/speech.ts, mock/speech.ts

**18 modified files**: common.ts, settings.ts, types/index.ts, interfaces.ts, app.ts, index.ts (server), paths.ts, useAppStore.ts, container.ts, http/index.ts, mock/index.ts, mock/data.ts, ChatInput.tsx, GlobalSettingsPage.tsx, pages/index.tsx, routes.tsx, main/index.ts, preload/index.ts
