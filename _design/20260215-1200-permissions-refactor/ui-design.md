# UI Design: Permissions Settings

**Date**: 2026-02-15 (Updated: 2026-02-15 with MCP srt wrapping details)
**Designer**: UI/UX Designer
**Target**: Project Settings > Permissions Tab
**Requirements**: Based on 36 requirements from `_requirement/20260215-1200-sandbox-permissions-refactor.md`

**Scope Note**: This refactor implements UI and config-level changes only. MCP sandbox runtime implementation (srt command wrapping, per requirements 32-36) is deferred to a later phase.

---

## 1. Component Hierarchy

```
ProjectSettingsPage (permissions tab)
└── PermissionsSettings
    ├── PermissionModeSelector (Restricted | Sandbox | Unrestricted)
    ├── [if mode === 'sandbox'] SandboxConfigEditor
    │   ├── ConfigManagement (at top)
    │   │   ├── ConfigSelector (dropdown showing "name (ID)")
    │   │   ├── SaveConfigButton (opens modal for title input)
    │   │   └── DuplicateConfigButton
    │   ├── [if !isWindows] PathListEditor (allowWrite)
    │   ├── [if !isWindows] PathListEditor (denyRead)
    │   ├── [if !isWindows] PathListEditor (denyWrite)
    │   ├── [if !isWindows] PathListEditor (allowedDomains)
    │   ├── [if !isWindows] PathListEditor (deniedDomains)
    │   ├── PathListEditor (deniedCommands)
    │   └── [if !isWindows] PixelToggle (Apply to MCP)
    └── [if isWindows] WindowsLimitedView
        └── PathListEditor (deniedCommands only)
```

---

## 2. Layout Description

### 2.1 PermissionModeSelector

**Component Type**: `ExecutionModeCard` (reuse existing)

**Layout**: Vertical stack of 3 radio-button cards, each with:
- Left: Radio indicator (2px border square, filled when selected)
- Center: Name, subtitle, description
- Right: Badge (optional)
- Active card shows left border accent

**Options**:
1. **Restricted**
   - Name: "Restricted"
   - Subtitle: "Just Bash, no sandbox"
   - Description: "Minimal execution environment with basic bash commands only. No sandbox runtime, no filesystem restrictions."
   - Badge: { label: "Safest", variant: "success" }

2. **Sandbox** (default)
   - Name: "Sandbox"
   - Subtitle: "Configurable isolation"
   - Description: "Run commands in a sandbox runtime with configurable filesystem, network, and command restrictions."
   - Badge: { label: "Recommended", variant: "info" }

3. **Unrestricted**
   - Name: "Unrestricted"
   - Subtitle: "Full system access"
   - Description: "No sandbox restrictions. All commands run with full system permissions."
   - Badge: { label: "Risky", variant: "error" }

**Interaction**: Only one can be selected. When user clicks a card, it becomes active and content below adapts.

**Visual Style**:
- Uses `ExecutionModeCard` component patterns
- Selected card: `border-accent-green`, `border-l-4 border-l-accent-green`
- Unselected: `border-border-dim`, hover `border-border-bright`
- Transition: `transition-colors`

---

### 2.2 SandboxConfigEditor

**When shown**: Only when `mode === 'sandbox'`

**Layout**: Vertical stack with sections

#### 2.2.1 ConfigManagement (Top Section)

**Layout**: Horizontal row with 3 elements

```
┌─────────────────────────────────────────────────────┐
│ [ConfigSelector ▼] [Save] [Duplicate]              │
└─────────────────────────────────────────────────────┘
```

**ConfigSelector**:
- Component: `PixelDropdown`
- Trigger: `PixelButton` with dropdown arrow (variant="outline", full width on left side)
- Button text: `"{configName} ({configId})"` or `"Default (default)"` if using system default
- Dropdown items: All saved configs from `permissions-config/` folder
  - Format: `"{name} ({id})"`
  - Default config shown as: `"Default (default)"` with read-only badge
  - Selected item shows checkmark
- Width: `flex-1` (takes remaining space)

**SaveConfigButton**:
- Component: `PixelButton` (variant="primary", size="sm")
- Label: "Save"
- Click action: Opens `PixelModal` with:
  - Title: "Save Permissions Configuration"
  - Body: `PixelInput` for config title/name
  - Footer: Cancel + Save buttons
  - On save: Creates new file in `permissions-config/{id}.json` with user-provided name
- If current config is "default": Always creates new config
- If current config is custom: Prompts "Overwrite existing or create new?"

**DuplicateConfigButton**:
- Component: `PixelButton` (variant="ghost", size="sm")
- Label: "Duplicate"
- Click action: Opens modal asking for new config name, creates copy of current config with new ID
- Disabled if no config loaded

**Visual Style**:
- Section wrapped in `PixelCard` (variant="elevated")
- 3-column grid: `grid-cols-[1fr_auto_auto]` with `gap-2`

---

#### 2.2.2 PathListEditor Sections

**When shown**: All except on Windows (Windows only shows deniedCommands)

