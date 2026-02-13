# Golemancy UI Design System — Pixel Craft

> A complete design system for Golemancy's Minecraft/Pixel Art-inspired desktop UI.
> Tech stack: React + TypeScript + Tailwind CSS + Framer Motion + Electron

---

## 1. Design Principles

1. **Pixel-First, Function-Always** — Every visual element speaks "pixel art", but never at the cost of usability. Readability and discoverability come first.
2. **Beveled Depth** — Borrow Minecraft's signature beveled border technique: lighter top-left edge, darker bottom-right edge, creating a raised/sunken 3D illusion on a 2D surface.
3. **Limited Palette, Maximum Expression** — Like classic 16-color game hardware, constrain the palette to maintain visual coherence. Use color saturation intentionally to draw attention.
4. **Stepped Motion** — Animations feel "pixelated" by using CSS `steps()` or discrete easing. Smooth animations are reserved for page transitions and layout shifts only.
5. **Dark by Default** — The entire UI is built around a dark background. No light theme in v1.

---

## 2. Color Palette

### 2.1 Core Palette (12 Colors)

| Token | Hex | Role |
|-------|-----|------|
| `bg-void` | `#0B0E14` | Deepest background (window chrome) |
| `bg-deep` | `#141820` | Primary background (content area) |
| `bg-surface` | `#1E2430` | Card / panel surface |
| `bg-elevated` | `#2A3242` | Elevated surface (modal, dropdown, hover) |
| `border-dim` | `#2E3A4E` | Subtle borders, dividers |
| `border-bright` | `#4A5568` | Active borders, focused elements |
| `text-primary` | `#E8ECF1` | Primary text |
| `text-secondary` | `#8B95A5` | Secondary / muted text |
| `text-dim` | `#505A6A` | Disabled text, placeholders |

### 2.2 Accent Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `accent-green` | `#4ADE80` | Primary action, success, "running" state |
| `accent-emerald` | `#34D399` | Hover variant of green |
| `accent-blue` | `#60A5FA` | Links, info, selected state |
| `accent-amber` | `#FBBF24` | Warnings, "paused" state, highlights |
| `accent-red` | `#F87171` | Errors, danger, "error" state |
| `accent-purple` | `#A78BFA` | Agent/AI indicator, special elements |
| `accent-cyan` | `#22D3EE` | Sub-Agent connections, secondary info |

### 2.3 Minecraft-Specific Tints

| Token | Hex | Usage |
|-------|-----|-------|
| `mc-stone` | `#7F7F7F` | Disabled surfaces (like stone blocks) |
| `mc-dirt` | `#8B6B4A` | Earthy accent, project cards |
| `mc-grass` | `#5B8C3E` | Nature/growth, new items |
| `mc-diamond` | `#4AEDD9` | Premium / important items |
| `mc-gold` | `#FCDB05` | Achievements, token usage |
| `mc-redstone` | `#D73B3B` | Active / hot status |
| `mc-lapis` | `#3C5DC4` | Info / knowledge / memory |

### 2.4 Semantic Mapping

```
success  → accent-green (#4ADE80)
info     → accent-blue (#60A5FA)
warning  → accent-amber (#FBBF24)
error    → accent-red (#F87171)
ai       → accent-purple (#A78BFA)
```

---

## 3. Typography

### 3.1 Font Stack

| Usage | Font | Fallback | Load |
|-------|------|----------|------|
| **Headings (H1-H3)** | `Press Start 2P` | `monospace` | Google Fonts |
| **Body / UI text** | `JetBrains Mono` | `Menlo, Consolas, monospace` | Google Fonts / bundled |
| **Code blocks** | `JetBrains Mono` | `monospace` | Same as body |

**Why this pairing**: Press Start 2P delivers the unmistakable pixel art identity for headings and labels, while JetBrains Mono provides excellent readability for body text and long-form content. Both are monospace, maintaining the "technical/game" feel without sacrificing legibility.

### 3.2 Type Scale

Based on a 4px grid with pixel-friendly sizes:

| Token | Size | Line Height | Weight | Font | Usage |
|-------|------|-------------|--------|------|-------|
| `text-pixel-xs` | 8px | 12px | 400 | Press Start 2P | Tiny labels, badges |
| `text-pixel-sm` | 10px | 16px | 400 | Press Start 2P | Small labels, metadata |
| `text-pixel-base` | 12px | 20px | 400 | Press Start 2P | Section headers, nav items |
| `text-pixel-lg` | 16px | 24px | 400 | Press Start 2P | Page titles |
| `text-pixel-xl` | 20px | 28px | 400 | Press Start 2P | Hero text |
| `text-body-xs` | 11px | 16px | 400 | JetBrains Mono | Micro text |
| `text-body-sm` | 12px | 18px | 400 | JetBrains Mono | Secondary body |
| `text-body-base` | 13px | 20px | 400 | JetBrains Mono | Primary body |
| `text-body-lg` | 15px | 24px | 400 | JetBrains Mono | Emphasized body |

### 3.3 Font Loading

```css
/* In global CSS (or @layer base) */
@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

/* For Electron offline support, bundle .woff2 files locally: */
/* packages/ui/src/assets/fonts/PressStart2P-Regular.woff2 */
/* packages/ui/src/assets/fonts/JetBrainsMono-*.woff2 */
```

---

## 4. Spacing & Grid

### 4.1 Base Unit: 4px

All spacing is multiples of 4px to align with the pixel grid:

| Token | Value | Common Usage |
|-------|-------|-------------|
| `space-0` | 0px | — |
| `space-1` | 4px | Inline gaps, tight padding |
| `space-2` | 8px | Default gap between elements |
| `space-3` | 12px | Section inner padding |
| `space-4` | 16px | Card padding, standard gap |
| `space-5` | 20px | Section spacing |
| `space-6` | 24px | Large gaps |
| `space-8` | 32px | Page section margins |
| `space-10` | 40px | Major section divides |
| `space-12` | 48px | Page-level padding |

