# UI Design: Workspace File Browser

> Replaces the current Artifacts page with a split-panel file browser for `~/.golemancy/projects/{id}/workspace/`

---

## 1. Page Layout

The workspace page uses a **left-right split-panel** layout: a resizable directory tree on the left and a file preview area on the right. This is rendered inside the existing `AppShell` (sidebar + topbar already present).

```
┌──────────┬──────────────────────────────────────────────────────┐
│ SIDEBAR  │  WORKSPACE                                           │
│ (240px)  │                                                      │
│          │  ┌─ Header ──────────────────────────────────────┐   │
│ ...      │  │  /workspace   [Refresh]                       │   │
│ >> Files │  └───────────────────────────────────────────────┘   │
│ ...      │                                                      │
│          │  ┌─ Tree Panel ──┬─ Preview Panel ───────────────┐   │
│          │  │               │                               │   │
│          │  │  workspace/   │  ┌─ Action Bar ─────────────┐ │   │
│          │  │  ├── src/     │  │ file.py  12KB  [DL][DEL] │ │   │
│          │  │  │   ├── m..  │  └──────────────────────────┘ │   │
│          │  │  │   └── u..  │                               │   │
│          │  │  ├── data/    │  ┌─ Preview Content ────────┐ │   │
│          │  │  │   └── r..  │  │                          │ │   │
│          │  │  ├── output/  │  │  import os               │ │   │
│          │  │  │   ├── r..  │  │  import json             │ │   │
│          │  │  │   └── c..  │  │                          │ │   │
│          │  │  └── README   │  │  def main():             │ │   │
│          │  │               │  │      ...                  │ │   │
│          │  │               │  │                          │ │   │
│          │  │               │  └──────────────────────────┘ │   │
│          │  │               │                               │   │
│          │  │  240px        │  Fluid (fills remaining)      │   │
│          │  └───────────────┴───────────────────────────────┘   │
│          │                                                      │
└──────────┴──────────────────────────────────────────────────────┘
```

### Layout Implementation

```
WorkspacePage (motion.div, p-6, full height flex column)
├── Header (flex row, items-center, justify-between, mb-4)
│   ├── Title: "Workspace" (font-pixel text-[14px] text-text-primary)
│   ├── Breadcrumb path (text-[12px] text-text-secondary font-mono)
│   └── PixelButton "Refresh" (variant="ghost", size="sm")
│
└── SplitPanel (flex row, flex-1, min-h-0, gap-0)
    ├── TreePanel (w-[240px] shrink-0, border-r-2 border-border-dim, overflow-y-auto, bg-deep)
    └── PreviewPanel (flex-1, min-w-0, overflow-y-auto, bg-void)
```

- The tree panel has a **fixed width of 240px** (matching the sidebar width convention)
- The preview panel fills the remaining space
- Both panels scroll independently (`overflow-y-auto`)
- A `2px border-border-dim` vertical divider separates the two panels

---

## 2. File Tree Component

### Structure

The `FileTree` component renders a recursive directory structure. Each node is either a folder (expandable) or a file (selectable).

```
workspace/                          ← root (always expanded, non-collapsible)
├── src/                            ← folder (collapsed)
│   ├── main.py                     ← file
│   └── utils.py                    ← file (selected)
├── data/                           ← folder (expanded)
│   ├── input.csv                   ← file
│   └── config.json                 ← file
├── output/                         ← folder (collapsed)
└── README.md                       ← file
```

### Visual Design

```
┌─ FileTree ──────────────────────────────┐
│                                          │
│  [>] src/                    3 items     │  ← collapsed folder
│  [v] data/                   2 items     │  ← expanded folder
│       input.csv              4.2 KB      │  ← file (indented 20px)
│       config.json            1.1 KB      │  ← file (indented 20px)
│  [>] output/                 5 items     │  ← collapsed folder
│  README.md                   2.8 KB      │  ← file (root level)
│                                          │
└──────────────────────────────────────────┘
```

### Tree Node Specs