**Layout**: Each `PathListEditor` in vertical stack with `gap-4`

1. **allowWrite**
   - Label: "ALLOW WRITE"
   - Helper text: "Paths where agents can write files. Default: project workspace directory."
   - Placeholder: "e.g., /Users/name/workspace"
   - Initially populated with project workspace path

2. **denyRead**
   - Label: "DENY READ"
   - Helper text: "Sensitive files/folders to block from reading. Default: ~/.ssh, .env, credentials."
   - Placeholder: "e.g., ~/.ssh, .env"
   - Initially populated with default sensitive paths

3. **denyWrite**
   - Label: "DENY WRITE"
   - Helper text: "Paths where writing is blocked. Default: everything outside workspace."
   - Placeholder: "e.g., /etc, /usr"
   - Initially populated with system-critical paths

4. **allowedDomains**
   - Label: "ALLOWED DOMAINS"
   - Helper text: "Network domains agents can access. Default: all allowed."
   - Placeholder: "e.g., api.github.com"
   - Initially empty (all allowed by default)

5. **deniedDomains**
   - Label: "DENIED DOMAINS"
   - Helper text: "Domains to block network access. Default: none."
   - Placeholder: "e.g., malicious-site.com"
   - Initially empty

6. **deniedCommands**
   - Label: "DENIED COMMANDS"
   - Helper text: "Commands to block from execution. Use this to disable python, npm, etc."
   - Placeholder: "e.g., python, python3, pip"
   - Initially empty

**Visual Style**:
- Each section uses existing `PathListEditor` component
- Chip display with X-remove buttons
- Input field below chip list with "Add" button
- Font: `font-mono text-[11px]`

---

#### 2.2.3 Apply to MCP Toggle

**When shown**: Only when `mode === 'sandbox'` AND `!isWindows`

**Layout**: Single row at bottom of SandboxConfigEditor

```
┌─────────────────────────────────────────────────────┐
│ [Toggle] Apply to MCP                               │
│ "When enabled, MCP servers also run with sandbox."  │
└─────────────────────────────────────────────────────┘
```

**Component**: `PixelToggle`
- Label: "Apply to MCP"
- Helper text below: "When enabled, MCP server commands will be wrapped with sandbox runtime (srt). This applies the same filesystem, network, and command restrictions to MCP servers."
- Default: `false` (unchecked)
- Field name: `applyToMCP` (boolean)

**Technical Note** (Requirements 32-36):
- This toggle stores a boolean config field (`applyToMCP`)
- Runtime implementation (wrapping MCP commands with `srt`) is deferred to a later phase
- This refactor only implements the UI and config storage for this field
- Example future behavior: `npx -y @modelcontextprotocol/server-filesystem` → `srt npx -y @modelcontextprotocol/server-filesystem`

**Visual Style**:
- Wrapped in `PixelCard` (variant="default")
- Helper text: `font-mono text-[11px] text-text-dim`

---

### 2.3 WindowsLimitedView

**When shown**: Only on Windows platform AND `mode === 'sandbox'`

**Layout**:

```
┌─────────────────────────────────────────────────────┐
│ ⚠ Windows Notice                                    │
│ Sandbox runtime is not available on Windows.        │
│ Only command blocking is supported.                 │
└─────────────────────────────────────────────────────┘

[deniedCommands PathListEditor]
```

**Notice Card**:
- Component: `PixelCard` (variant="outlined")
- Icon: Warning emoji or unicode `⚠`
- Text: `font-mono text-[11px] text-text-secondary`
- Border: `border-accent-amber` to indicate limitation

**deniedCommands**:
- Same as 2.2.2 section 6
- Only section visible on Windows

---

## 3. Interaction Flow

### 3.1 Permission Mode Selection

1. User clicks on Restricted/Sandbox/Unrestricted card
2. Selected card highlights with green accent border
3. Content below changes:
   - **Restricted**: No additional UI (just the mode selector)
   - **Sandbox**: Shows `SandboxConfigEditor` (or `WindowsLimitedView` on Windows)
   - **Unrestricted**: No additional UI (just the mode selector)

### 3.2 Config Save/Load

**Loading a config**:
1. User clicks ConfigSelector dropdown
2. Dropdown shows all configs from `permissions-config/` folder
3. User selects a config
4. All PathListEditor sections populate with selected config data
5. If config is "default" (system-level), all fields show as read-only with visual indicator

**Saving current config**:
1. User clicks "Save" button
2. If current is "default":
   - Opens modal asking for new config name
   - Creates new config file with current values
3. If current is custom config:
   - Shows modal: "Overwrite [name] or create new?"
   - User chooses:
     - Overwrite: Updates existing file
     - New: Prompts for name, creates new file

**Default config behavior**:
- Default config is read-only
- PathListEditor components show `readOnly={true}` prop
- Visual indicator: Badge or text "Read-only system default"
- User must "Duplicate" to modify

### 3.3 Duplicate Config

