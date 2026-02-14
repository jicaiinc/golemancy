# UI/UX Design: Bash Tool Sandbox Safety Settings

**Created**: 2026-02-14
**Designer**: UI/UX Designer
**Feature**: Safety settings for Bash Tool execution modes and MCP sandbox configuration

---

## 1. Information Architecture

### 1.1 Navigation Structure

```
Global Settings (GlobalSettingsPage)
├── Providers
├── Appearance
├── Profile
├── Paths
└── Safety          ← NEW TAB
    ├── Bash Tool   ← Sub-section (default)
    └── MCP         ← Sub-section

Project Settings (ProjectSettingsPage)
├── Agent
├── General
├── Provider
└── Safety          ← NEW TAB
    ├── Bash Tool   ← Sub-section (default)
    └── MCP         ← Sub-section
```

### 1.2 Design Rationale

- **Safety as a top-level tab** — parallel with Providers, Appearance, etc. Keeps it visible and accessible without burying under nested menus.
- **Sub-sections within Safety** — Bash Tool and MCP are logically grouped as two sub-sections within the Safety tab, using a secondary sub-navigation (pill-style toggles) rather than nested tabs (avoids tabs-within-tabs confusion).

---

## 2. Component Architecture

### 2.1 New Components

| Component | Path | Purpose |
|-----------|------|---------|
| `SafetyBashToolSettings` | `components/settings/SafetyBashToolSettings.tsx` | Global Bash Tool execution mode & config |
| `SafetyMCPSettings` | `components/settings/SafetyMCPSettings.tsx` | Global MCP sandbox toggle |
| `ProjectSafetyBashToolSettings` | `components/project/ProjectSafetyBashToolSettings.tsx` | Project-level Bash Tool config (inherit/custom) |
| `ProjectSafetyMCPSettings` | `components/project/ProjectSafetyMCPSettings.tsx` | Project-level MCP config |
| `BashPresetSelector` | `components/settings/BashPresetSelector.tsx` | Reusable preset card selector |
| `FilesystemPermEditor` | `components/settings/FilesystemPermEditor.tsx` | Filesystem allow/deny lists editor |
| `NetworkPermEditor` | `components/settings/NetworkPermEditor.tsx` | Network allowed domains editor |
| `DeniedCommandsEditor` | `components/settings/DeniedCommandsEditor.tsx` | Command blacklist editor |

### 2.2 Component Reuse Strategy

- Project-level components reuse `BashPresetSelector`, `FilesystemPermEditor`, `NetworkPermEditor`, and `DeniedCommandsEditor` from global settings.
- Shared between global and project settings via props (values + onChange handlers).

---

## 3. Global Settings > Safety Tab

### 3.1 Tab Integration

Add `{ id: 'safety', label: 'Safety' }` to `SETTINGS_TABS` in `GlobalSettingsPage.tsx`.

```typescript
const SETTINGS_TABS = [
  { id: 'providers', label: 'Providers' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'profile', label: 'Profile' },
  { id: 'paths', label: 'Paths' },
  { id: 'safety', label: 'Safety' },  // NEW
]
```

### 3.2 Safety Tab Layout — Sub-section Navigation

Within the Safety tab, use a **pill toggle** to switch between Bash Tool and MCP sub-sections. This avoids nested PixelTabs.

```
┌────────────────────────────────────────────────────────────┐
│ [■ Bash Tool]  [  MCP  ]         ← pill toggle (inline)   │
└────────────────────────────────────────────────────────────┘
```

**Pill Toggle Implementation**: Two adjacent buttons styled as a segmented control.

```
Active:   bg-elevated border-2 border-accent-blue text-accent-blue font-pixel text-[10px]
Inactive: bg-deep border-2 border-border-dim text-text-secondary font-pixel text-[10px]
```

Both buttons sit in a `flex` row with `gap-0` (abutting, pixel style).

---

### 3.3 Bash Tool Sub-section

#### Full Layout