**Folder node:**
```
┌─────────────────────────────────────────────┐
│ [v]  data/                       2 items    │
│ ^^^  ^^^^                        ^^^^^^     │
│ icon name                        count      │
│                                             │
│ Classes:                                    │
│   Container: px-3 py-1.5 flex items-center  │
│              gap-2 cursor-pointer           │
│              hover:bg-elevated/50           │
│   Icon:      text-[10px] text-text-dim      │
│              font-mono w-4 text-center      │
│   Name:      text-[12px] text-text-primary  │
│              font-mono truncate             │
│   Count:     text-[10px] text-text-dim      │
│              ml-auto font-mono              │
└─────────────────────────────────────────────┘
```

- Expand icon: `>` (collapsed) / `v` (expanded) — plain ASCII, `text-text-dim`, matching TaskListPage expand pattern
- Folder name: `font-mono text-[12px] text-text-primary`
- Item count: `font-mono text-[10px] text-text-dim` right-aligned
- Hover: `bg-elevated/50` transition
- Indentation: Each nesting level adds `pl-5` (20px) to align with pixel grid

**File node:**
```
┌─────────────────────────────────────────────┐
│ [PY]  main.py                    4.2 KB     │
│ ^^^^  ^^^^^^^                    ^^^^^      │
│ type  filename                   size       │
│ badge                                       │
│                                             │
│ Classes:                                    │
│   Container: px-3 py-1.5 flex items-center  │
│              gap-2 cursor-pointer           │
│              hover:bg-elevated/50           │
│   Type:      font-pixel text-[7px] w-7      │
│              text-center (color by type)    │
│   Name:      text-[12px] text-text-secondary│
│              font-mono truncate             │
│   Size:      text-[10px] text-text-dim      │
│              ml-auto font-mono              │
│                                             │
│ Selected state:                             │
│   bg-elevated border-l-2 border-l-accent-green │
│   Name becomes text-text-primary            │
└─────────────────────────────────────────────┘
```

- File type indicator: A tiny colored text label (see Section 8 for mappings)
- Filename: `font-mono text-[12px]`, `text-text-secondary` (unselected) / `text-text-primary` (selected)
- File size: `font-mono text-[10px] text-text-dim`
- Selected state: Matches sidebar active style — `bg-elevated` + `border-l-2 border-l-accent-green`

### Expand/Collapse Behavior

- Click on folder row toggles expand/collapse
- `AnimatePresence` wraps child list with `height: 0 → auto` animation (same as TaskListPage pattern)
- Root `workspace/` folder is always expanded and not collapsible
- Folders sort before files; alphabetical within each group

---

## 3. File Preview Area

The preview panel has two sub-sections: an **Action Bar** at the top and the **Preview Content** below.

### 3.1 Text/Code Files Preview

Supported extensions: `.py .js .ts .jsx .tsx .json .yaml .yml .xml .html .css .scss .sh .bash .md .txt .log .env .toml .ini .cfg .rs .go .java .c .cpp .h .rb .php .sql .r .lua .swift .kt`

```
┌─ Action Bar ──────────────────────────────────────────┐
│  PY  main.py           4.2 KB       [DL] [OPEN] [DEL]│
└───────────────────────────────────────────────────────┘
┌─ Preview ─────────────────────────────────────────────┐
│                                                       │
│  import os                                            │
│  import json                                          │
│  from pathlib import Path                             │
│                                                       │
│  def main():                                          │
│      config = load_config("settings.json")            │
│      process(config)                                  │
│                                                       │
│  if __name__ == "__main__":                           │
│      main()                                           │
│                                                       │
└───────────────────────────────────────────────────────┘

Preview container classes:
  bg-deep border-2 border-border-dim p-4
  overflow-auto max-h-[calc(100vh-200px)]

Content classes:
  <pre> tag
  font-mono text-[12px] text-accent-green
  whitespace-pre-wrap
  leading-[20px]
```

- No syntax highlighting (as per requirement — matches chat message `<pre>` style)
- Text color: `text-accent-green` for code files (matching existing ArtifactPreview pattern for code type)
- For `.md`, `.txt`, `.log` files: use `text-text-primary` instead of green
- Monospace font (JetBrains Mono), preserving whitespace
- Scrollable with custom pixel scrollbar

### 3.2 Image Preview

Supported extensions: `.png .jpg .jpeg .gif .svg .webp .ico .bmp`