1. User clicks "Duplicate" button
2. Modal opens: "Duplicate [current config name]"
3. Input field pre-filled with "[name] (copy)"
4. User edits name
5. On save: Creates new config file with same values, new ID
6. Automatically switches to the new config (now editable)

### 3.4 Windows Behavior

- On Windows: Only "Restricted" and "Sandbox" modes shown (hide Unrestricted or keep but disable?)
- If "Sandbox" selected: Show WindowsLimitedView instead of SandboxConfigEditor
- No filesystem/network config shown
- Only deniedCommands available

---

## 4. What to Remove from Current UI

### 4.1 GlobalSettingsPage.tsx

**Remove entirely**:
- `SafetyTab` function (lines 399-457)
- `SafetyBashToolSettings` component
- `SafetyMCPSettings` component
- "Safety" tab from main tab navigation
- All related imports and dependencies

**Reason**: App-level safety settings removed per requirement #1

---

### 4.2 ProjectSettingsPage.tsx

**Remove**:
- `ProjectSafetyTab` function (lines 356-424)
- Sub-section pill toggle (Bash Tool / MCP tabs)
- `ProjectSafetyBashToolSettings` component
- `ProjectSafetyMCPSettings` component

**Replace with**:
- New "Permissions" tab (same tab name, completely new implementation)
- `PermissionsSettings` component (as designed in this doc)

---

### 4.3 Component Removals

**Files to delete**:
- `packages/ui/src/components/settings/BashPresetSelector.tsx` (preset concept removed per #4, #7)
- Any `InheritToggle` or similar component (inheritance removed per #3)
- MCP-specific safety components (merged into unified Permissions per #7)

**Reason**: Preset system replaced with saved config system; inheritance model removed

---

### 4.4 Type System Updates (for reference, not UI)

**Remove from types**:
- `SandboxPreset` enum ('balanced', 'strict', 'permissive', 'development', 'custom')
- `defaultMode` field (replaced with `permissionMode`)
- `inheritFromGlobal` or similar flags
- `allowGitConfig` field (per #5)
- `enablePython` preset-related fields (per #6)
- Separate `BashToolConfig` and `MCPSafetyConfig` (merged into single `PermissionsConfig`)

---

## 5. Pixel Art Style Notes

### 5.1 Design System Adherence

**Colors** (from global.css):
- Background layers: `bg-deep`, `bg-surface`, `bg-elevated`
- Borders: `border-border-dim` (default), `border-border-bright` (hover/active)
- Text: `text-text-primary`, `text-text-secondary`, `text-text-dim`
- Accents: `accent-green` (success), `accent-red` (error), `accent-blue` (info), `accent-amber` (warning)

**Typography**:
- Headings/labels: `font-pixel text-[8px]` to `text-[10px]`
- Body text: `font-mono text-[11px]` to `text-[13px]`
- No border-radius anywhere (enforced globally)

**Shadows**:
- Raised elements: `shadow-pixel-raised`
- Sunken elements: `shadow-pixel-sunken`
- Floating elements: `shadow-pixel-drop`

### 5.2 Component Style Patterns

**Cards**:
- Use `PixelCard` component
- Variants: `default`, `elevated`, `interactive`, `outlined`
- Selected state: Add `border-l-4 border-l-accent-green`

**Buttons**:
- Use `PixelButton` component
- Variants: `primary`, `ghost`, `outline`
- Sizes: `sm`, `md` (default)

**Inputs**:
- Use `PixelInput` for text fields
- Border: `border-2 border-border-dim`
- Focus: `border-border-bright`

**Toggles**:
- Use `PixelToggle` component
- On: `bg-accent-green/20 border-accent-green`
- Off: `bg-deep border-border-dim`

**Dropdowns**:
- Use `PixelDropdown` component
- Trigger: `PixelButton` with `▼` arrow
- Menu: `bg-surface border-2 border-border-bright shadow-pixel-drop`

**Chips (in PathListEditor)**:
- Background: `bg-deep`
- Border: `border-2 border-border-dim`
- Remove button: `text-text-dim hover:text-accent-red`

### 5.3 Layout Spacing

- Section gaps: `gap-4` (16px)
- Component gaps: `gap-2` (8px)
- Card padding: `p-4` (16px)
- Input padding: `px-3 py-2` (12px / 8px)

### 5.4 Transitions

- Color transitions: `transition-colors`
- Border transitions: `transition-all` (when position changes)
- Motion presets: Use `dropdownTransition` from `lib/motion.ts` for dropdowns

---

## 6. Accessibility Notes

- All interactive elements use semantic HTML (`button`, `label`, `input`)
- Radio groups use `role="radiogroup"` and `aria-checked`
- Toggle uses `role="switch"` and `aria-checked`
- Form labels use `<label>` with `htmlFor` or wrapping
- Focus states visible with border color changes
- Keyboard navigation supported (Enter to submit, Tab to navigate)

---

## 7. Responsive Behavior

- Desktop-first design (Electron app)
- Minimum width: 640px (typical Settings panel width)
- Stack vertically on narrow panels (<640px)
- ConfigSelector dropdown adapts width to content

---

**End of UI Design Document**