```
┌──────────────────────────────────────────────────────────────┐
│ [■ Bash Tool]  [  MCP  ]                                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ PixelCard ─────────────────────────────────────────────────  │
│ │ EXECUTION MODE                     font-pixel 10px         │
│ │                                                          │ │
│ │ ┌─────────────────────────────────────────────────────┐  │ │
│ │ │ ○  Restricted                                       │  │ │
│ │ │    "Do Not Touch My Computer"                       │  │ │
│ │ │    Virtual filesystem, 70+ built-in commands.       │  │ │
│ │ │    No real system commands (git, npm, docker).      │  │ │
│ │ └─────────────────────────────────────────────────────┘  │ │
│ │                                                          │ │
│ │ ┌─────────────────────────────────────────────────────┐  │ │
│ │ │ ●  Sandbox                      [Recommended]       │  │ │
│ │ │    OS-level isolation with real command execution.   │  │ │
│ │ │    Powered by Anthropic Sandbox Runtime.             │  │ │
│ │ │                                                     │  │ │
│ │ │    Preset: [ ▼ Balanced ]  (dropdown or cards)      │  │ │
│ │ └─────────────────────────────────────────────────────┘  │ │
│ │                                                          │ │
│ │ ┌─────────────────────────────────────────────────────┐  │ │
│ │ │ ○  Unrestricted                 ⚠ DANGER            │  │ │
│ │ │    No sandbox protection. Full system access.       │  │ │
│ │ │    For local development and trusted environments.  │  │ │
│ │ └─────────────────────────────────────────────────────┘  │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ PixelCard (visible only when mode = Sandbox) ──────────────  │
│ │ SANDBOX PRESET                                           │ │
│ │                                                          │ │
│ │ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────┐ │ │
│ │ │  Balanced  │ │   Strict   │ │ Permissive │ │ Custom │ │ │
│ │ │  (Default) │ │            │ │            │ │        │ │ │
│ │ │  ● Active  │ │            │ │            │ │        │ │ │
│ │ └────────────┘ └────────────┘ └────────────┘ └────────┘ │ │
│ │                                                          │ │
│ │ Balanced: Safe defaults for most development. Allows     │ │
│ │ workspace writes, blocks sensitive files, permits major  │ │
│ │ package registries.                                      │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ PixelCard (collapsible, visible when mode = Sandbox) ──────  │
│ │ ▼ ADVANCED CONFIGURATION                                 │ │
│ │                                                          │ │
│ │ ── FILE SYSTEM PERMISSIONS ──                            │ │
│ │ Allow Write:                                             │ │
│ │ ┌─────────────────────────────────────────────────────┐  │ │
│ │ │ /workspace  [x]                                     │  │ │
│ │ │ /tmp        [x]                                     │  │ │
│ │ │ ~/.npm      [x]                                     │  │ │
│ │ │ ~/.cache    [x]                                     │  │ │
│ │ │ [+ Add path]                                        │  │ │
│ │ └─────────────────────────────────────────────────────┘  │ │
│ │                                                          │ │
│ │ Deny Read:                                               │ │
│ │ ┌─────────────────────────────────────────────────────┐  │ │
│ │ │ ~/.ssh          [x]                                 │  │ │
│ │ │ ~/.aws          [x]                                 │  │ │
│ │ │ /etc/passwd     [x]                                 │  │ │
│ │ │ /etc/shadow     [x]                                 │  │ │
│ │ │ **/.env         [x]                                 │  │ │
│ │ │ **/secrets/**   [x]                                 │  │ │
│ │ │ [+ Add path]                                        │  │ │
│ │ └─────────────────────────────────────────────────────┘  │ │
│ │                                                          │ │
│ │ Deny Write:                                              │ │
│ │ ┌─────────────────────────────────────────────────────┐  │ │
│ │ │ **/.git/hooks/**  [x]                               │  │ │
│ │ │ [+ Add path]                                        │  │ │
│ │ └─────────────────────────────────────────────────────┘  │ │
│ │                                                          │ │
│ │ ── NETWORK PERMISSIONS ──                                │ │
│ │ Allowed Domains:                                         │ │
│ │ ┌─────────────────────────────────────────────────────┐  │ │
│ │ │ github.com           [x]                            │  │ │
│ │ │ *.github.com         [x]                            │  │ │
│ │ │ registry.npmjs.org   [x]                            │  │ │
│ │ │ ...                                                 │  │ │
│ │ │ [+ Add domain]                                      │  │ │
│ │ └─────────────────────────────────────────────────────┘  │ │
│ │                                                          │ │
│ │ ── OTHER ──                                              │ │
│ │ [✓] Enable Python        (PixelToggle)                   │ │
│ │ [✓] Allow Git Config     (PixelToggle)                   │ │
│ │                                                          │ │
│ │ Denied Commands:                                         │ │
│ │ ┌─────────────────────────────────────────────────────┐  │ │
│ │ │ sudo   [x]                                          │  │ │
│ │ │ su     [x]                                          │  │ │
│ │ │ doas   [x]                                          │  │ │
│ │ │ ...                                                 │  │ │
│ │ │ [+ Add command]                                     │  │ │
│ │ └─────────────────────────────────────────────────────┘  │ │
│ │                                                          │ │
│ │ [Save Changes]  Saved!                                   │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

### 3.4 Execution Mode Selector — Detailed Design

The three modes use a **radio card** pattern — vertically stacked, selectable cards. This follows the existing `ICONS` selector pattern from `ProjectSettingsPage` but adapted for richer content.

#### Radio Card Component

Each mode is a full-width clickable card:

```typescript
// Unselected state:
className="p-4 border-2 border-border-dim bg-deep hover:border-border-bright cursor-pointer transition-colors"