```
┌─ Action Bar ──────────────────────────────────────────┐
│  IMG  screenshot.png   128 KB      [DL] [OPEN] [DEL] │
└───────────────────────────────────────────────────────┘
┌─ Preview ─────────────────────────────────────────────┐
│                                                       │
│             ┌─────────────────────┐                   │
│             │                     │                   │
│             │     [image]         │                   │
│             │                     │                   │
│             │   1920 x 1080       │                   │
│             └─────────────────────┘                   │
│                                                       │
│  Dimensions: 1920 x 1080                             │
│  Format: PNG                                          │
│                                                       │
└───────────────────────────────────────────────────────┘

Container classes:
  bg-deep border-2 border-border-dim p-4
  flex flex-col items-center

Image classes:
  <img> tag
  max-w-full max-h-[60vh] object-contain
  border-2 border-border-dim
  bg-surface (checkerboard background for transparency)

Metadata below image:
  text-[11px] text-text-dim font-mono mt-3
```

- Image is centered, constrained to `max-h-[60vh]` to leave room for action bar
- For `.svg` and `.ico` smaller images: apply `data-pixel` attribute for pixelated rendering
- A subtle `border-2 border-border-dim` frame around the image
- Dimensions text shown below the image

### 3.3 CSV/TSV Table Preview

Supported extensions: `.csv .tsv`

```
┌─ Action Bar ──────────────────────────────────────────┐
│  CSV  results.csv      8.1 KB      [DL] [OPEN] [DEL] │
└───────────────────────────────────────────────────────┘
┌─ Preview ─────────────────────────────────────────────┐
│                                                       │
│  ┌──────────┬──────────┬──────────┬──────────┐       │
│  │ Name     │ Score    │ Grade    │ Date     │       │
│  ├──────────┼──────────┼──────────┼──────────┤       │
│  │ Alice    │ 92       │ A        │ 2026-01  │       │
│  │ Bob      │ 85       │ B+       │ 2026-01  │       │
│  │ Carol    │ 78       │ C+       │ 2026-02  │       │
│  │ Dave     │ 95       │ A+       │ 2026-02  │       │
│  └──────────┴──────────┴──────────┴──────────┘       │
│                                                       │
│  Showing 4 of 4 rows                                  │
│                                                       │
└───────────────────────────────────────────────────────┘

Table classes:
  <table>
  w-full border-collapse

  <th> header cells:
    bg-surface border-2 border-border-dim
    px-3 py-2 text-left
    font-pixel text-[8px] text-text-secondary
    uppercase

  <td> body cells:
    bg-deep border-2 border-border-dim
    px-3 py-1.5
    font-mono text-[12px] text-text-primary

  Alternating rows:
    even rows: bg-surface/30 (subtle stripe)

  Container: overflow-x-auto (horizontal scroll for wide tables)
```

- First row is treated as header (bold via `font-pixel`)
- Max preview: **100 rows** — if file has more, show "Showing 100 of N rows" with note
- Horizontal scrollable for wide tables
- TSV uses tab delimiter; CSV uses comma delimiter

### 3.4 Tier 2 Metadata-Only Display

For files that cannot be previewed inline: `.pdf .doc .docx .xls .xlsx .ppt .pptx .zip .tar .gz .7z .rar .mp3 .mp4 .wav .avi .mov .exe .bin .dll .so .dmg .iso` and any unrecognized extension.

```
┌─ Action Bar ──────────────────────────────────────────┐
│  PDF  report.pdf       2.4 MB      [DL] [OPEN] [DEL] │
└───────────────────────────────────────────────────────┘
┌─ Preview ─────────────────────────────────────────────┐
│                                                       │
│                                                       │
│                     PDF                               │  ← font-pixel text-[20px]
│                                                       │     text-accent-purple
│              report.pdf                               │  ← font-mono text-[13px]
│                                                       │     text-text-primary
│         ──────────────────────                        │
│                                                       │
│         FILE INFO                                     │  ← font-pixel text-[8px]
│         Size:  2.4 MB                                 │     text-text-dim
│         Type:  application/pdf                        │
│         Path:  /workspace/output/report.pdf           │
│                                                       │
│         ──────────────────────                        │
│                                                       │
│              [ Open with System App ]                 │  ← PixelButton primary
│                                                       │
│  "This file type cannot be previewed inline."         │  ← text-[11px] text-text-dim
│  "Use the button above to open in your default app." │     text-center
│                                                       │
└───────────────────────────────────────────────────────┘

Container classes:
  bg-deep border-2 border-border-dim p-6
  flex flex-col items-center justify-center
  text-center min-h-[300px]
```