### 4.2 Layout Grid

- **Sidebar width**: 240px (collapsed: 56px)
- **Top bar height**: 48px
- **Content max-width**: fluid (fills available space)
- **Card grid**: CSS Grid with `repeat(auto-fill, minmax(280px, 1fr))`, gap: 16px
- **Minimum window size**: 960 × 640

---

## 5. Borders & Corners

### 5.1 Border Philosophy: No Rounded Corners

Pixel art uses **sharp corners only** (`border-radius: 0`). No rounded corners in v1. This is the single strongest visual signal of "pixel style".

Exception: Avatar images may use 2px radius for a subtle softening effect only when displaying photographic content (rare).

### 5.2 Beveled Border System (Minecraft-Style)

The signature Minecraft UI effect: a 2px border where the top and left edges are lighter, bottom and right edges are darker. This creates the illusion of a raised 3D surface.

```
┌─ lighter border (top + left) ──────────┐
│                                         │
│          Content Area                   │
│                                         │
└─────────── darker border (bottom + right)┘
```

**Implementation via `box-shadow`**:

```css
/* Raised (default button, card) */
.pixel-raised {
  border: 2px solid #2E3A4E;
  box-shadow:
    inset 2px 2px 0px 0px rgba(255, 255, 255, 0.08),  /* top-left highlight */
    inset -2px -2px 0px 0px rgba(0, 0, 0, 0.3);       /* bottom-right shadow */
}

/* Sunken (pressed button, input focused) */
.pixel-sunken {
  border: 2px solid #2E3A4E;
  box-shadow:
    inset -2px -2px 0px 0px rgba(255, 255, 255, 0.08), /* bottom-right highlight */
    inset 2px 2px 0px 0px rgba(0, 0, 0, 0.3);          /* top-left shadow */
}

/* Flat (minimal emphasis) */
.pixel-flat {
  border: 2px solid #2E3A4E;
  box-shadow: none;
}
```

### 5.3 Drop Shadow

For floating elements (modals, dropdowns, tooltips):

```css
.pixel-drop-shadow {
  box-shadow: 4px 4px 0px 0px rgba(0, 0, 0, 0.5);
}
```

No blur. Pure hard-edge offset. This is the pixel art way.

---

## 6. Animation Principles

### 6.1 Motion Philosophy

| Category | Technique | Duration | Easing |
|----------|-----------|----------|--------|
| **Micro-interactions** | CSS `steps(N)` | 150-300ms | `steps(3)` or `steps(4)` |
| **State transitions** | Framer Motion | 200-400ms | `steps(4)` or `easeOut` |
| **Page transitions** | Framer Motion `AnimatePresence` | 300-500ms | `easeInOut` |
| **Layout shifts** | Framer Motion `layout` | 200-300ms | spring (stiffness: 300, damping: 30) |
| **Loading** | CSS sprite animation | looped | `steps(N) infinite` |

### 6.2 Framer Motion Presets

```typescript
// packages/ui/src/lib/motion.ts

export const pixelTransition = {
  type: "tween",
  duration: 0.2,
  ease: [0, 0, 1, 1], // linear, combined with CSS steps()
};

export const pixelSpring = {
  type: "spring",
  stiffness: 300,
  damping: 30,
  mass: 0.8,
};

export const fadeInUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.25 },
};

export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

export const staggerItem = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
};

export const pageTransition = {
  initial: { opacity: 0, x: 12 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -12 },
  transition: { duration: 0.3 },
};
```

### 6.3 Loading Animation Approach

Use CSS sprite-sheet animation with `steps()`:

```css
.pixel-spinner {
  width: 32px;
  height: 32px;
  background: url('/sprites/spinner.png') left center;
  animation: spin-frames 0.8s steps(8) infinite;
}
@keyframes spin-frames {
  to { background-position: -256px center; } /* 8 frames × 32px */
}
```

For simple loaders without sprite sheets, use a 3-dot "typing" animation with `steps(3)`.

---

## 7. Navigation Structure

### 7.1 Project Lobby (Root `/`)

```
┌──────────────────────────────────────────────────────────────┐
│  ◼ Golemancy                                    ⚙ Settings  │
│                                                              │
│   ╔═══════════════════════════════════════════════════════╗   │
│   ║           ☐ YOUR PROJECTS                             ║   │
│   ╚═══════════════════════════════════════════════════════╝   │
│                                                              │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│   │ ⛏ Project A │  │ 🗡 Project B │  │ + New       │        │
│   │             │  │             │  │  Project     │        │
│   │ 3 Agents    │  │ 5 Agents    │  │             │        │
│   │ Active: 1   │  │ Active: 0   │  │  [  +  ]    │        │
│   │             │  │             │  │             │        │
│   │ Last: 2h ago│  │ Last: 1d ago│  │             │        │
│   └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- Grid layout: `repeat(auto-fill, minmax(280px, 1fr))`
- Each project card shows: icon (pixel art block), name, agent count, active status, last activity
- "New Project" card is always last, visually distinct (dashed border)
- Framer Motion `layoutId` on cards enables expand-into-project animation

### 7.2 In-Project Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [◁ Project Switcher ▾]  Dashboard > Agents    [🔔] [⚙]     │  ← TopBar (48px)
├──────────┬───────────────────────────────────────────────────┤
│          │                                                   │
│ ◼ PROJ   │                                                   │
│          │                                                   │
│ ─────── │         Main Content Area                         │
│ 📊 Dash  │                                                   │
│ 🤖 Agents│                                                   │
│ 💬 Chat  │                                                   │
│ 📋 Tasks │                                                   │
│ 📦 Files │                                                   │
│ 🧠 Memory│                                                   │
│          │                                                   │
│ ─────── │                                                   │
│ ⚙ Config │                                                   │
│          │                                                   │
│          │                                                   │
│ [<<]     │                                                   │  ← Collapse button
├──────────┴───────────────────────────────────────────────────┤
│  Token Usage: 12.4K today  │  2 agents running               │  ← StatusBar (24px)
└──────────────────────────────────────────────────────────────┘

   240px                       Fluid
```