// Selected state:
className="p-4 border-2 border-accent-green bg-elevated cursor-pointer transition-colors"
// Plus a left accent bar: border-l-4 border-l-accent-green
```

#### Content within each radio card:

```
┌──────────────────────────────────────────────────────────┐
│ ○/●  MODE NAME              [Badge: Recommended/Danger]  │
│      Subtitle (italic tagline)                           │
│      Description text (1-2 lines)                        │
└──────────────────────────────────────────────────────────┘
```

- **Radio indicator**: Custom pixel-style radio (`○` / `●`), `w-4 h-4` box with inner dot when selected.
- **Mode name**: `font-pixel text-[10px] text-text-primary`
- **Subtitle**: `font-mono text-[11px] text-text-dim italic` — e.g., "Do Not Touch My Computer"
- **Description**: `font-mono text-[11px] text-text-secondary`
- **Badge**: `PixelBadge variant="success"` for Recommended, `PixelBadge variant="error"` for Danger

#### Unrestricted Mode — Confirmation Dialog

When selecting Unrestricted mode, show a **confirmation modal** (PixelModal):

```
┌─────────────────────────────────────────────────────────┐
│ ⚠ Enable Unrestricted Mode?                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ This removes all sandbox protection. AI agents will     │
│ have full access to your system, including:             │
│                                                         │
│  • Read/write any file on your computer                 │
│  • Execute any system command                           │
│  • Access network without restrictions                  │
│  • Modify system configuration                          │
│                                                         │
│ Only use this for local development in trusted          │
│ environments.                                           │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                    [Cancel]  [I Understand, Enable]      │
└─────────────────────────────────────────────────────────┘
```

- Modal size: `sm` (480px)
- "I Understand, Enable" button: `variant="danger"`
- Cancel button: `variant="ghost"`

---

### 3.5 Preset Selector — Detailed Design

The preset selector uses a **grid card** pattern similar to the Provider selector in GlobalSettingsPage.

```
grid grid-cols-2 md:grid-cols-4 gap-2
```

Each preset card:

```
┌──────────────┐
│ ⚖            │  ← icon (emoji)
│ Balanced     │  ← name (text-[11px] text-text-primary)
│ (Default)    │  ← hint (text-[9px] text-text-dim)
│ ● Active     │  ← status (text-[9px] text-accent-green, only when selected)
└──────────────┘
```

**Preset definitions**:

| Preset | Icon | Description |
|--------|------|-------------|
| Balanced | ⚖ | Safe defaults for most development. Workspace writes, blocks sensitive files, allows major registries. |
| Strict | 🔒 | Maximum restrictions. Read-only workspace, no network, no Python. |
| Permissive | 🔓 | Broader access. Additional write paths, more network domains. |
| Custom | ⚙ | User-defined configuration. Opens Advanced Configuration. |

**Selected state**: Same as provider cards — `bg-elevated border-accent-green`.

When **Custom** is selected, the Advanced Configuration section expands automatically and becomes editable. For other presets, Advanced Configuration shows the preset's values in read-only mode.

Below the grid, show a **description line** for the currently selected preset:

```
text-[11px] text-text-dim mt-2
```

---

### 3.6 Advanced Configuration — Detailed Design

This section is a **collapsible** PixelCard. Toggle via a clickable header:

```
▶ ADVANCED CONFIGURATION   (collapsed, ▶ rotates to ▼ when open)
```

Header styling:
```
font-pixel text-[10px] text-text-secondary cursor-pointer
flex items-center gap-2
hover:text-text-primary transition-colors
```

Animation: Use `motion/react` `AnimatePresence` with `fadeInUp` for expand/collapse.

#### Path List Editor Pattern (reusable)

Used for Allow Write, Deny Read, Deny Write, Allowed Domains, and Denied Commands.

```
┌──────────────────────────────────────────────────────────┐
│ ALLOW WRITE                  font-pixel 8px              │
│                                                          │
│ ┌──────────────────────────────────────────────────┬──┐  │
│ │ /workspace                                       │ × │  │
│ ├──────────────────────────────────────────────────┼──┤  │
│ │ /tmp                                             │ × │  │
│ ├──────────────────────────────────────────────────┼──┤  │
│ │ ~/.npm                                           │ × │  │
│ ├──────────────────────────────────────────────────┼──┤  │
│ │ ~/.cache                                         │ × │  │
│ └──────────────────────────────────────────────────┴──┘  │
│                                                          │
│ ┌──────────────────────────────────────────────┐ [Add]   │
│ │ Enter path or glob pattern...                │         │
│ └──────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────┘
```

**List item styling**:
- Container: `bg-deep border-2 border-border-dim` (outer box)
- Each row: `flex items-center justify-between px-3 py-1.5 border-b border-border-dim last:border-b-0`
- Path text: `font-mono text-[12px] text-text-primary`
- Remove button (×): `text-text-dim hover:text-accent-red text-[14px] cursor-pointer w-6 h-6 flex items-center justify-center`
- Add row: `flex gap-2 mt-2` — PixelInput (flex-1) + PixelButton "Add" (variant="ghost", size="sm")

**Read-only mode** (for non-Custom presets): Same list but without × buttons and without Add row. Items have `opacity-70`.

---

### 3.7 MCP Sub-section

#### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ [  Bash Tool  ]  [■ MCP]                                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ PixelCard ─────────────────────────────────────────────────  │
│ │ MCP SERVER EXECUTION                                     │ │
│ │                                                          │ │
│ │ ┌─────────────────────────────────────────────────────┐  │ │
│ │ │ ○  Run inside sandbox                               │  │ │
│ │ │    MCP servers inherit sandbox restrictions.         │  │ │
│ │ │    ⚠ May limit MCP functionality (e.g., filesystem  │  │ │
│ │ │    MCP cannot access files outside sandbox).         │  │ │
│ │ └─────────────────────────────────────────────────────┘  │ │
│ │                                                          │ │
│ │ ┌─────────────────────────────────────────────────────┐  │ │
│ │ │ ●  Run outside sandbox           [Recommended]      │  │ │
│ │ │    MCP servers run in the main process with full     │  │ │
│ │ │    access. Security is controlled by MCP's own       │  │ │
│ │ │    configuration.                                    │  │ │
│ │ └─────────────────────────────────────────────────────┘  │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ PixelCard (info box) ──────────────────────────────────────  │
│ │ ℹ WHY RUN OUTSIDE SANDBOX?                              │ │
│ │                                                          │ │
│ │ MCP servers are user-installed trusted code that         │ │
│ │ provide additional capabilities (filesystem, database,   │ │
│ │ network). Running them inside sandbox defeats their      │ │
│ │ purpose. Their security is controlled by MCP's own       │ │
│ │ allowed paths and configuration.                         │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ [Save Changes]  Saved!                                       │
└──────────────────────────────────────────────────────────────┘
```