- Large file type label: `font-pixel text-[20px]` in the type's accent color
- File metadata section with `font-pixel text-[8px] text-text-dim` section label
- Prominent "Open with System App" button — `PixelButton variant="primary"` — calls `shell.openPath()` via Electron preload
- Helpful hint text below for users unfamiliar with the pattern

---

## 4. Action Bar

The action bar sits at the top of the preview panel, showing the selected file's info and action buttons.

```
┌──────────────────────────────────────────────────────────────┐
│  PY   main.py              4.2 KB          [DL] [EXT] [DEL] │
│  ^^   ^^^^^^^              ^^^^^           ^^^  ^^^^  ^^^^   │
│  type filename             size            actions           │
│  badge                                                       │
└──────────────────────────────────────────────────────────────┘

Container classes:
  bg-surface border-b-2 border-border-dim
  px-4 py-3 flex items-center gap-3

Type badge:
  inline-flex items-center justify-center
  font-pixel text-[8px] px-2 py-1
  border-2 (color varies by file type)
  (Uses PixelBadge-like styling, see Section 7)

Filename:
  font-mono text-[13px] text-text-primary truncate flex-1

Size:
  font-mono text-[11px] text-text-dim

Action buttons (all PixelButton variant="ghost" size="sm"):
  [Download]  — downloads file to user's system
  [Open]      — shell.openPath() (Tier 2 files, or any file)
  [Delete]    — opens confirmation modal
```

### Action Button Details

| Button | Label | Icon Text | Variant | Behavior |
|--------|-------|-----------|---------|----------|
| Download | `DL` | `font-pixel text-[8px]` | `ghost` | Triggers file download via server endpoint |
| Open External | `EXT` | `font-pixel text-[8px]` | `ghost` | Calls `window.electronAPI.openPath(filepath)` |
| Delete | `DEL` | `font-pixel text-[8px]` | `danger` | Opens PixelModal confirmation dialog |

### Delete Confirmation Modal

```
┌─────────────────────────────────────────────┐
│  Delete File                           [x]  │
├─────────────────────────────────────────────┤
│                                             │
│  Are you sure you want to delete:           │
│                                             │
│  main.py  (4.2 KB)                          │  ← font-mono, text-accent-red
│                                             │
│  This action cannot be undone.              │  ← text-text-dim
│                                             │
├─────────────────────────────────────────────┤
│                    [Cancel]  [Delete]        │  ← secondary + danger
└─────────────────────────────────────────────┘

Uses: PixelModal size="sm"
  Footer: PixelButton variant="secondary" (Cancel) + PixelButton variant="danger" (Delete)
```

---

## 5. Empty States

### 5.1 Workspace Empty (No Files)

When the workspace directory is empty or doesn't exist yet:

```
┌─ Full page (no split panel) ────────────────────────┐
│                                                      │
│  WORKSPACE                                           │
│                                                      │
│  ┌─ PixelCard variant="outlined" ─────────────────┐  │
│  │                                                 │  │
│  │                 ~/                               │  │  ← font-pixel text-[20px]
│  │                                                 │  │     text-text-dim
│  │       "Workspace is empty"                      │  │  ← font-pixel text-[10px]
│  │                                                 │  │     text-text-secondary
│  │   Files will appear here when agents produce    │  │  ← text-[12px] text-text-dim
│  │   outputs in the project workspace.             │  │
│  │                                                 │  │
│  └─────────────────────────────────────────────────┘  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

- Uses `PixelCard variant="outlined"` with dashed border (matching existing empty state pattern)
- Large pixel-art-style icon: `~/` as ASCII art (folder reference)
- No CTA button (files are created by agents, not manually)
- `staggerItem` motion animation on mount

### 5.2 No File Selected

When the tree has files but none is selected yet:

```
┌─ Tree Panel ──┬─ Preview Panel ───────────────────┐
│               │                                    │
│  workspace/   │                                    │
│  ├── src/     │          </                         │  ← font-pixel text-[20px]
│  ├── data/    │                                    │     text-text-dim
│  └── README   │    "Select a file to preview"      │  ← font-pixel text-[10px]
│               │                                    │     text-text-secondary
│               │    Click on any file in the tree   │  ← text-[12px] text-text-dim
│               │    to see its contents here.       │
│               │                                    │
└───────────────┴────────────────────────────────────┘

