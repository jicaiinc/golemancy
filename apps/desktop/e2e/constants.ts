import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const ROOT_DIR = path.resolve(__dirname, '../../..')
export const DESKTOP_DIR = path.resolve(ROOT_DIR, 'apps/desktop')
// Point to the desktop directory (not the compiled JS) so Electron reads package.json.
// This ensures app.getAppPath() returns apps/desktop/ — needed for correct server path resolution.
export const MAIN_ENTRY = DESKTOP_DIR

export const TIMEOUTS = {
  APP_LAUNCH: 30_000,
  APP_READY: 15_000,
  PAGE_LOAD: 10_000,
  AI_RESPONSE: 60_000,
  TOOL_EXECUTION: 30_000,
} as const

export const SELECTORS = {
  // Layout
  APP_SHELL: '[data-testid="app-shell"]',
  SIDEBAR: '[data-testid="sidebar"]',
  TOP_BAR: '[data-testid="top-bar"]',

  // Project
  CREATE_PROJECT_BTN: '[data-testid="create-project-btn"]',
  PROJECT_NAME_INPUT: '[data-testid="project-name-input"]',
  PROJECT_DESC_INPUT: '[data-testid="project-desc-input"]',
  CONFIRM_BTN: '[data-testid="confirm-btn"]',
  CANCEL_BTN: '[data-testid="cancel-btn"]',

  // Agent
  CREATE_AGENT_BTN: '[data-testid="create-agent-btn"]',
  AGENT_NAME_INPUT: '[data-testid="agent-name-input"]',
  AGENT_PROMPT_INPUT: '[data-testid="agent-prompt-input"]',

  // Chat
  CHAT_INPUT: '[data-testid="chat-input"]',
  CHAT_SEND_BTN: '[data-testid="chat-send-btn"]',
  CHAT_MESSAGE: '[data-testid="chat-message"]',
  CHAT_WINDOW: '[data-testid="chat-window"]',

  // Navigation
  NAV_LINK: (name: string) => `[data-testid="nav-${name}"]`,
} as const
