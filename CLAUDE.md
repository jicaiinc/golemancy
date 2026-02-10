# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

SoloCraft — AI Agent orchestration platform. Electron desktop app with pixel art (Minecraft) aesthetic, dark theme only. Language convention: Chinese for discussions/docs, English for code.

## Commands

```bash
# Development (runs Electron app with HMR)
pnpm dev

# Build all packages
pnpm build

# Type-check all packages
pnpm lint

# Run all tests
pnpm test

# Run tests in a single package
pnpm --filter @solocraft/ui test

# Run a single test file
pnpm --filter @solocraft/ui exec vitest run src/components/base/PixelButton.test.tsx

# Run tests in watch mode
pnpm --filter @solocraft/ui exec vitest src/components/base/PixelButton.test.tsx
```

## Monorepo Structure

```
apps/desktop/     @solocraft/desktop  — Electron shell (minimal, just creates window)
packages/ui/      @solocraft/ui       — All React UI, business logic, store, services
packages/shared/  @solocraft/shared   — Pure TypeScript types (zero runtime code)
```

Strict one-way dependency: `desktop → ui → shared`

Turborepo orchestrates tasks. pnpm v10 workspaces.

## Architecture

### State (Zustand v5)

Single store at `packages/ui/src/stores/useAppStore.ts` with slices: project, agent, conversation, task, artifact, memory, settings, ui, dashboard.

Zustand v5 requires double-parenthesis pattern: `create<T>()(...)`.

Store persists theme + sidebar state to localStorage. Uses AbortController to cancel in-flight requests on project switch.

### Service Layer (DI)

- Interfaces: `packages/ui/src/services/interfaces.ts` (8 services: Project, Agent, Conversation, Task, Artifact, Memory, Settings, Dashboard)
- Container: `packages/ui/src/services/container.ts` — module-level singleton via `getServices()`/`configureServices()`
- Mock implementations: `packages/ui/src/services/mock/`
- Seed data centralized in `services/mock/data.ts` — never scatter mock data elsewhere

Zustand actions use `getServices()` directly (can't access React Context). Components use `useServices()` hook.

### Routing (React Router v7)

HashRouter at `packages/ui/src/app/routes.tsx`. Project-scoped routes nested under `/projects/:projectId` with `ProjectLayout`.

### Config Hierarchy

Three-layer resolution: Global Settings → Project Config → Agent Config. See `useResolvedConfig()` hook.

### Type System

Branded ID types in `packages/shared/src/types/common.ts` (`ProjectId`, `AgentId`, etc.) prevent mixing IDs at compile time.

## Critical Library Choices

These are deliberate decisions — do NOT use the alternatives:

| Use this | NOT this | Why |
|----------|----------|-----|
| `motion/react` | `framer-motion` | motion is the current package |
| `react-router` | `react-router-dom` | v7 unified package |
| `@tailwindcss/postcss` | `@tailwindcss/vite` | vite plugin bugs with electron-vite dev |
| Tailwind CSS v4 CSS-first (`@theme {}` in global.css) | `tailwind.config.js` | v4 architecture |

## Styling

Tailwind CSS v4 with CSS-first config in `packages/ui/src/styles/global.css`:
- Design tokens defined in `@theme {}` block (colors, fonts, shadows)
- Pixel font: Press Start 2P. Body font: JetBrains Mono
- No border-radius anywhere (pixel art style)
- Shadow system: `shadow-pixel-raised`, `shadow-pixel-sunken`, `shadow-pixel-drop`
- PostCSS config lives in `apps/desktop/postcss.config.js`

## Naming Conventions

- **Components**: `Pixel*` prefix for base components (PixelButton, PixelCard, etc.)
- **Pages**: `*Page` suffix, organized in `packages/ui/src/pages/` by domain
- **Services**: `I*Service` interfaces, `Mock*Service` implementations
- **Motion presets**: `packages/ui/src/lib/motion.ts`

## Testing

Vitest with jsdom environment. Setup file at `packages/ui/src/test/setup.ts` mocks matchMedia, ResizeObserver, IntersectionObserver. Tests co-located with source files (`*.test.tsx`).

## Note: Fact-Based Analysis

When asked to analyze based on "facts", always consult actual evidence before drawing conclusions — never assume. "Facts" refers to: official docs, web search results, Context7 library lookups, source code readings, and similar verifiable sources. Verify technical claims (API signatures, library behavior, version-specific features) against "facts" rather than relying on training knowledge, which may be outdated or wrong.