Preview panel classes when empty:
  flex flex-col items-center justify-center
  h-full text-center p-6
```

- Centered vertically and horizontally in the preview area
- `</` as ASCII art icon (file reference, matching sidebar's `<>` icon style)
- Subtle instruction text

---

## 6. Loading States

### 6.1 Directory Tree Loading

When the workspace directory listing is being fetched:

```
┌─ Tree Panel ──────────┐
│                        │
│  workspace/            │
│                        │
│  ░░░░░░░░░░░░ 80%     │  ← skeleton: bg-elevated h-5 w-32
│  ░░░░░░░░░ 60%        │  ← skeleton: bg-elevated h-5 w-24
│  ░░░░░░░░░░░░░ 90%    │  ← skeleton: bg-elevated h-5 w-36
│  ░░░░░░░ 50%          │  ← skeleton: bg-elevated h-5 w-20
│  ░░░░░░░░░░ 70%       │  ← skeleton: bg-elevated h-5 w-28
│                        │
└────────────────────────┘

Skeleton item classes:
  px-3 py-1.5 flex items-center gap-2

Skeleton bar classes:
  bg-elevated h-4 animate-[pixel-shimmer_1.5s_steps(4)_infinite]
  Varying widths: w-24, w-28, w-32, w-36 (randomized)
```

- 5-7 skeleton bars mimicking tree node shapes
- Uses `pixel-shimmer` animation (stepped, 4 steps)
- Root "workspace/" label is always shown (not skeleton)

### 6.2 File Content Loading

When a file is selected and its content is being fetched:

```
┌─ Action Bar (skeleton) ───────────────────────────────┐
│  ░░░   ░░░░░░░░░░░          ░░░                      │
└───────────────────────────────────────────────────────┘
┌─ Preview ─────────────────────────────────────────────┐
│                                                       │
│              PixelSpinner                             │
│           "Loading file..."                           │
│                                                       │
└───────────────────────────────────────────────────────┘
```

- Action bar shows skeleton placeholders for type badge + filename + size
- Preview area shows centered `PixelSpinner` with label `"Loading file..."`
- Matches existing loading pattern (see ArtifactsPage, TaskListPage)

---

## 7. Color Scheme — File Type Indicators

File types are mapped to accent colors from the existing design token palette. Each file category gets a consistent color used in the tree type badge and the action bar type badge.

| Category | Extensions | Color Token | Badge Text | Badge Border |
|----------|-----------|-------------|------------|--------------|
| **Code** | `.py .js .ts .jsx .tsx .rs .go .java .c .cpp .rb .php .swift .kt` | `accent-amber` | `text-accent-amber` | `border-accent-amber/30` |
| **Data** | `.json .yaml .yml .xml .toml .ini .cfg .csv .tsv .sql` | `accent-cyan` | `text-accent-cyan` | `border-accent-cyan/30` |
| **Text** | `.md .txt .log .env` | `accent-green` | `text-accent-green` | `border-accent-green/30` |
| **Web** | `.html .css .scss .svg` | `accent-blue` | `text-accent-blue` | `border-accent-blue/30` |
| **Image** | `.png .jpg .jpeg .gif .webp .ico .bmp` | `accent-purple` | `text-accent-purple` | `border-accent-purple/30` |
| **Script** | `.sh .bash .bat .ps1` | `accent-emerald` | `text-accent-emerald` | `border-accent-emerald/30` |
| **Document** | `.pdf .doc .docx .xls .xlsx .ppt .pptx` | `mc-lapis` | `text-mc-lapis` | `border-mc-lapis/30` |
| **Archive** | `.zip .tar .gz .7z .rar` | `mc-dirt` | `text-mc-dirt` | `border-mc-dirt/30` |
| **Media** | `.mp3 .mp4 .wav .avi .mov .webm` | `mc-gold` | `text-mc-gold` | `border-mc-gold/30` |
| **Binary** | `.exe .bin .dll .so .dmg .iso` and unrecognized | `mc-stone` | `text-mc-stone` | `border-mc-stone/30` |

The badge styling follows `PixelBadge` conventions: 2px border at 30% opacity, text color at full opacity, background at 15% opacity.

---

## 8. File Type Icons (ASCII Text Badges)

Instead of graphical icons, use tiny ASCII text labels in `font-pixel text-[7px]` as file type indicators. This is consistent with the sidebar's ASCII icon approach (`>_`, `{}`, `<>`, `#`, etc.).