### 7.3 Sidebar Navigation Items

```
SECTION: Navigation
  📊 Dashboard       → /projects/:id
  🤖 Agents          → /projects/:id/agents
  💬 Chat            → /projects/:id/chat
  📋 Tasks           → /projects/:id/tasks
  📦 Artifacts       → /projects/:id/artifacts
  🧠 Memory          → /projects/:id/memory

SECTION: Config
  ⚙  Project Settings → /projects/:id/settings
```

Each nav item uses a pixel-art icon (16×16 sprite) + text label in JetBrains Mono.
Active state: `bg-elevated` background + `accent-green` left border (2px solid).

### 7.4 Project Switcher

Located in the TopBar, left side. Clicking opens a dropdown showing all projects.

```
┌──────────────────────────┐
│ ⛏ Current Project    ▾  │  ← Click to open
├──────────────────────────┤
│ ⛏ Project A         ✓  │  ← Current (checkmark)
│ 🗡 Project B             │
│ 📦 Project C             │
│ ────────────────────── │
│ + Create New Project     │
│ ◁ Back to Lobby          │
└──────────────────────────┘
```

Interaction: Smooth dropdown (Framer Motion `AnimatePresence`), 2px border, `pixel-drop-shadow`.

### 7.5 Responsive Strategy

| Window Width | Sidebar | Content |
|-------------|---------|---------|
| ≥ 1200px | Full (240px) | Fluid |
| 960–1199px | Collapsed (56px, icons only) | Fluid |
| < 960px | Hidden (overlay on toggle) | Full width |

Sidebar collapse uses Framer Motion `layout` animation with spring physics.

---

## 8. Core Page Wireframes

### 8.1 ProjectListPage (Project Lobby)

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: Logo + "Golemancy" (Press Start 2P, 16px)   [⚙ Gear] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  "YOUR PROJECTS" (Press Start 2P, 12px, text-secondary)        │
│                                                                 │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐      │
│  │  [pixel icon]  │ │  [pixel icon]  │ │                │      │
│  │  Content Biz   │ │  E-Commerce    │ │   + NEW        │      │
│  │  ────────────  │ │  ────────────  │ │   PROJECT      │      │
│  │  🤖 3 agents   │ │  🤖 5 agents   │ │                │      │
│  │  ● 1 running   │ │  ○ idle        │ │  Click to      │      │
│  │  2h ago        │ │  1d ago        │ │  create        │      │
│  └────────────────┘ └────────────────┘ └────────────────┘      │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  RECENT ACTIVITY (Press Start 2P, 10px)                        │
│  • Agent "Writer" completed "Draft blog post"    5 min ago     │
│  • Agent "Researcher" started "Competitor scan"  12 min ago    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 ProjectDashboardPage

```
┌──────────┬──────────────────────────────────────────────────────┐
│ SIDEBAR  │  DASHBOARD                                           │
│          │                                                      │
│          │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │
│          │  │ 🤖 5     │ │ ● 2      │ │ 📋 8     │ │ 💬 24  │  │
│          │  │ Agents   │ │ Running  │ │ Tasks    │ │ Chats  │  │
│          │  └──────────┘ └──────────┘ └──────────┘ └────────┘  │
│          │                                                      │
│          │  ACTIVE AGENTS                                       │
│          │  ┌──────────────────────────────────────────────┐    │
│          │  │ [■] Writer      ● Running   "Draft post..." │    │
│          │  │ [■] Researcher  ● Running   "Scanning..."   │    │
│          │  │ [□] Scheduler   ○ Idle                       │    │
│          │  └──────────────────────────────────────────────┘    │
│          │                                                      │
│          │  RECENT TASKS                                        │
│          │  ┌──────────────────────────────────────────────┐    │
│          │  │ ✓ "Blog post draft"    Writer    2h ago     │    │
│          │  │ ✓ "Data analysis"      Analyst   5h ago     │    │
│          │  │ ✗ "API call failed"    Bot       6h ago     │    │
│          │  └──────────────────────────────────────────────┘    │
│          │                                                      │
└──────────┴──────────────────────────────────────────────────────┘
```

### 8.3 AgentListPage

```
┌──────────┬──────────────────────────────────────────────────────┐
│ SIDEBAR  │  AGENTS                          [+ Create Agent]    │
│          │                                                      │
│          │  Filter: [All ▾] [Running ▾] [Search________]       │
│          │                                                      │
│          │  ┌─────────────────┐ ┌─────────────────┐            │
│          │  │ [██] Writer     │ │ [██] Researcher  │            │
│          │  │ ● Running       │ │ ○ Idle           │            │
│          │  │                 │ │                   │            │
│          │  │ Skills: 3       │ │ Skills: 4         │            │
│          │  │ Tools: 5        │ │ Tools: 2          │            │
│          │  │ Sub-Agents: 0   │ │ Sub-Agents: 1     │            │
│          │  │                 │ │                   │            │
│          │  │ [Chat] [Config] │ │ [Chat] [Config]   │            │
│          │  └─────────────────┘ └─────────────────┘            │
│          │                                                      │
│          │  ┌─────────────────┐ ┌─────────────────┐            │
│          │  │ [██] Team Lead  │ │ [+ New Agent   ] │            │
│          │  │ ⏸ Paused        │ │                   │            │
│          │  │                 │ │  "Add a new      │            │
│          │  │ Skills: 2       │ │   agent to your  │            │
│          │  │ Tools: 1        │ │   project"       │            │
│          │  │ Sub-Agents: 2   │ │                   │            │
│          │  │  └→ Writer      │ │                   │            │
│          │  │  └→ Researcher  │ │                   │            │
│          │  │ [Chat] [Config] │ │                   │            │
│          │  └─────────────────┘ └─────────────────┘            │
│          │                                                      │
└──────────┴──────────────────────────────────────────────────────┘
```