#### Info Box Styling

The "Why run outside sandbox?" box uses a distinct visual treatment:

```
bg-accent-blue/5 border-2 border-accent-blue/20
```

Header: `font-pixel text-[10px] text-accent-blue mb-2` with ℹ icon
Body: `text-[11px] text-text-dim leading-relaxed`

---

## 4. Project Settings > Safety Tab

### 4.1 Tab Integration

Add `{ id: 'safety', label: 'Safety' }` to `SETTINGS_TABS` in `ProjectSettingsPage.tsx`.

```typescript
const SETTINGS_TABS = [
  { id: 'agent', label: 'Agent' },
  { id: 'general', label: 'General' },
  { id: 'provider', label: 'Provider' },
  { id: 'safety', label: 'Safety' },  // NEW
]
```

### 4.2 Project Safety — Bash Tool

The key UX decision: **Inherit vs. Custom** — presented as a primary choice before any detailed config.

#### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ [■ Bash Tool]  [  MCP  ]                                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ PixelCard ─────────────────────────────────────────────────  │
│ │ EXECUTION MODE                                           │ │
│ │                                                          │ │
│ │ ┌─────────────────────────────────────────────────────┐  │ │
│ │ │ ●  Inherit from App Settings    [Recommended]       │  │ │
│ │ │    Uses the global sandbox configuration.            │  │ │
│ │ │    Current: Sandbox (Balanced)     ← live value      │  │ │
│ │ └─────────────────────────────────────────────────────┘  │ │
│ │                                                          │ │
│ │ ┌─────────────────────────────────────────────────────┐  │ │
│ │ │ ○  Custom Configuration                             │  │ │
│ │ │    Create a project-specific sandbox.                │  │ │
│ │ │    ⚠ Creates a separate sandbox worker process.      │  │ │
│ │ └─────────────────────────────────────────────────────┘  │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ (When Inherit is selected) ────────────────────────────────  │
│ PixelCard ─────────────────────────────────────────────────  │
│ │ ▶ INHERITED CONFIGURATION (read-only preview)            │ │
│ │                                                          │ │
│ │ Mode: Sandbox                                            │ │
│ │ Preset: Balanced                                         │ │
│ │ Allow Write: /workspace, /tmp, ~/.npm, ~/.cache          │ │
│ │ Deny Read: ~/.ssh, ~/.aws, /etc/passwd, **/.env          │ │
│ │ Network: github.com, registry.npmjs.org, ...             │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ (When Custom is selected) ─────────────────────────────────  │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Same layout as Global Bash Tool settings:                │ │
│ │ - Execution mode radio cards (3 modes)                   │ │
│ │ - Preset selector (when Sandbox)                         │ │
│ │ - Advanced configuration (when Sandbox)                  │ │
│ │                                                          │ │
│ │ [Save Changes]  Saved!                                   │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