| Category | Badge Text | Example |
|----------|-----------|---------|
| Code | `PY` `JS` `TS` `RS` `GO` `C` | Extension-based, uppercase, max 3 chars |
| Data | `JSON` `YAML` `XML` `CSV` `SQL` | Extension-based |
| Text | `TXT` `MD` `LOG` | Extension-based |
| Web | `HTML` `CSS` `SVG` | Extension-based |
| Image | `IMG` | Generic for all image types |
| Script | `SH` | Extension-based |
| Document | `PDF` `DOC` `XLS` `PPT` | Extension-based, abbreviated |
| Archive | `ZIP` `TAR` `GZ` | Extension-based |
| Media | `MP3` `MP4` `WAV` | Extension-based |
| Binary | `BIN` | Generic for all binary/unknown |
| Folder | `DIR` | For directory nodes |

Badge rendering in tree:

```tsx
// Inline in tree node
<span className={`font-pixel text-[7px] w-7 text-center ${colorClass}`}>
  {badge}
</span>
```

Badge rendering in action bar:

```tsx
// Larger badge in action bar, using PixelBadge-like styling
<span className={`inline-flex items-center px-2 py-1 font-pixel text-[8px] border-2 ${bgClass} ${textClass} ${borderClass}`}>
  {badge}
</span>
```

---

## 9. Responsive Behavior

The workspace page adapts based on the available content width (excluding the app sidebar).

### Width Breakpoints

| Content Width | Tree Panel | Preview Panel | Behavior |
|--------------|-----------|--------------|----------|
| **>= 640px** | 240px fixed | Fluid fill | Normal side-by-side split |
| **480-639px** | 200px fixed | Fluid fill | Slightly narrower tree |
| **< 480px** | Full width (stacked) | Full width (stacked) | Mobile-like: tree on top, preview below. File selection navigates to preview; back button returns to tree |

### Implementation

```tsx
// Use CSS media query via Tailwind
<div className="flex flex-col sm:flex-row flex-1 min-h-0">
  {/* Tree panel */}
  <div className={`
    ${selectedFile && isMobile ? 'hidden' : ''}
    w-full sm:w-[240px] sm:shrink-0
    border-b-2 sm:border-b-0 sm:border-r-2 border-border-dim
    overflow-y-auto bg-deep
  `}>
    <FileTree />
  </div>

  {/* Preview panel */}
  <div className={`
    ${!selectedFile && isMobile ? 'hidden' : ''}
    flex-1 min-w-0 overflow-y-auto
  `}>
    <FilePreview />
  </div>
</div>
```

Note: Since this is an Electron desktop app with minimum window 960x640, the `< 480px` case is unlikely in practice. The primary layout is the side-by-side split. However, the stacked fallback ensures graceful degradation if the app sidebar is expanded.

### Sidebar Interaction

- When the app sidebar is **expanded** (240px): content area is ~720px on min-width. Split = 240 tree + 480 preview. Comfortable.
- When the app sidebar is **collapsed** (56px): content area is ~904px. Split = 240 tree + 664 preview. Generous.

---

## 10. Animation

### Tree Expand/Collapse

Uses the same `AnimatePresence` + height animation pattern as `TaskListPage`:

```tsx
<AnimatePresence>
  {isExpanded && (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="overflow-hidden"
    >
      {children}
    </motion.div>
  )}
</AnimatePresence>
```