### 8.4 AgentDetailPage

```
┌──────────┬──────────────────────────────────────────────────────┐
│ SIDEBAR  │  ← Back to Agents                                    │
│          │                                                      │
│          │  [██] Writer                          [● Running]    │
│          │  "Content creation and blog writing assistant"       │
│          │                                                      │
│          │  ┌────────┬─────────┬──────┬────────────┬─────────┐  │
│          │  │ Info   │ Skills  │ Tools│ Sub-Agents │ Model   │  │
│          │  └────────┴─────────┴──────┴────────────┴─────────┘  │
│          │  ╔════════════════════════════════════════════════╗    │
│          │  ║  TAB CONTENT (e.g., Skills tab):              ║    │
│          │  ║                                               ║    │
│          │  ║  ┌──────────────────────────────────────────┐ ║    │
│          │  ║  │ ✎ Blog Writing                          │ ║    │
│          │  ║  │   "Write SEO-optimized blog posts"      │ ║    │
│          │  ║  ├──────────────────────────────────────────┤ ║    │
│          │  ║  │ ✎ Social Media Posts                    │ ║    │
│          │  ║  │   "Create posts for Twitter, LinkedIn"  │ ║    │
│          │  ║  ├──────────────────────────────────────────┤ ║    │
│          │  ║  │ [+ Add Skill]                           │ ║    │
│          │  ║  └──────────────────────────────────────────┘ ║    │
│          │  ╚════════════════════════════════════════════════╝    │
│          │                                                      │
│          │  ┌─────────────────────────────────────────────────┐  │
│          │  │ QUICK ACTIONS:  [💬 Chat] [▶ Run] [⏸ Pause]   │  │
│          │  └─────────────────────────────────────────────────┘  │
│          │                                                      │
└──────────┴──────────────────────────────────────────────────────┘
```

### 8.5 ChatPage

```
┌──────────┬──────────────────────────────────────┬──────────────┐
│ SIDEBAR  │  CHAT                                │ AGENT INFO   │
│          │                                      │              │
│          │  ┌─ Conversations ─┐                │ [██] Writer  │
│          │  │ ● Blog Draft    │                │ ● Running    │
│          │  │   New Chat      │                │              │
│          │  │   SEO Analysis  │                │ Skills: 3    │
│          │  └─────────────────┘                │ Tools: 5     │
│          │                                      │              │
│          │  ┌────────────────────────────────┐  │ ──────────── │
│          │  │ 🧑 You                    10:30│  │ Current Task │
│          │  │ Write a blog post about AI     │  │ "Draft blog" │
│          │  │ trends in 2025.                │  │ Progress: 60%│
│          │  ├────────────────────────────────┤  │              │
│          │  │ 🤖 Writer               10:31│  │ ──────────── │
│          │  │ I'll research and write that   │  │ Tool Calls   │
│          │  │ for you. Let me start...       │  │ ▸ web_search │
│          │  │                                │  │ ▸ read_file  │
│          │  │ ┌── 🔧 Tool: web_search ────┐ │  │              │
│          │  │ │ Query: "AI trends 2025"    │ │  │              │
│          │  │ │ Results: 12 found    [▾]   │ │  │              │
│          │  │ └────────────────────────────┘ │  │              │
│          │  │                                │  │              │
│          │  │ Based on my research...        │  │              │
│          │  │ ████████░░ (streaming...)      │  │              │
│          │  └────────────────────────────────┘  │              │
│          │                                      │              │
│          │  ┌────────────────────────────────┐  │              │
│          │  │ Type a message...        [Send]│  │              │
│          │  └────────────────────────────────┘  │              │
│          │                                      │              │
└──────────┴──────────────────────────────────────┴──────────────┘
```

### 8.6 TaskListPage

```
┌──────────┬──────────────────────────────────────────────────────┐
│ SIDEBAR  │  TASKS                                               │
│          │                                                      │
│          │  Filter: [All Status ▾] [All Agents ▾] [Search___] │
│          │                                                      │
│          │  ┌─────┬─────────────────┬─────────┬────────┬──────┐ │
│          │  │ St  │ Task            │ Agent   │ Time   │ Tkns │ │
│          │  ├─────┼─────────────────┼─────────┼────────┼──────┤ │
│          │  │ ●   │ Draft blog post │ Writer  │ 3m ago │ 2.1K │ │
│          │  │ ●   │ Scan competitors│ Resrchr │ 5m ago │ 1.8K │ │
│          │  │ ✓   │ SEO analysis    │ Writer  │ 1h ago │ 890  │ │
│          │  │ ✗   │ API fetch       │ Bot     │ 2h ago │ 120  │ │
│          │  │ ⏸   │ Daily report    │ Analyst │ 3h ago │ —    │ │
│          │  └─────┴─────────────────┴─────────┴────────┴──────┘ │
│          │                                                      │
│          │  ─── TASK DETAIL (expandable) ──────────────────── │
│          │  │ Task: Draft blog post                           │ │
│          │  │ Agent: Writer  │  Status: ● Running             │ │
│          │  │ Started: 10:28  │  Tokens: 2,134                │ │
│          │  │                                                 │ │
│          │  │ Execution Log:                                  │ │
│          │  │ 10:28:01  [start] Task initiated                │ │
│          │  │ 10:28:03  [tool]  web_search("AI trends")      │ │
│          │  │ 10:28:15  [tool]  read_file("notes.md")        │ │
│          │  │ 10:28:20  [gen]   Generating draft...           │ │
│          │  └─────────────────────────────────────────────────┘ │
│          │                                                      │
└──────────┴──────────────────────────────────────────────────────┘
```