#### "Current" Live Value Display

When Inherit is selected, show the current global setting in the card:

```
Current: Sandbox (Balanced)
```

Styling: `text-[11px] text-accent-green font-mono mt-1`

This updates dynamically when global settings change.

#### Inherited Config Preview

A collapsible read-only summary of what the project inherits. Uses the same Advanced Configuration layout but without edit controls.

```
text-[11px] text-text-dim font-mono
```

Key-value pairs on separate lines, paths comma-separated.

---

### 4.3 Project Safety — MCP

```
┌──────────────────────────────────────────────────────────────┐
│ [  Bash Tool  ]  [■ MCP]                                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ PixelCard ─────────────────────────────────────────────────  │
│ │ MCP EXECUTION ENVIRONMENT                                │ │
│ │                                                          │ │
│ │ ┌─────────────────────────────────────────────────────┐  │ │
│ │ │ ●  Inherit from App Settings    [Recommended]       │  │ │
│ │ │    Current: Run outside sandbox                      │  │ │
│ │ └─────────────────────────────────────────────────────┘  │ │
│ │                                                          │ │
│ │ ┌─────────────────────────────────────────────────────┐  │ │
│ │ │ ○  Custom Configuration                             │  │ │
│ │ │    Override MCP execution environment for this       │  │ │
│ │ │    project only.                                     │  │ │
│ │ └─────────────────────────────────────────────────────┘  │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ (When Custom is selected) ─────────────────────────────────  │
│ │ Same radio cards as Global MCP settings                  │ │
│ │ (Run inside sandbox / Run outside sandbox)               │ │
│ │                                                          │ │
│ │ [Save Changes]  Saved!                                   │ │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Detailed Component Specifications

### 5.1 Radio Card (ExecutionModeCard)

Reusable component for mode selection (used in both Bash Tool and MCP settings).

```typescript
interface ExecutionModeOption {
  id: string
  name: string            // "Restricted", "Sandbox", "Unrestricted"
  subtitle?: string       // "Do Not Touch My Computer"
  description: string     // longer explanation
  badge?: {
    label: string         // "Recommended", "Danger"
    variant: BadgeVariant // "success", "error"
  }
  children?: ReactNode    // extra content when selected (e.g., preset dropdown)
}