- Duration: **150ms** (faster than TaskListPage's default, since tree nodes are smaller)
- Expand icon rotation is not animated (pixel aesthetic = discrete states)

### File Selection Transition

When a new file is selected, the preview content cross-fades:

```tsx
<AnimatePresence mode="wait">
  <motion.div
    key={selectedFile.path}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.15 }}
  >
    <FilePreviewContent file={selectedFile} />
  </motion.div>
</AnimatePresence>
```

- Simple opacity cross-fade, **150ms**
- `mode="wait"` ensures old content exits before new enters (prevents layout thrashing)

### Page Mount

The entire workspace page uses `staggerContainer` + `staggerItem` on mount, matching all other pages:

```tsx
<motion.div className="p-6 flex flex-col h-full" {...staggerContainer} initial="initial" animate="animate">
  <motion.div {...staggerItem}>
    {/* Header */}
  </motion.div>
  <motion.div {...staggerItem} className="flex-1 flex min-h-0">
    {/* Split panel */}
  </motion.div>
</motion.div>
```

### Delete Confirmation

Uses `PixelModal` which already has `modalTransition` (scale 0.95 → 1, opacity, 200ms).

### Loading Skeletons

Tree skeletons use `pixel-shimmer` animation: `animation: pixel-shimmer 1.5s steps(4) infinite` (stepped shimmer, consistent with design system).

---

## 11. Sidebar Navigation Change

The sidebar nav item changes from "Artifacts" to "Workspace":

```tsx
// Before:
{ label: 'Artifacts', path: '/artifacts', icon: '[]', testId: 'artifacts' }

// After:
{ label: 'Workspace', path: '/workspace', icon: '~/   ', testId: 'workspace' }
```

- Icon: `~/` (terminal-style home directory reference, fits the file browser concept)
- Route: `/workspace` (replaces `/artifacts`)
- testId: `workspace` (replaces `artifacts`)

---

## 12. Component Hierarchy Summary

```
WorkspacePage
├── Header
│   ├── Title "Workspace" (font-pixel)
│   ├── BreadcrumbPath (font-mono, text-text-secondary)
│   └── PixelButton "Refresh" (ghost)
│
├── SplitPanel (flex row)
│   ├── TreePanel
│   │   ├── FileTreeSkeleton (loading state)
│   │   └── FileTree
│   │       └── FileTreeNode (recursive)
│   │           ├── FolderNode (expandable)
│   │           └── FileNode (selectable)
│   │
│   └── PreviewPanel
│       ├── EmptyPreview (no selection state)
│       ├── PreviewSkeleton (loading state)
│       └── FilePreview
│           ├── ActionBar
│           │   ├── TypeBadge
│           │   ├── FileName
│           │   ├── FileSize
│           │   ├── PixelButton "DL"
│           │   ├── PixelButton "EXT"
│           │   └── PixelButton "DEL" (danger)
│           │
│           ├── TextPreview (<pre>)
│           ├── ImagePreview (<img>)
│           ├── CsvPreview (<table>)
│           └── MetadataPreview (Tier 2)
│
├── EmptyWorkspace (when no files exist)
│
└── PixelModal "Delete Confirmation"
```

All components live in `packages/ui/src/pages/workspace/`:

```
packages/ui/src/pages/workspace/
├── WorkspacePage.tsx        — Main page component
├── FileTree.tsx             — Recursive directory tree
├── FilePreview.tsx          — Preview router (delegates to sub-previews)
├── TextPreview.tsx          — Code/text file <pre> preview
├── ImagePreview.tsx         — Image <img> preview
├── CsvPreview.tsx           — CSV/TSV <table> preview
├── MetadataPreview.tsx      — Tier 2 metadata display
└── ActionBar.tsx            — File action buttons bar
```

---

## 13. Key Design Decisions Summary

| Decision | Rationale |
|----------|-----------|
| Fixed 240px tree width (not resizable) | Matches sidebar width, keeps implementation simple, avoids drag-resize complexity |
| ASCII text badges instead of graphical icons | Consistent with sidebar icon style (`>_`, `{}`, `<>`), zero asset dependency |
| No syntax highlighting | Per requirement; matches chat message `<pre>` rendering |
| 100-row CSV preview limit | Performance guard for large files; full file accessible via download |
| `AnimatePresence` height animation for tree | Matches proven `TaskListPage` pattern exactly |
| File type detection by extension only | Per requirement; ~30 line extension map, no `file-type` library |
| Green `accent-green` for code text preview | Matches existing `ArtifactPreview` code display color |
| Stacked layout fallback at narrow width | Graceful degradation, though unlikely on desktop min-width |
