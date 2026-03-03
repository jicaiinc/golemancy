import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers)

// Auto-cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock window.matchMedia (needed for responsive components)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock ResizeObserver (for layout components)
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})) as unknown as typeof ResizeObserver

// Mock IntersectionObserver (for lazy loading)
globalThis.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})) as unknown as typeof IntersectionObserver

// --- i18n test utilities ---
// Load all locale JSON files so the mock can resolve keys to real strings.
// This keeps test assertions readable (they check for actual UI text, not key paths).
import agentEn from '../locales/en/agent.json'
import chatEn from '../locales/en/chat.json'
import commonEn from '../locales/en/common.json'
import cronEn from '../locales/en/cron.json'
import dashboardEn from '../locales/en/dashboard.json'
import errorEn from '../locales/en/error.json'
import mcpEn from '../locales/en/mcp.json'
import knowledgeBaseEn from '../locales/en/knowledgeBase.json'
import navEn from '../locales/en/nav.json'
import onboardingEn from '../locales/en/onboarding.json'
import permissionsEn from '../locales/en/permissions.json'
import projectEn from '../locales/en/project.json'
import settingsEn from '../locales/en/settings.json'
import skillEn from '../locales/en/skill.json'
import speechEn from '../locales/en/speech.json'
import taskEn from '../locales/en/task.json'
import workspaceEn from '../locales/en/workspace.json'

const translationResources: Record<string, Record<string, unknown>> = {
  agent: agentEn,
  chat: chatEn,
  common: commonEn,
  cron: cronEn,
  dashboard: dashboardEn,
  error: errorEn,
  mcp: mcpEn,
  knowledgeBase: knowledgeBaseEn,
  nav: navEn,
  onboarding: onboardingEn,
  permissions: permissionsEn,
  project: projectEn,
  settings: settingsEn,
  skill: skillEn,
  speech: speechEn,
  task: taskEn,
  workspace: workspaceEn,
}

/** Resolve a dot-path like 'button.cancel' within an object */
function resolvePath(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split('.')
  let cur: unknown = obj
  for (const part of parts) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return typeof cur === 'string' ? cur : undefined
}

/**
 * Resolve a translation key with optional interpolation and plural support.
 * Handles namespace prefix ('common:button.cancel'), i18next plural suffixes
 * (_one/_other based on count option), and falls back to key on miss.
 */
function resolveTranslation(
  key: string,
  defaultNs: string,
  options?: Record<string, unknown>,
): string {
  let ns = defaultNs
  let actualKey = key
  const colonIdx = key.indexOf(':')
  if (colonIdx !== -1) {
    ns = key.slice(0, colonIdx)
    actualKey = key.slice(colonIdx + 1)
  }

  const nsData = translationResources[ns]
  let value = nsData ? resolvePath(nsData, actualKey) : undefined

  // Handle i18next plural suffixes: try _one/_other when count option is present
  if (value === undefined && nsData && options && typeof options.count === 'number') {
    const suffix = options.count === 1 ? '_one' : '_other'
    value = resolvePath(nsData, actualKey + suffix)
  }

  const resolved = value ?? key

  if (options && typeof resolved === 'string') {
    return resolved.replace(/\{\{(\w+)\}\}/g, (_, k) =>
      options[k] !== undefined ? String(options[k]) : `{{${k}}}`,
    )
  }
  return resolved
}

// Mock i18next (used directly by parse-error.ts, i18n/config.ts, and other non-React utilities)
vi.mock('i18next', () => {
  const instance = {
    // Return the last key segment as fallback, mirroring parseMissingKeyHandler in config.ts
    t: (key: string) => key.split('.').pop() ?? key,
    use: () => instance,
    init: () => instance,
    on: vi.fn(),
    language: 'en',
    changeLanguage: vi.fn(),
  }
  return { default: instance }
})

// Mock react-i18next — resolves keys against actual locale JSON files
vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string | string[]) => {
    const defaultNs = Array.isArray(ns) ? (ns[0] ?? 'common') : (ns ?? 'common')
    return {
      t: (key: string, options?: Record<string, unknown>) =>
        resolveTranslation(key, defaultNs, options),
      i18n: {
        changeLanguage: vi.fn(),
        language: 'en',
        ready: true,
      },
      ready: true,
    }
  },
  Trans: ({ children, i18nKey }: { children?: unknown; i18nKey?: string }) =>
    i18nKey ?? children,
  initReactI18next: {
    type: '3rdParty' as const,
    init: vi.fn(),
  },
}))