### 8.7 SettingsPage

```
┌──────────────────────────────────────────────────────────────────┐
│  ← Back                    SETTINGS                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─ Nav ──────┐  ┌─ Content ──────────────────────────────────┐  │
│  │            │  │                                            │  │
│  │ General    │  │  AI PROVIDERS                              │  │
│  │ Providers  │  │                                            │  │
│  │ Appearance │  │  ┌──────────────────────────────────────┐  │  │
│  │ About      │  │  │ OpenAI                               │  │  │
│  │            │  │  │ API Key: [sk-***...***]  [Verify]    │  │  │
│  │            │  │  │ Default Model: [gpt-4o ▾]            │  │  │
│  │            │  │  │ Status: ✓ Connected                  │  │  │
│  │            │  │  └──────────────────────────────────────┘  │  │
│  │            │  │                                            │  │
│  │            │  │  ┌──────────────────────────────────────┐  │  │
│  │            │  │  │ Anthropic                            │  │  │
│  │            │  │  │ API Key: [Not configured]  [Add]     │  │  │
│  │            │  │  └──────────────────────────────────────┘  │  │
│  │            │  │                                            │  │
│  │            │  │  ┌──────────────────────────────────────┐  │  │
│  │            │  │  │ + Add Provider                       │  │  │
│  │            │  │  └──────────────────────────────────────┘  │  │
│  │            │  │                                            │  │
│  └────────────┘  └────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 9. Component Specifications

### 9.1 PixelButton

The primary interactive element. Uses beveled borders for the raised 3D look.

**Variants**:

| Variant | Background | Border Effect | Text Color |
|---------|-----------|---------------|------------|
| `primary` | `accent-green` | Beveled (light green top-left, dark green bottom-right) | `#0B0E14` (dark) |
| `secondary` | `bg-elevated` | Beveled (standard gray) | `text-primary` |
| `danger` | `accent-red` | Beveled (light red / dark red) | `#0B0E14` (dark) |
| `ghost` | transparent | 2px solid `border-dim` | `text-secondary` |
| `link` | transparent | none | `accent-blue` |

**States**:

| State | Visual Change |
|-------|--------------|
| Default | Beveled (raised) appearance |
| Hover | Background lightens 10%, cursor pointer |
| Active / Pressed | Beveled switches to **sunken**, `translateY(2px)`, shadow disappears |
| Disabled | `opacity: 0.4`, `cursor: not-allowed`, no hover/active effects |
| Focus | 2px outline in `accent-blue` with 2px offset |

**Sizes**: `sm` (h-28px, text-body-xs), `md` (h-36px, text-body-sm), `lg` (h-44px, text-body-base)

**Pixel-specific details**:
- No border-radius (sharp corners)
- Active state physically moves down 2px to simulate being "pressed into" the surface
- The beveled shadow flips on press (raised → sunken)

### 9.2 PixelCard

Container component for grouping content.

**Variants**:

| Variant | Background | Border |
|---------|-----------|--------|
| `default` | `bg-surface` | 2px `border-dim` + beveled |
| `elevated` | `bg-elevated` | 2px `border-bright` + beveled + `pixel-drop-shadow` |
| `interactive` | `bg-surface` → `bg-elevated` on hover | Beveled, hover: border brightens |
| `outlined` | transparent | 2px dashed `border-dim` |

**States**:
- Hover (interactive): background shifts to `bg-elevated`, border to `border-bright`
- Selected: 2px left border in `accent-green`
- Disabled: `opacity: 0.5`

### 9.3 PixelInput

Text input field.

**Structure**:
```
┌─ Label (text-pixel-xs, text-secondary) ──────────────┐
│                                                       │
│  ┌─ Input ─────────────────────────────────────────┐  │
│  │ Placeholder text...                             │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  Helper text (text-body-xs, text-dim)                 │
└───────────────────────────────────────────────────────┘
```

**States**:

| State | Border | Background | Shadow |
|-------|--------|-----------|--------|
| Default | `border-dim` | `bg-deep` | `pixel-sunken` (inset) |
| Hover | `border-bright` | `bg-deep` | `pixel-sunken` |
| Focus | `accent-blue` | `bg-deep` | `pixel-sunken` + blue glow (2px) |
| Error | `accent-red` | `bg-deep` | `pixel-sunken` + red glow |
| Disabled | `border-dim` | `bg-surface` (slightly lighter) | none, `opacity: 0.5` |

**Details**:
- Inputs are always **sunken** (opposite of buttons) to visually distinguish interactive from triggerable elements
- Font: JetBrains Mono `text-body-base`
- No border-radius
- Padding: 8px 12px

### 9.4 PixelBadge

Status labels and tags.

**Variants**:

| Variant | Background | Text |
|---------|-----------|------|
| `idle` | `bg-elevated` | `text-secondary` |
| `running` | `accent-green` at 15% opacity | `accent-green` |
| `error` | `accent-red` at 15% opacity | `accent-red` |
| `paused` | `accent-amber` at 15% opacity | `accent-amber` |
| `success` | `accent-green` at 15% opacity | `accent-green` |
| `info` | `accent-blue` at 15% opacity | `accent-blue` |

**Details**:
- Font: `text-pixel-xs` (Press Start 2P, 8px)
- Padding: 4px 8px
- No border-radius (square)
- 2px border matching the text color at 30% opacity
- `running` variant has a pulsing dot animation (CSS `steps(2)` between `opacity: 1` and `opacity: 0.3`)

### 9.5 PixelAvatar

Agent and project identity representation.

