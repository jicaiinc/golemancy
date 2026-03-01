# UI/UX Design: Speech-to-Text Feature

> Designer: UI/UX Designer
> Date: 2026-02-24
> Status: Draft

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [ChatInput Voice Integration](#2-chatinput-voice-integration)
3. [VoiceWaveform Component](#3-voicewaveform-component)
4. [Speech Settings Tab](#4-speech-settings-tab)
5. [Transcription History Page](#5-transcription-history-page)
6. [Motion & Animation Specs](#6-motion--animation-specs)
7. [Component Inventory](#7-component-inventory)

---

## 1. Design Principles

- **Pixel art aesthetic**: No border-radius anywhere, block shadows, Press Start 2P for labels, JetBrains Mono for content
- **Dark theme primary**: All mockups shown in dark theme (colors from `.dark` CSS variables)
- **Minimal mode switching**: Recording mode replaces the textarea inline — no modal overlays, no separate screens
- **Progressive disclosure**: Simple by default, details on demand (e.g. collapsed error details)
- **Existing patterns**: Reuse PixelButton, PixelCard, PixelInput, PixelTabs — no new base components except VoiceWaveform

### Design Tokens Reference

| Token | Dark Value | Usage |
|-------|-----------|-------|
| `accent-blue` | `#60A5FA` | Recording active state, focus rings |
| `accent-green` | `#4ADE80` | Success state, primary actions |
| `accent-red` | `#F87171` | Error/failed state, danger actions |
| `accent-amber` | `#FBBF24` | Warning, untested status |
| `accent-purple` | `#A78BFA` | Transcribing/processing state |
| `text-primary` | `#E8ECF1` | Primary text |
| `text-secondary` | `#8B95A5` | Secondary labels |
| `text-dim` | `#505A6A` | Disabled/placeholder text |
| `border-dim` | `#2E3A4E` | Default borders |
| `border-bright` | `#4A5568` | Hover borders |
| `surface` | `#1E2430` | Card/input backgrounds |
| `deep` | `#141820` | Sunken backgrounds |
| `elevated` | `#2A3242` | Raised surfaces |
| `void` | `#0B0E14` | Page background |

---

## 2. ChatInput Voice Integration

### 2.1 Layout — Microphone Button Placement

The microphone button sits in the **bottom toolbar** (the `flex items-center justify-between px-2 py-1` div), positioned **to the right of the attach button** and **to the left of the Send/Stop button**. This keeps all input actions in a single row.

```
Current toolbar layout:
┌──────────────────────────────────────────────────────────┐
│ [📎 Attach]                                    [Send ▶] │
└──────────────────────────────────────────────────────────┘

New toolbar layout:
┌──────────────────────────────────────────────────────────┐
│ [📎 Attach] [🎤 Mic]                           [Send ▶] │
└──────────────────────────────────────────────────────────┘
```

The mic button uses the same icon-button style as the attach button: `p-0.5 text-text-dim hover:text-accent-blue transition-colors disabled:opacity-50`.

When STT is **not configured** (settings.speechToText.enabled is false or no provider), the mic button is hidden entirely (not disabled — hidden). This avoids confusion.

### 2.2 State Machine

```
                    ┌─────────┐
                    │  IDLE   │ ◄──────────────────────┐
                    └────┬────┘                        │
                         │ click mic                   │
                         ▼                             │
                 ┌───────────────┐                     │
                 │  PERMISSION   │──── denied ─────────┤
                 │  (requesting) │                     │
                 └───────┬───────┘                     │
                         │ granted                     │
                         ▼                             │
                 ┌───────────────┐                     │
            ┌────│  RECORDING    │◄── retry ──┐        │
            │    └───────┬───────┘            │        │
            │            │ click stop /       │        │
            │            │ click mic again    │        │
            │            ▼                    │        │
            │    ┌───────────────┐            │        │
            │    │ TRANSCRIBING  │            │        │
            │    └──┬─────────┬──┘            │        │
            │       │         │               │        │
            │    success    failed             │        │
            │       │         │               │        │
            │       ▼         ▼               │        │
            │  ┌────────┐ ┌────────┐          │        │
            │  │SUCCESS │ │ FAILED │──────────┘        │
            │  └───┬────┘ └───┬────┘                   │
            │      │          │ dismiss                 │
            │      │ text     │                        │
            │      │ fills in │                        │
            │      ▼          ▼                        │
            │   (back to idle)────────────────────────>│
            │                                          │
            └── cancel (during recording) ─────────────┘
```

### 2.3 State: IDLE (default)

The textarea and toolbar look exactly as they do today, plus the mic button.

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  Type a message...                                       │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ [📎] [🎤]                                       [Send] │
└──────────────────────────────────────────────────────────┘

[📎] = ImageAttachIcon, 14x12px, text-dim → hover:accent-blue
[🎤] = MicrophoneIcon, 14x14px, text-dim → hover:accent-blue
[Send] = PixelButton primary sm
```

### 2.4 State: RECORDING

When recording starts, the **textarea is replaced** by a recording overlay within the same container. The textarea is hidden (display: none), and the recording UI takes its place. This keeps the overall ChatInput height stable.

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   ▊▊  ▊   ▊▊▊  ▊  ▊▊  ▊▊▊  ▊  ▊▊   ▊▊  ▊   ▊▊▊      │
│   ▊▊▊ ▊▊  ▊▊▊▊ ▊▊ ▊▊▊ ▊▊▊▊ ▊▊ ▊▊▊  ▊▊▊ ▊▊  ▊▊▊▊     │
│   ▊▊▊▊▊▊▊ ▊▊▊▊▊▊▊ ▊▊▊▊▊▊▊▊▊▊▊ ▊▊▊▊ ▊▊▊▊▊▊▊ ▊▊▊▊▊    │
│                                                          │
│   🔴 Recording...                          00:05         │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ [Cancel]                                     [■ Stop]    │
└──────────────────────────────────────────────────────────┘

Key details:
- VoiceWaveform component: Canvas-based pixel bars (see Section 3)
- 🔴 = pulsing red dot (accent-red, pixel-pulse animation)
- "Recording..." = font-mono text-[12px] text-accent-blue
- Timer "00:05" = font-mono text-[12px] text-text-secondary, right-aligned
- [Cancel] = PixelButton ghost sm, replaces attach+mic buttons
- [■ Stop] = PixelButton danger sm with square icon, replaces Send button

Container border changes to: border-accent-blue (2px solid)
Background gets subtle blue tint: bg-accent-blue/5
```

**Recording toolbar replaces normal toolbar entirely:**
- Left side: `[Cancel]` ghost button — stops recording and discards audio
- Right side: `[■ Stop]` danger button — stops recording and proceeds to transcription

### 2.5 State: TRANSCRIBING

After stopping recording, the UI transitions to a transcribing state. The waveform freezes (static snapshot) and a spinner replaces the recording indicator.

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   ▊▊  ▊   ▊▊▊  ▊  ▊▊  ▊▊▊  ▊  ▊▊   ▊▊  ▊   ▊▊▊      │
│   ▊▊▊ ▊▊  ▊▊▊▊ ▊▊ ▊▊▊ ▊▊▊▊ ▊▊ ▊▊▊  ▊▊▊ ▊▊  ▊▊▊▊     │
│   ▊▊▊▊▊▊▊ ▊▊▊▊▊▊▊ ▊▊▊▊▊▊▊▊▊▊▊ ▊▊▊▊ ▊▊▊▊▊▊▊ ▊▊▊▊▊    │
│                                                (frozen)  │
│   [■ ■ ■] Transcribing...                     00:05     │
│                                                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
└──────────────────────────────────────────────────────────┘

Key details:
- Waveform bars freeze at last recorded values, color changes to accent-purple
- [■ ■ ■] = PixelSpinner sm (three pulsing green dots), inline
- "Transcribing..." = font-mono text-[12px] text-accent-purple
- Timer shows final recording duration (static, no longer counting)
- Bottom toolbar is empty — no buttons during transcription (non-cancellable)
- Container border: border-accent-purple
```

### 2.6 State: SUCCESS

Transcription succeeded. The text is inserted into the textarea and the UI returns to normal. There is a brief 1.5s success flash before fully returning to idle.

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  Hello, I'd like to discuss the new feature...           │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ [📎] [🎤]  ✅ Transcribed (5s)              [Send ▶]    │
└──────────────────────────────────────────────────────────┘

Key details:
- Textarea reappears with transcribed text pre-filled
- Textarea auto-resizes to fit content (existing behavior)
- Success indicator: "✅ Transcribed (5s)" in text-accent-green, font-mono text-[10px]
  - Shows in the toolbar between mic button and Send button
  - Fades out after 1.5s using motion/react AnimatePresence
- User can edit the text before sending (it's just pre-filled, not auto-sent)
- Cursor is placed at end of transcribed text
- Container border returns to normal (border-border-dim)
```

### 2.7 State: FAILED

Transcription failed. Show error inline with retry option.

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ❌ Transcription failed                                 │
│  API error: insufficient_quota                           │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ [📎] [🎤]                           [Retry] [Dismiss]   │
└──────────────────────────────────────────────────────────┘

Key details:
- Textarea area shows error message:
  - "❌ Transcription failed" = font-mono text-[12px] text-accent-red
  - Error detail below = font-mono text-[11px] text-text-dim
- Container border: border-accent-red
- Background: bg-accent-red/5
- Toolbar:
  - Left: normal attach + mic buttons (for starting a new recording)
  - Right: [Retry] = PixelButton secondary sm, [Dismiss] = PixelButton ghost sm
- [Retry] re-submits the same audio file for transcription
- [Dismiss] returns to IDLE state (audio is still saved server-side for history)
```

### 2.8 State: PERMISSION DENIED

If microphone permission is denied by the OS, show inline message.

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  Type a message...                                       │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ [📎] [🎤⚠]  Microphone access denied       [Send ▶]    │
└──────────────────────────────────────────────────────────┘

Key details:
- Mic button shows warning indicator (accent-amber overlay)
- Status text: "Microphone access denied" in text-accent-amber text-[10px]
- Fades out after 3s
- Next click on mic button re-requests permission
```

### 2.9 ChatInput Props Changes

```typescript
// New props added to ChatInput
interface ChatInputProps {
  onSend: (content: string, files?: FileUIPart[]) => void
  onStop?: () => void
  isStreaming?: boolean
  disabled?: boolean
  // NEW:
  sttEnabled?: boolean  // controls visibility of mic button
  onTranscribe?: (audioBlob: Blob, durationMs: number) => Promise<TranscriptionRecord>
  onRetryTranscribe?: (recordId: TranscriptionId) => Promise<TranscriptionRecord>
}
```

---

## 3. VoiceWaveform Component

### 3.1 Overview

A Canvas-based component that renders real-time audio levels as pixel-art block bars. Uses Web Audio API `AnalyserNode` for frequency data.

### 3.2 Visual Specification

```
Canvas dimensions: 100% width × 60px height
Bar count: 24 bars (responsive, evenly spaced)
Bar width: 4px (fixed pixel size)
Bar gap: 2px
Bar min height: 4px (2 pixel blocks)
Bar max height: 56px (fills canvas minus 2px top/bottom padding)

Bar colors:
  - Recording (active): accent-blue (#60A5FA)
  - Transcribing (frozen): accent-purple (#A78BFA)
  - Idle/inactive: border-dim (#2E3A4E)

Bar shape: Rectangular blocks, no border-radius (pixel art)
Each bar is quantized to 4px increments (discrete pixel blocks, not smooth)
```

### 3.3 ASCII Visualization

```
Active recording waveform (bars respond to audio volume):

     ▊                                   ▊
     ▊       ▊              ▊            ▊
     ▊   ▊   ▊   ▊         ▊   ▊        ▊
  ▊  ▊   ▊   ▊   ▊    ▊    ▊   ▊    ▊   ▊
  ▊  ▊   ▊   ▊   ▊    ▊    ▊   ▊    ▊   ▊   ▊
  ▊  ▊   ▊   ▊   ▊  ▊ ▊  ▊ ▊   ▊  ▊ ▊   ▊   ▊
  ▊  ▊   ▊   ▊   ▊  ▊ ▊  ▊ ▊   ▊  ▊ ▊   ▊   ▊  ▊
  ▊  ▊  ▊▊  ▊▊  ▊▊  ▊ ▊  ▊ ▊  ▊▊  ▊ ▊  ▊▊  ▊▊  ▊
────────────────────────────────────────────────────
         accent-blue (#60A5FA) bars

Frozen waveform (during transcription):

     ▊       ▊              ▊            ▊
     ▊   ▊   ▊   ▊         ▊   ▊        ▊
  ▊  ▊   ▊   ▊   ▊    ▊    ▊   ▊    ▊   ▊
  ▊  ▊   ▊   ▊   ▊  ▊ ▊  ▊ ▊   ▊  ▊ ▊   ▊   ▊
  ▊  ▊  ▊▊  ▊▊  ▊▊  ▊ ▊  ▊ ▊  ▊▊  ▊ ▊  ▊▊  ▊▊  ▊
────────────────────────────────────────────────────
        accent-purple (#A78BFA) bars

Silence (no audio / idle):

  ▊  ▊  ▊▊  ▊▊  ▊▊  ▊ ▊  ▊ ▊  ▊▊  ▊ ▊  ▊▊  ▊▊  ▊
────────────────────────────────────────────────────
         border-dim (#2E3A4E) — minimum height bars
```

### 3.4 Component Interface

```typescript
interface VoiceWaveformProps {
  analyser: AnalyserNode | null  // null = show idle bars
  frozen?: boolean               // true = stop updating, show last frame
  color?: 'blue' | 'purple'     // default: 'blue'
  className?: string
}
```

### 3.5 Implementation Notes

- Use `requestAnimationFrame` loop, reading `analyser.getByteFrequencyData()`
- Quantize bar heights to 4px steps: `Math.round(height / 4) * 4`
- When `frozen=true`, stop rAF loop but keep last frame rendered
- When `analyser=null`, render all bars at minimum height with border-dim color
- Canvas should use `devicePixelRatio` for crisp rendering on HiDPI displays
- Use `image-rendering: pixelated` on the canvas element

---

## 4. Speech Settings Tab

### 4.1 Tab Addition

Add a new tab to `SETTINGS_TABS` in `GlobalSettingsPage.tsx`:

```typescript
const SETTINGS_TABS = [
  { id: 'general', label: 'General' },
  { id: 'providers', label: 'Providers' },
  { id: 'speech', label: 'Speech' },  // NEW
]
```

The tab renders `<SpeechTab />` when active.

### 4.2 Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Global Settings                                            │
│                                                             │
│  [General] [Providers] [Speech]                             │
│  ──────────────────────────────                             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  SPEECH-TO-TEXT                                      │    │
│  │                                                      │    │
│  │  Enable voice input in chat                          │    │
│  │  ┌──────────────────┐                                │    │
│  │  │ [■] Enabled      │  ← toggle switch               │    │
│  │  └──────────────────┘                                │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  PROVIDER                                           │    │
│  │                                                      │    │
│  │  Provider Type                                       │    │
│  │  ┌───────────────────────────────────────────┐       │    │
│  │  │ OpenAI                               [▼]  │       │    │
│  │  └───────────────────────────────────────────┘       │    │
│  │                                                      │    │
│  │  API Key                                             │    │
│  │  ┌───────────────────────────────────────────┐       │    │
│  │  │ sk-••••••••                          [👁]  │       │    │
│  │  └───────────────────────────────────────────┘       │    │
│  │                                                      │    │
│  │  Base URL (optional — for proxy)                     │    │
│  │  ┌───────────────────────────────────────────┐       │    │
│  │  │ https://api.openai.com/v1                  │       │    │
│  │  └───────────────────────────────────────────┘       │    │
│  │                                                      │    │
│  │  Model                                               │    │
│  │  ┌───────────────────────────────────────────┐       │    │
│  │  │ gpt-4o-mini-transcribe              [▼]   │       │    │
│  │  └───────────────────────────────────────────┘       │    │
│  │                                                      │    │
│  │  Language (optional — auto-detect if empty)          │    │
│  │  ┌───────────────────────────────────────────┐       │    │
│  │  │                                            │       │    │
│  │  └───────────────────────────────────────────┘       │    │
│  │                                                      │    │
│  │  ┌──────────┐  ⚪ Untested                          │    │
│  │  │   Test   │                                        │    │
│  │  └──────────┘                                        │    │
│  │                                                      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ─────────────────────────────────────────────────────      │
│  Golemancy v0.x — AI Agent Orchestrator ...                 │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Detailed Component Breakdown

#### Enable/Disable Card

```
┌────────────────────────────────────────────────────┐
│  SPEECH-TO-TEXT                                     │  ← font-pixel 10px text-secondary
│                                                     │
│  Enable voice input for chat conversations          │  ← text-[11px] text-dim
│                                                     │
│  ┌──┐                                              │
│  │██│ Enabled                                      │  ← pixel toggle + label
│  └──┘                                              │
└────────────────────────────────────────────────────┘

Toggle switch (pixel style):
  OFF: [  ■·] bg-deep border-2 border-border-dim, square knob at left
  ON:  [·■  ] bg-accent-green border-2 border-accent-green, square knob at right
  Size: 32px × 16px, knob 12px × 12px
  No border-radius (pixel art)
```

Uses PixelCard default variant. When disabled, the Provider card below is greyed out (opacity-50, pointer-events-none).

#### Provider Configuration Card

Uses PixelCard default variant. Fields:

**Provider Type** — `<select>` dropdown:
```
Options:
  - "OpenAI" (providerType: 'openai')
  - "Custom (OpenAI-Compatible)" (providerType: 'openai-compatible')

Styling: Same as existing selects in GlobalSettingsPage
  h-9 bg-deep px-3 font-mono text-[13px] text-text-primary
  border-2 border-border-dim shadow-pixel-sunken
  focus:border-accent-blue outline-none cursor-pointer
```

**API Key** — PixelInput with show/hide toggle:
```
- type="password" by default
- Small "Show"/"Hide" button next to the field (PixelButton ghost sm)
- Same pattern as ProviderCard in existing settings
```

**Base URL** — PixelInput:
```
- When providerType = 'openai': optional (placeholder "Leave empty for default, or enter proxy URL")
- When providerType = 'openai-compatible': required (placeholder "https://api.example.com/v1")
```

**Model** — Combobox (select + custom input):
```
For OpenAI providerType:
  Preset options: gpt-4o-mini-transcribe, gpt-4o-transcribe, whisper-1
  Plus an "Other..." option that switches to a text input

For Custom providerType:
  Just a text input (PixelInput), placeholder "model-id"

Implementation: <select> with preset models + last option "Custom..."
  When "Custom..." selected, replace with <input> + [Back to list] link
```

**Language** — PixelInput:
```
- Optional text field
- Placeholder: "Auto-detect (leave empty)"
- Helper text: "ISO 639-1 code (e.g. en, zh, ja)"
- text-[11px] text-dim
```

#### Test Connection Section

```
Within the Provider card, at the bottom:

┌────────────────────────────────────────────────┐
│                                                │
│  [  Test  ]   ⚪ Untested                     │
│                                                │
└────────────────────────────────────────────────┘

States:

UNTESTED:
  [  Test  ]   ⚪ Untested
  Button: PixelButton secondary sm
  Status: text-[10px] text-text-dim

TESTING:
  [  ...   ]   🔵 Testing...
  Button: disabled, shows "..."
  Status: text-[10px] text-accent-blue animate-pulse

OK:
  [Re-test ]   ✅ OK (350ms)
  Button: PixelButton ghost sm, label "Re-test"
  Status: text-[10px] text-accent-green
  Latency shown in parentheses

ERROR:
  [  Test  ]   ❌ Failed
  Button: PixelButton secondary sm
  Status: text-[10px] text-accent-red
  Error detail shown below in accent-red/10 bg box:
  ┌────────────────────────────────────────────┐
  │ Error: Invalid API key provided            │  ← text-[10px] text-accent-red font-mono
  └────────────────────────────────────────────┘
```

This mirrors the exact same test pattern used in the existing ProviderCard component.

#### Save Behavior

- Auto-save on blur / change (like existing provider settings)
- Brief "Saved!" flash in accent-green, same pattern as DefaultModelSection
- Test runs automatically after saving credentials (same as existing ProviderCard auto-test)

### 4.4 Full ASCII Mockup — Speech Tab (OpenAI selected)

```
[General] [Providers] [Speech]
═══════════════════════════════

┌──────────────────────────────────────────────────────────┐
│  SPEECH-TO-TEXT                          font-pixel 10px  │
│                                                          │
│  Enable voice input for chat conversations               │
│  [·██] Enabled                            accent-green    │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  PROVIDER                               font-pixel 10px  │
│                                                          │
│  PROVIDER TYPE                          font-pixel 8px    │
│  ┌──────────────────────────────────────────────┐        │
│  │ OpenAI                                  [▼]  │        │
│  └──────────────────────────────────────────────┘        │
│                                                          │
│  API KEY                                font-pixel 8px    │
│  ┌──────────────────────────────────────────────┐        │
│  │ sk-••••••••                                  │ [Show] │
│  └──────────────────────────────────────────────┘        │
│                                                          │
│  BASE URL (OPTIONAL)                    font-pixel 8px    │
│  ┌──────────────────────────────────────────────┐        │
│  │ Leave empty for default, or enter proxy URL  │        │
│  └──────────────────────────────────────────────┘        │
│                                                          │
│  MODEL                                  font-pixel 8px    │
│  ┌──────────────────────────────────────────────┐        │
│  │ gpt-4o-mini-transcribe                  [▼]  │        │
│  └──────────────────────────────────────────────┘        │
│                                                          │
│  LANGUAGE                               font-pixel 8px    │
│  ┌──────────────────────────────────────────────┐        │
│  │ Auto-detect (leave empty)                    │        │
│  └──────────────────────────────────────────────┘        │
│  ISO 639-1 code (e.g. en, zh, ja)       text-dim 11px    │
│                                                          │
│  [  Test  ]  ✅ OK (280ms)                               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 4.5 Full ASCII Mockup — Speech Tab (Custom selected)

```
[General] [Providers] [Speech]
═══════════════════════════════

┌──────────────────────────────────────────────────────────┐
│  SPEECH-TO-TEXT                                           │
│  Enable voice input for chat conversations               │
│  [·██] Enabled                                           │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  PROVIDER                                                │
│                                                          │
│  PROVIDER TYPE                                           │
│  ┌──────────────────────────────────────────────┐        │
│  │ Custom (OpenAI-Compatible)              [▼]  │        │
│  └──────────────────────────────────────────────┘        │
│                                                          │
│  API KEY                                                 │
│  ┌──────────────────────────────────────────────┐        │
│  │ sk-••••••••                                  │ [Show] │
│  └──────────────────────────────────────────────┘        │
│                                                          │
│  BASE URL (REQUIRED)                                     │
│  ┌──────────────────────────────────────────────┐        │
│  │ https://api.example.com/v1                   │        │
│  └──────────────────────────────────────────────┘        │
│                                                          │
│  MODEL                                                   │
│  ┌──────────────────────────────────────────────┐        │
│  │ whisper-large-v3                             │        │
│  └──────────────────────────────────────────────┘        │
│                                                          │
│  LANGUAGE                                                │
│  ┌──────────────────────────────────────────────┐        │
│  │ Auto-detect (leave empty)                    │        │
│  └──────────────────────────────────────────────┘        │
│  ISO 639-1 code (e.g. en, zh, ja)                        │
│                                                          │
│  [  Test  ]  ⚪ Untested                                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 5. Transcription History Page

### 5.1 Routing

New route in `routes.tsx`:

```typescript
<Route path="/speech-history" element={<TranscriptionHistoryPage />} />
```

This is a **global-level** page (not project-scoped), using `GlobalLayout` — same level as `/settings` and `/dashboard`.

### 5.2 Navigation Entry

Add a link to the transcription history from two places:

1. **Speech Settings Tab** — a link at the bottom of the Speech tab:
   ```
   View transcription history →    (PixelButton link variant)
   ```

2. **TopBar** — if TopBar has navigation, add a "History" link. Otherwise, accessible from Speech Settings only.

### 5.3 Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [TopBar]                                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Transcription History                                      │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 📊 42 records • 128.5 MB used           [Clear All]  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ── Today ──────────────────────────────────────────────    │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ✅ 00:12  "Hello, I'd like to discuss the..."        │  │
│  │    OpenAI / gpt-4o-transcribe  →  Project Alpha       │  │
│  │                              [▶ Play] [📋 Copy] [🗑]  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ❌ 00:05  Transcription failed: API error             │  │
│  │    OpenAI / whisper-1  →  Project Beta                │  │
│  │                        [▶ Play] [🔄 Retry] [📋] [🗑]  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ── Yesterday ──────────────────────────────────────────    │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ✅ 00:30  "We need to implement the auth..."         │  │
│  │    Custom / whisper-large-v3  →  Project Gamma        │  │
│  │                              [▶ Play] [📋 Copy] [🗑]  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ── Feb 20, 2026 ──────────────────────────────────────    │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ⏳ 00:08  Transcribing...                             │  │
│  │    OpenAI / gpt-4o-mini-transcribe  →  Project Alpha  │  │
│  │                                         [▶ Play] [🗑]  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 💾 Storage: 128.5 MB (42 records)    [Clear All]   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 Storage Usage Header

```
┌──────────────────────────────────────────────────────────┐
│  📊 42 records • 128.5 MB used              [Clear All]  │
└──────────────────────────────────────────────────────────┘

Implementation:
- PixelCard default variant
- Left side:
  - "📊" or just a pixel icon
  - Record count: font-mono text-[12px] text-text-primary
  - "•" separator
  - Storage size: font-mono text-[12px] text-text-secondary
- Right side:
  - [Clear All] = PixelButton danger sm

Clear All confirmation (inline, same pattern as ProviderCard delete):
┌──────────────────────────────────────────────────────────┐
│  Delete all 42 records and free 128.5 MB?                │
│                                    [Confirm]  [Cancel]   │
└──────────────────────────────────────────────────────────┘
```

### 5.5 Date Group Headers

```
── Today ──────────────────────────────────────────────

Style:
- font-pixel text-[9px] text-text-dim
- Horizontal line: border-t-2 border-border-dim, with text overlaid (flex + gap pattern)
- Date formats:
  - "Today" / "Yesterday" (relative)
  - "Feb 20, 2026" (older dates, absolute)
```

### 5.6 Record Card — Detailed Breakdown

Each record is a PixelCard interactive variant.

```
┌──────────────────────────────────────────────────────────┐
│  [STATUS]  [DURATION]  [TEXT_PREVIEW / ERROR]            │
│  [META_LINE]                        [ACTION_BUTTONS]     │
└──────────────────────────────────────────────────────────┘
```

#### Status Icons

| Status | Icon | Color |
|--------|------|-------|
| `success` | `✅` | accent-green |
| `failed` | `❌` | accent-red |
| `pending` | `⏳` | accent-amber, pixel-pulse animation |

#### Row 1: Status + Duration + Preview

```
✅ 00:12  "Hello, I'd like to discuss the new feature requirements..."

- Status icon: 16x16, inline
- Duration: font-mono text-[12px] text-text-secondary, format MM:SS
- Text preview (success): font-mono text-[12px] text-text-primary, truncated with ellipsis
  - Max 1 line, overflow hidden
  - Quoted with double quotes
- Error message (failed): font-mono text-[12px] text-accent-red
  - "Transcription failed: {error}"
- Pending message: font-mono text-[12px] text-accent-amber
  - "Transcribing..."
```

#### Row 2: Metadata + Actions

```
   OpenAI / gpt-4o-transcribe  →  Project Alpha       [▶ Play] [📋 Copy] [🗑]

- Provider/model: font-mono text-[11px] text-text-dim
  Format: "{provider} / {model}"
- Arrow + project link: text-[11px] text-accent-blue, clickable (navigates to project)
  - Only shown if projectId is set
- Time: text-[10px] text-text-dim, right-aligned
  Format: "14:30" (HH:MM)
```

#### Action Buttons

All buttons are icon-only (small), shown on the right side of row 2. Use ghost-style icon buttons.

| Action | Icon | Condition | Behavior |
|--------|------|-----------|----------|
| Play | `▶` | Always | Opens inline audio player (see 5.7) |
| Copy | `📋` | status = 'success' | Copies transcribed text to clipboard, brief "Copied!" flash |
| Retry | `🔄` | status = 'failed' | Re-submits for transcription, card shows pending state |
| Delete | `🗑` | Always | Confirmation inline, then deletes record + audio file |

Button styling: icon buttons, 24x24 hit area, text-text-dim hover:text-text-primary

### 5.7 Inline Audio Player

When the user clicks Play on a record, an inline audio player appears below the record card.

```
┌──────────────────────────────────────────────────────────┐
│  ✅ 00:12  "Hello, I'd like to discuss..."               │
│     OpenAI / gpt-4o-transcribe  →  Project Alpha         │
│                                 [▶ Play] [📋 Copy] [🗑]  │
├──────────────────────────────────────────────────────────┤
│  [⏸]  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░  00:05 / 00:12       │
└──────────────────────────────────────────────────────────┘

Player UI:
- Play/Pause toggle: PixelButton ghost sm, 24x24
- Progress bar: pixel-slider style (same as existing range slider in global.css)
  - Filled: accent-green
  - Unfilled: deep
  - Clickable to seek
- Time: font-mono text-[11px] text-text-secondary
  Format: "current / total"
- Uses HTML <audio> element (hidden), controlled via JS
- AnimatePresence for slide-down animation when opening
```

### 5.8 Empty State

When no transcription history exists:

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│                                                          │
│                   🎤                                     │
│                                                          │
│            No transcriptions yet                         │
│                                                          │
│     Use the microphone button in chat                    │
│     to create your first voice recording                 │
│                                                          │
│            [Go to Settings]                              │
│                                                          │
│                                                          │
└──────────────────────────────────────────────────────────┘

- Microphone icon: large, 48px, text-text-dim
- Title: font-pixel text-[10px] text-text-secondary
- Description: font-mono text-[12px] text-text-dim
- [Go to Settings] = PixelButton secondary sm, links to /settings with speech tab active
- PixelCard outlined variant, centered vertically
```

### 5.9 Storage Footer

At the bottom of the record list:

```
┌──────────────────────────────────────────────────────────┐
│  💾 Storage: 128.5 MB (42 records)        [Clear All]    │
└──────────────────────────────────────────────────────────┘

- PixelCard default variant
- 💾 or HDD pixel icon
- "Storage:" font-pixel text-[9px] text-text-secondary
- Size + count: font-mono text-[12px] text-text-primary
- [Clear All] = PixelButton danger sm
  - Same confirmation pattern as the header version
  - Only one Clear All is needed — either header OR footer
  - Recommendation: put in header only (more visible)
```

---

## 6. Motion & Animation Specs

### 6.1 Recording Start Transition

```typescript
// Textarea → Recording overlay transition
const recordingTransition = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.15 },
}
```

Uses `AnimatePresence` from `motion/react` to swap between textarea and recording overlay.

### 6.2 Pulsing Red Dot

Uses existing CSS `pixel-pulse` keyframe from `global.css`:
```css
@keyframes pixel-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
```

Applied via Tailwind: `animate-[pixel-pulse_1s_steps(2)_infinite]`

### 6.3 Success Flash

```typescript
// Success indicator in toolbar
const successFlash = {
  initial: { opacity: 0, x: -4 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 },
}
// Auto-remove after 1.5s via setTimeout
```

### 6.4 Record Card Stagger (History Page)

Use existing `staggerContainer` and `staggerItem` from `lib/motion.ts`:
```typescript
import { staggerContainer, staggerItem } from '../../lib/motion'
```

### 6.5 Waveform Animation

- Canvas-based, 60fps via `requestAnimationFrame`
- No motion/react needed — pure Canvas 2D API
- Bar heights lerp toward target: `current += (target - current) * 0.3` per frame
- This gives a smooth but snappy response to audio levels

---

## 7. Component Inventory

### New Components

| Component | Location | Description |
|-----------|----------|-------------|
| `VoiceWaveform` | `packages/ui/src/components/base/VoiceWaveform.tsx` | Canvas pixel waveform, see Section 3 |
| `VoiceRecorder` | `packages/ui/src/pages/chat/VoiceRecorder.tsx` | Recording overlay (waveform + timer + controls), used inside ChatInput |
| `SpeechTab` | `packages/ui/src/pages/settings/SpeechTab.tsx` | Speech settings tab content |
| `TranscriptionHistoryPage` | `packages/ui/src/pages/speech/TranscriptionHistoryPage.tsx` | Full history page |
| `TranscriptionRecordCard` | `packages/ui/src/pages/speech/TranscriptionRecordCard.tsx` | Single record card in history |
| `InlineAudioPlayer` | `packages/ui/src/pages/speech/InlineAudioPlayer.tsx` | Play/pause + progress bar for audio |
| `MicrophoneIcon` | `packages/ui/src/components/icons/` | 14x14 pixel mic icon (SVG) |

### Modified Components

| Component | Changes |
|-----------|---------|
| `ChatInput.tsx` | Add mic button, recording state machine, voice overlay |
| `GlobalSettingsPage.tsx` | Add "Speech" tab to SETTINGS_TABS, render SpeechTab |
| `routes.tsx` | Add `/speech-history` route |
| `packages/ui/src/pages/index.ts` | Export TranscriptionHistoryPage |

### Icons Needed

| Icon | Size | Usage |
|------|------|-------|
| `MicrophoneIcon` | 14x14 | Chat input toolbar |
| `MicrophoneOffIcon` | 14x14 | Permission denied state |
| `StopSquareIcon` | 10x10 | Stop recording button |
| `PlayIcon` | 12x12 | Audio player play |
| `PauseIcon` | 12x12 | Audio player pause |
| `RetryIcon` | 12x12 | Retry transcription |

All icons should follow the existing pattern (inline SVG components with className prop, pixel-art style with sharp edges, no curves).

---

## Appendix: Responsive Behavior

Since this is an Electron desktop app (not mobile), responsive design is minimal:
- `max-w-[1000px] mx-auto` for settings pages (existing pattern)
- History page uses same max-width
- VoiceWaveform bar count is fixed (24 bars) since the chat input width is relatively stable
- No mobile breakpoints needed

## Appendix: Accessibility

- Mic button: `aria-label="Start voice recording"` / `"Stop recording"`
- Recording state: `aria-live="polite"` on timer region
- Waveform canvas: `role="img" aria-label="Audio waveform visualization"`
- Audio player: Standard HTML `<audio>` element with custom controls
- All buttons have appropriate `title` attributes