interface ExecutionModeCardProps {
  options: ExecutionModeOption[]
  value: string
  onChange: (id: string) => void
}
```

**Layout per card**:

```
┌──────────────────────────────────────────────────────────────┐
│ ┌──┐                                                         │
│ │○●│  MODE NAME                              [Badge]         │
│ └──┘  "Subtitle"                                             │
│       Description text that can wrap to multiple lines.      │
│                                                              │
│       {children — only shown when this card is selected}     │
└──────────────────────────────────────────────────────────────┘
```

**Radio indicator** (custom pixel-art):
- Unselected: `w-4 h-4 border-2 border-border-dim bg-deep`
- Selected: `w-4 h-4 border-2 border-accent-green bg-deep` with inner `w-2 h-2 bg-accent-green` centered

**Vertical spacing between cards**: `gap-2`

### 5.2 Path List Editor (PathListEditor)

Reusable tag/chip list for filesystem paths, domains, and commands.

```typescript
interface PathListEditorProps {
  label: string           // "ALLOW WRITE", "DENY READ", etc.
  items: string[]
  onChange: (items: string[]) => void
  placeholder?: string   // "Enter path or glob pattern..."
  readOnly?: boolean
  helperText?: string    // Optional helper text below label
}
```

**Visual structure**:

```
LABEL                                      ← font-pixel 8px text-text-secondary
Helper text if provided                    ← text-[11px] text-text-dim

┌──────────────────────────────────────────────────────────────┐
│ path/pattern   ×  │  path/pattern   ×  │  path/pattern   ×  │ ← chip/tag style
└──────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐  [Add]
│ placeholder...                                  │
└─────────────────────────────────────────────────┘
```

**Alternative: Use inline chips** (horizontal wrap) instead of a vertical list for compactness:

```
┌──────────────────────────────────────────────────────────────┐
│  [/workspace ×] [/tmp ×] [~/.npm ×] [~/.cache ×]            │
│                                                              │
│  [Enter path...___________________]  [Add]                   │
└──────────────────────────────────────────────────────────────┘
```

**Chip styling**:
```
bg-deep border-2 border-border-dim px-2 py-1
font-mono text-[11px] text-text-primary
flex items-center gap-1.5
```

**Remove (×) button in chip**: `text-text-dim hover:text-accent-red cursor-pointer`

**Read-only mode**: No × buttons, no Add input, chips have `opacity-60`.

### 5.3 BashPresetSelector

Grid of preset cards (2x2 on mobile, 4 on desktop).

```typescript
type PresetId = 'balanced' | 'strict' | 'permissive' | 'custom'

interface BashPresetSelectorProps {
  value: PresetId
  onChange: (preset: PresetId) => void
}
```

**Card content per preset**:

| Preset | Icon | Short Description |
|--------|------|-------------------|
| Balanced | ⚖ | "Safe defaults for development" |
| Strict | 🔒 | "Maximum restrictions" |
| Permissive | 🔓 | "Broader access" |
| Custom | ⚙ | "User-defined rules" |

**Card styling** (matches Provider selector pattern):

```
// Unselected:
p-3 border-2 bg-deep border-border-dim hover:border-border-bright cursor-pointer transition-colors text-center

// Selected:
p-3 border-2 bg-elevated border-accent-green cursor-pointer transition-colors text-center
```

**Below the grid**, show a longer description of the currently selected preset:

```typescript
const PRESET_DESCRIPTIONS: Record<PresetId, string> = {
  balanced: 'Allows workspace and cache writes, blocks sensitive files (~/.ssh, .env), permits major package registries.',
  strict: 'Read-only workspace, no network access, no Python execution. Maximum isolation.',
  permissive: 'Broader filesystem access, more network domains. For projects that need extra flexibility.',
  custom: 'Configure your own filesystem, network, and command rules below.',
}
```

---

## 6. User Flows

### 6.1 First-Time Setup Flow

```
User opens Settings > Safety for the first time
  → Bash Tool sub-section shown by default
  → Sandbox mode is pre-selected (default)
  → Balanced preset is active
  → Advanced Configuration is collapsed
  → No action needed — sane defaults