**Structure**: A square container (no rounded corners) displaying a pixel-art icon or initials.

**Sizes**: `xs` (24px), `sm` (32px), `md` (40px), `lg` (56px), `xl` (72px)

**Variants**:
- `icon`: Displays a pixel-art icon from a sprite sheet
- `initials`: Shows 1-2 letters in Press Start 2P font
- `image`: Shows a user-uploaded image with `image-rendering: pixelated`

**Pixel treatment**:
```css
.pixel-avatar img {
  image-rendering: pixelated;
  image-rendering: crisp-edges; /* Firefox fallback */
}
```

**Border**: 2px solid `border-dim`, beveled raised effect. Online status indicator: 8×8px square in bottom-right corner (green = online, gray = offline, yellow = paused, red = error).

### 9.6 PixelModal

Overlay dialog.

**Structure**:
```
┌─────────────────────────────────────────────────────┐
│ TITLE                                          [✕]  │  ← Header
├─────────────────────────────────────────────────────┤
│                                                     │
│  Content Area                                       │  ← Body
│                                                     │
├─────────────────────────────────────────────────────┤
│                           [Cancel]  [Confirm]       │  ← Footer
└─────────────────────────────────────────────────────┘
        ↑ 4px hard drop shadow (pixel-drop-shadow)
```

**Details**:
- Backdrop: `rgba(0, 0, 0, 0.7)` with no blur (pixel-clean)
- Modal background: `bg-surface`
- Border: 2px `border-bright`, beveled raised
- `pixel-drop-shadow`: `4px 4px 0 rgba(0, 0, 0, 0.5)`
- Animation: Framer Motion `scale: [0.95, 1]` + `opacity: [0, 1]`, 200ms
- No border-radius
- Max-width: 480px (sm), 640px (md), 800px (lg)

### 9.7 PixelDropdown

Contextual option selector.

**Trigger**: PixelButton with `▾` icon.

**Menu**:
```
┌──────────────────────────┐
│ Option A                 │  ← hover: bg-elevated
│ Option B              ✓  │  ← selected: checkmark + accent-green text
│ ──────────────────────── │  ← divider
│ Option C                 │
└──────────────────────────┘
  ↑ 4px hard drop shadow
```

**Details**:
- Background: `bg-surface`
- Border: 2px `border-bright`, beveled
- Items: padding 8px 12px, font JetBrains Mono `text-body-sm`
- Hover: `bg-elevated`
- Animation: Framer Motion `y: [-4, 0]` + `opacity`, 150ms
- No border-radius

### 9.8 PixelTabs

Tab navigation for sectioned content (e.g., AgentDetailPage).

**Structure**:
```
┌────────┬─────────┬──────┬────────────┬─────────┐
│ ■ Info │ Skills  │ Tools│ Sub-Agents │ Model   │
└────────┴─────────┴──────┴────────────┴─────────┘
 ▲ active
 bg-surface, border-bottom: none (merges with content)
 Inactive tabs: bg-deep, 2px bottom border
```

**Active tab**: `bg-surface` (matches content area), `text-primary`, bottom border disappears (seamlessly connected to content).
**Inactive tab**: `bg-deep`, `text-secondary`, 2px bottom `border-dim`.
**Hover**: `text-primary`, slight `bg-elevated` tint.

---

## 10. Agent State Visualization

### 10.1 Status Visual System