User can optionally:
  → Change mode to Restricted or Unrestricted
  → Change preset to Strict, Permissive, or Custom
  → Expand Advanced Configuration to view/edit rules
  → Click Save Changes
```

### 6.2 Switch to Unrestricted Mode Flow

```
User selects Unrestricted radio card
  → Confirmation modal appears (PixelModal)
  → User reads warning
  → User clicks "Cancel" → mode stays unchanged
  → User clicks "I Understand, Enable" → mode changes to Unrestricted
    → Advanced Configuration section hides (not applicable)
    → ⚠ warning badge visible on the Unrestricted card
```

### 6.3 Customize Sandbox Configuration Flow

```
User is on Sandbox mode
  → Clicks "Custom" preset card
  → Advanced Configuration expands automatically
  → All fields become editable
  → User adds/removes paths, domains, commands
  → Toggles Python / Git Config
  → Clicks Save Changes
  → "Saved!" feedback appears for 2 seconds
```

### 6.4 Project Inherit vs. Custom Flow

```
User opens Project Settings > Safety > Bash Tool
  → "Inherit from App Settings" is selected by default
  → Shows "Current: Sandbox (Balanced)" from global config
  → Collapsible preview shows inherited rules

User switches to "Custom Configuration"
  → Warning shown: "Creates a separate sandbox worker process"
  → Full configuration UI appears (same as Global, but scoped to project)
  → User configures and saves
  → This project now uses an independent sandbox

User switches back to "Inherit from App Settings"
  → Custom config is retained but inactive
  → Project uses global config again
  → Worker process for this project will be stopped
```

### 6.5 MCP Configuration Flow

```
User opens Settings > Safety > MCP
  → "Run outside sandbox" is pre-selected (default/recommended)
  → Info box explains why this is recommended
  → User can switch to "Run inside sandbox"
    → Warning text shown within the card
  → Save Changes
```

---

## 7. Visual Design Details

### 7.1 Color Usage for Safety Levels

| Element | Color | Usage |
|---------|-------|-------|
| Restricted mode accent | `accent-blue` | Neutral-safe, informational |
| Sandbox mode accent | `accent-green` | Default, recommended |
| Unrestricted mode accent | `accent-red` | Danger, warning |
| Custom preset | `accent-amber` | Caution, user-defined |
| Inherit indicator | `accent-green` | Positive, recommended |

### 7.2 Icon System

Use emoji icons consistently (matching existing patterns in Provider/Icon selectors):

| Context | Icon |
|---------|------|
| Restricted | 🛡 (shield) |
| Sandbox | 📦 (box/container) |
| Unrestricted | ⚡ (bolt - power/danger) |
| Balanced | ⚖ (scales) |
| Strict | 🔒 (locked) |
| Permissive | 🔓 (unlocked) |
| Custom | ⚙ (gear) |
| MCP inside | 📦 (sandboxed) |
| MCP outside | 🔗 (linked/free) |
| Info box | ℹ (info) |

### 7.3 Shadows and Borders

Follow existing pixel art conventions:
- Cards: `shadow-pixel-sunken` (inset shadow for depth)
- Selected items: `border-accent-green` (2px solid)
- Input fields: `shadow-[inset_-2px_-2px_0_0_rgba(255,255,255,0.08),inset_2px_2px_0_0_rgba(0,0,0,0.3)]`
- No border-radius anywhere (pixel art style)

### 7.4 Animations

- **Sub-section toggle**: Instant (no animation), just swap content
- **Advanced Configuration expand/collapse**: `motion/react` height animation with `fadeInUp` preset (200ms)
- **Preset card selection**: `transition-colors` (CSS, instant feel)
- **Save feedback**: Fade in, auto-dismiss after 2000ms
- **Confirmation modal**: `modalTransition` preset from `motion.ts`

---

## 8. Accessibility Considerations

### 8.1 Keyboard Navigation

- **Tab order**: Sub-section toggle → Mode cards → Preset cards → Advanced fields → Save button
- **Radio cards**: Arrow keys navigate between options, Space/Enter to select
- **Path list**: Tab to input field, Enter to add, Tab to each chip's remove button
- **Collapsible sections**: Enter/Space to toggle, focus visible on header
- **Modals**: Focus trap within modal, Escape to close

### 8.2 ARIA Attributes

```typescript
// Radio cards
<div role="radiogroup" aria-label="Execution mode">
  <div role="radio" aria-checked={selected} tabIndex={0}>
    ...
  </div>