| State | Color | Icon | Badge | Animation |
|-------|-------|------|-------|-----------|
| **Idle** | `text-secondary` (#8B95A5) | Empty circle `○` | Gray "IDLE" | None (static) |
| **Running** | `accent-green` (#4ADE80) | Filled circle `●` | Green "RUNNING" | Pulsing dot (steps(2), 1s) |
| **Error** | `accent-red` (#F87171) | Cross `✗` | Red "ERROR" | Brief shake (3 steps, then static) |
| **Paused** | `accent-amber` (#FBBF24) | Pause bars `⏸` | Amber "PAUSED" | Slow blink (steps(2), 2s) |

### 10.2 Agent Card Status Indicator

On the AgentListPage, each agent card has a **status bar** at the top:

```
┌─── ● ──────────────────────────────────────────┐  ← 4px tall colored bar
│                                                 │     green = running
│  [Avatar]  Agent Name                           │     gray = idle
│            Status Badge                         │     red = error
│            ...                                  │     amber = paused
└─────────────────────────────────────────────────┘
```

### 10.3 Running Agent Activity

When an agent is running, its card shows:
- Pulsing green dot next to name
- Current task name below status
- Tiny progress indicator (pixel-style bar: `████████░░`)
- Token counter incrementing

### 10.4 Sub-Agent Relationship Visualization

On the Agent Detail page's "Sub-Agents" tab:

```
┌─────────────────────────────────────────────┐
│   [██] Team Lead  (this agent)              │
│         │                                    │
│         ├──→ [██] Writer    ● Running       │
│         │     role: "Content Creation"       │
│         │                                    │
│         └──→ [██] Researcher  ○ Idle        │
│               role: "Information Gathering"  │
│                                              │
│   [+ Add Sub-Agent]                          │
└─────────────────────────────────────────────┘
```

Visual: A simple tree with pixel-art connection lines (`│`, `├`, `└`, `→`).
Each sub-agent row shows: avatar, name, status badge, role label.

---

## 11. Empty / Loading / Error States

### 11.1 Empty States

Each page has a unique empty state with a pixel-art illustration and actionable CTA:

| Page | Illustration Concept | Message | CTA |
|------|---------------------|---------|-----|
| ProjectList (no projects) | Pixel pickaxe in dirt | "No projects yet. Time to mine!" | [⛏ Create First Project] |
| AgentList (no agents) | Pixel workbench | "No agents yet. Craft your first!" | [+ Create Agent] |
| Chat (no conversations) | Pixel speech bubble (empty) | "Start a conversation" | [💬 New Chat] |
| TaskList (no tasks) | Pixel clipboard | "No tasks have run yet" | "Agents will create tasks when they work" |
| Artifacts (no artifacts) | Pixel chest (empty) | "No artifacts yet" | "Agents produce artifacts as they work" |
| Memory (no memories) | Pixel book (closed) | "No memories stored" | [+ Add Memory] |

**Design pattern for all empty states**:
```
┌─────────────────────────────────────────────┐
│                                             │
│        [64×64 pixel-art illustration]       │
│                                             │
│    "No agents yet. Craft your first!"       │  ← Press Start 2P, 12px
│                                             │
│     Agents are AI workers you configure     │  ← JetBrains Mono, 13px
│     to perform tasks in your project.       │      text-secondary
│                                             │
│             [+ Create Agent]                │  ← PixelButton primary
│                                             │
└─────────────────────────────────────────────┘
```

### 11.2 Loading States

**Page-level loading**:
- Full-page centered pixel spinner (32×32 sprite animation, `steps(8)`)
- Below spinner: "Loading..." in Press Start 2P, 10px, text-secondary, with 3-dot typing animation

**Component-level loading**:
- Skeleton screens using `bg-elevated` blocks with a stepped shimmer animation
- Shimmer: `background-position` animation with `steps(4)` over 1.5s
- Skeleton blocks match the shape of content they replace (no rounded corners)

**Inline loading** (e.g., chat streaming):
- Cursor-blink style: `█` character blinking with `steps(1)` at 0.5s intervals
- "Thinking..." text with pixel dots animation

### 11.3 Error States

**Page-level error**:
```
┌─────────────────────────────────────────────┐
│                                             │
│        [64×64 pixel creeper face]           │
│                                             │
│         "Something went wrong!"             │  ← Press Start 2P, 12px, accent-red
│                                             │
│    Error: Connection refused (ECONNREF)     │  ← JetBrains Mono, 13px, text-secondary
│                                             │
│          [Retry]   [Go Home]                │  ← PixelButton secondary + primary
│                                             │
└─────────────────────────────────────────────┘
```

**Toast notifications** (non-blocking errors):
- Appear from top-right, slide in with Framer Motion
- Background: `bg-surface`, 2px border in error/warning/success color
- Auto-dismiss after 5s, with pixel-style progress bar at bottom
- No border-radius, `pixel-drop-shadow`

**Inline field errors**:
- Red border on input (`accent-red`)
- Error message below input in `accent-red`, `text-body-xs`

---

## 12. Tailwind Theme Configuration

```typescript
// packages/ui/tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // === Colors ===
      colors: {
        // Core backgrounds
        void: '#0B0E14',
        deep: '#141820',
        surface: '#1E2430',
        elevated: '#2A3242',

        // Borders
        'border-dim': '#2E3A4E',
        'border-bright': '#4A5568',

        // Text
        'text-primary': '#E8ECF1',
        'text-secondary': '#8B95A5',
        'text-dim': '#505A6A',

        // Accents
        accent: {
          green: '#4ADE80',
          emerald: '#34D399',
          blue: '#60A5FA',
          amber: '#FBBF24',
          red: '#F87171',
          purple: '#A78BFA',
          cyan: '#22D3EE',
        },

        // Minecraft tints
        mc: {
          stone: '#7F7F7F',
          dirt: '#8B6B4A',
          grass: '#5B8C3E',
          diamond: '#4AEDD9',
          gold: '#FCDB05',
          redstone: '#D73B3B',
          lapis: '#3C5DC4',
        },
      },

      // === Typography ===
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],
        mono: ['"JetBrains Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        'pixel-xs': ['8px', { lineHeight: '12px' }],
        'pixel-sm': ['10px', { lineHeight: '16px' }],
        'pixel-base': ['12px', { lineHeight: '20px' }],
        'pixel-lg': ['16px', { lineHeight: '24px' }],
        'pixel-xl': ['20px', { lineHeight: '28px' }],
        'body-xs': ['11px', { lineHeight: '16px' }],
        'body-sm': ['12px', { lineHeight: '18px' }],
        'body-base': ['13px', { lineHeight: '20px' }],
        'body-lg': ['15px', { lineHeight: '24px' }],
      },

      // === Spacing (4px base grid) ===
      spacing: {
        'px-1': '4px',
        'px-2': '8px',
        'px-3': '12px',
        'px-4': '16px',
        'px-5': '20px',
        'px-6': '24px',
        'px-8': '32px',
        'px-10': '40px',
        'px-12': '48px',
      },

      // === Border Radius (none for pixel art) ===
      borderRadius: {
        none: '0px',
        pixel: '0px', // Explicit alias for clarity
      },

      // === Box Shadow (pixel-style hard shadows) ===
      boxShadow: {
        // Beveled raised (buttons, cards)
        'pixel-raised': [
          'inset 2px 2px 0px 0px rgba(255, 255, 255, 0.08)',
          'inset -2px -2px 0px 0px rgba(0, 0, 0, 0.3)',
        ].join(', '),
        // Beveled sunken (inputs, pressed buttons)
        'pixel-sunken': [
          'inset -2px -2px 0px 0px rgba(255, 255, 255, 0.08)',
          'inset 2px 2px 0px 0px rgba(0, 0, 0, 0.3)',
        ].join(', '),
        // Floating elements (modals, dropdowns)
        'pixel-drop': '4px 4px 0px 0px rgba(0, 0, 0, 0.5)',
        // Combined: raised + drop shadow (elevated cards)
        'pixel-elevated': [
          'inset 2px 2px 0px 0px rgba(255, 255, 255, 0.08)',
          'inset -2px -2px 0px 0px rgba(0, 0, 0, 0.3)',
          '4px 4px 0px 0px rgba(0, 0, 0, 0.5)',
        ].join(', '),
        // Focus ring (blue outline)
        'pixel-focus': '0 0 0 2px #60A5FA',
        // Error ring
        'pixel-error': '0 0 0 2px #F87171',
      },

      // === Transitions ===
      transitionTimingFunction: {
        'pixel-step-3': 'steps(3)',
        'pixel-step-4': 'steps(4)',
        'pixel-step-8': 'steps(8)',
      },

      // === Animations ===
      keyframes: {
        'pixel-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
        'pixel-shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-2px)' },
          '75%': { transform: 'translateX(2px)' },
        },
        'pixel-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        'pixel-shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'pixel-pulse': 'pixel-pulse 1s steps(2) infinite',
        'pixel-shake': 'pixel-shake 0.3s steps(3) 1',
        'pixel-blink': 'pixel-blink 1s steps(1) infinite',
        'pixel-shimmer': 'pixel-shimmer 1.5s steps(4) infinite',
      },

      // === Layout ===
      width: {
        sidebar: '240px',
        'sidebar-collapsed': '56px',
      },
      height: {
        topbar: '48px',
        statusbar: '24px',
      },
      minWidth: {
        app: '960px',
      },
      minHeight: {
        app: '640px',
      },
    },
  },
  plugins: [],
} satisfies Config
```

---

## 13. Global CSS Layer

```css
/* packages/ui/src/styles/global.css */

@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  /* Reset border-radius globally for pixel art style */
  *, *::before, *::after {
    border-radius: 0 !important;
  }

  /* Base document styles */
  html {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    line-height: 20px;
    color: #E8ECF1;
    background-color: #0B0E14;
    -webkit-font-smoothing: antialiased;
  }

  /* Pixel-perfect image scaling */
  img[data-pixel],
  .pixel-art {
    image-rendering: pixelated;
    image-rendering: crisp-edges;
  }

  /* Scrollbar styling (pixel-themed) */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  ::-webkit-scrollbar-track {
    background: #141820;
  }
  ::-webkit-scrollbar-thumb {
    background: #2E3A4E;
    border: 1px solid #141820;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #4A5568;
  }

  /* Selection color */
  ::selection {
    background: rgba(74, 222, 128, 0.3);
    color: #E8ECF1;
  }
}

@layer components {
  /* Reusable pixel border classes */
  .pixel-border {
    border: 2px solid #2E3A4E;
  }
  .pixel-border-bright {
    border: 2px solid #4A5568;
  }
  .pixel-border-dashed {
    border: 2px dashed #2E3A4E;
  }
}
```

---

## 14. Technical Implementation Notes

### 14.1 Pixel Font Loading for Electron

Since Golemancy is a desktop app, bundle fonts locally for offline support:

```
packages/ui/src/assets/fonts/
├── PressStart2P-Regular.woff2
├── JetBrainsMono-Regular.woff2
├── JetBrainsMono-Medium.woff2
├── JetBrainsMono-SemiBold.woff2
└── JetBrainsMono-Bold.woff2
```

Use `@font-face` with local paths as primary, Google Fonts CDN as fallback during development.

### 14.2 Image Rendering

All pixel-art assets must use:
```css
image-rendering: pixelated;    /* Chrome, Edge */
image-rendering: crisp-edges;  /* Firefox */
```

Apply via the `data-pixel` attribute or `.pixel-art` class. This prevents browser anti-aliasing from blurring scaled-up pixel art.

### 14.3 Framer Motion Integration

Framer Motion handles:
1. **Page transitions**: `AnimatePresence` wrapping route outlet, using `pageTransition` preset
2. **Layout animations**: `layout` prop on cards and lists for smooth reflow
3. **Project enter**: `layoutId` on project cards for expand-into-project morph
4. **Modals**: Scale + opacity entrance/exit
5. **Dropdowns**: Y-slide + opacity
6. **Stagger**: Card grids use `staggerContainer` + `staggerItem`

CSS `steps()` handles:
1. **Status dot pulse**: `animation: pixel-pulse 1s steps(2) infinite`
2. **Loading spinner**: Sprite sheet with `steps(8)`
3. **Skeleton shimmer**: `animation: pixel-shimmer 1.5s steps(4) infinite`
4. **Error shake**: `animation: pixel-shake 0.3s steps(3) 1`

### 14.4 Sprite Sheet for Icons

Create a unified 16×16 pixel icon sprite sheet containing:
- Navigation icons (dashboard, agents, chat, tasks, artifacts, memory, settings)
- Status icons (running, idle, error, paused)
- Action icons (add, edit, delete, search, filter, close, expand)
- Object icons (project, agent, tool, skill, sub-agent)

Render at 2× (32×32) for retina displays, using `image-rendering: pixelated`.

---

## 15. Consistency Checklist

- [x] All components use 0 border-radius (sharp corners)
- [x] All borders are exactly 2px (never 1px or 3px)
- [x] All shadows use hard edges (0 blur radius)
- [x] All spacing is multiples of 4px
- [x] Interactive elements (buttons, cards) use beveled raised style
- [x] Input elements use beveled sunken style
- [x] Headings use Press Start 2P; body text uses JetBrains Mono
- [x] Status colors are consistent: green=running, amber=paused, red=error, gray=idle
- [x] All pixel art images use `image-rendering: pixelated`
- [x] All animations use `steps(N)` for pixel feel (except page transitions)
- [x] Dark theme only; all backgrounds derived from void→deep→surface→elevated hierarchy
- [x] Empty states have: pixel illustration + message + CTA
- [x] Loading states have: pixel spinner or stepped skeleton
- [x] Error states have: pixel illustration + message + retry action
- [x] Modals use dark backdrop (no blur) + hard drop shadow
- [x] Focus states use 2px blue outline (`pixel-focus` shadow)