</div>

// Toggle
<button role="switch" aria-checked={checked} aria-label="Enable Python">

// Collapsible
<button aria-expanded={isOpen} aria-controls="advanced-config">
  ADVANCED CONFIGURATION
</button>
<div id="advanced-config" role="region">

// Path list
<ul role="list" aria-label="Allow write paths">
  <li>
    <span>/workspace</span>
    <button aria-label="Remove /workspace">×</button>
  </li>
</ul>
```

### 8.3 Screen Reader Support

- Mode descriptions read out fully when focused
- Badge content is part of the accessible name: "Sandbox, Recommended"
- Path list changes announced: "Added /workspace to allow write" / "Removed /tmp from allow write"
- Save status announced: "Settings saved successfully"

### 8.4 Color Contrast

All text meets WCAG AA contrast ratios against their backgrounds:
- `text-text-primary` on `bg-surface` / `bg-elevated`: > 7:1 ratio
- `text-text-secondary` on `bg-deep`: > 4.5:1 ratio
- `text-accent-green` on `bg-elevated`: > 4.5:1 ratio
- `text-accent-red` on `bg-deep`: > 4.5:1 ratio

---

## 9. Responsive Behavior

### 9.1 Width Constraints

- Global Settings: `max-w-[1000px] mx-auto p-8` (matches existing)
- Project Settings: `max-w-[640px] p-6` (matches existing)

### 9.2 Preset Grid

```
Desktop (>= 768px): grid-cols-4  (4 cards in a row)
Mobile  (< 768px):  grid-cols-2  (2x2 grid)
```

### 9.3 Path Chips

Chips wrap naturally using `flex flex-wrap gap-1.5`. On narrow screens, fewer chips per line.

---

## 10. State Management Integration

### 10.1 Store Slice Extension

Add safety state to the settings slice in `useAppStore`:

```typescript
// In the settings slice
interface SettingsSlice {
  settings: Settings | null
  // ... existing
  updateSettings: (data: Partial<Settings>) => Promise<void>
  // Safety config is part of Settings, so updateSettings handles it
}
```

### 10.2 Component State Pattern

Follow the exact save pattern from existing settings pages:

```typescript
const [saving, setSaving] = useState(false)
const [saved, setSaved] = useState(false)
const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

useEffect(() => () => { clearTimeout(timerRef.current) }, [])

async function handleSave() {
  setSaving(true)
  await updateSettings({ bashTool: { ... } })
  setSaving(false)
  clearTimeout(timerRef.current)
  setSaved(true)
  timerRef.current = setTimeout(() => setSaved(false), 2000)
}
```

### 10.3 Default Values

When settings load with no safety config present, apply defaults:

```typescript
const DEFAULT_BASH_CONFIG = {
  defaultMode: 'sandbox' as const,
  sandboxPreset: 'balanced' as const,
  customConfig: BALANCED_PRESET,  // from presets.ts
}

const DEFAULT_MCP_CONFIG = {
  runInSandbox: false,
}
```

---

## 11. File Deliverables Summary

| File | Type | Description |
|------|------|-------------|
| `SafetyBashToolSettings.tsx` | Component | Global Bash Tool settings with mode selector, preset selector, advanced config |
| `SafetyMCPSettings.tsx` | Component | Global MCP sandbox toggle |
| `ProjectSafetyBashToolSettings.tsx` | Component | Project Bash Tool (inherit/custom) |
| `ProjectSafetyMCPSettings.tsx` | Component | Project MCP (inherit/custom) |
| `BashPresetSelector.tsx` | Component | Reusable preset grid selector |
| `PathListEditor.tsx` | Component | Reusable path/domain/command chip list editor |
| `ExecutionModeCard.tsx` | Component | Reusable radio card for mode selection |
| `GlobalSettingsPage.tsx` | Modify | Add Safety tab |
| `ProjectSettingsPage.tsx` | Modify | Add Safety tab |

---

**End of UI/UX Design Document**
