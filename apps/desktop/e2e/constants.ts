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
  CRON_EXECUTION: 90_000,
  SSE_CHAT: 60_000,
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

  // Tasks
  TASK_LIST_PAGE: '[data-testid="task-list-page"]',
  TASK_LIST_HEADER: '[data-testid="task-list-header"]',
  TASK_EMPTY_STATE: '[data-testid="task-empty-state"]',
  TASK_SUMMARY_BTN: '[data-testid="task-summary-btn"]',
  TASK_POPOVER: '[data-testid="task-popover"]',

  // Memory
  MEMORY_PAGE: '[data-testid="memory-page"]',
  MEMORY_ADD_BTN: '[data-testid="memory-add-btn"]',
  MEMORY_CARD: '[data-testid="memory-card"]',
  MEMORY_SEARCH: '[data-testid="memory-search"]',

  // Skills
  SKILLS_PAGE: '[data-testid="skills-page"]',
  SKILL_NEW_BTN: '[data-testid="skill-new-btn"]',
  SKILL_CARD: '[data-testid="skill-card"]',
  SKILL_TAB_INSTALLED: '[data-testid="skill-tab-installed"]',
  SKILL_TAB_MARKETPLACE: '[data-testid="skill-tab-marketplace"]',

  // MCP
  MCP_PAGE: '[data-testid="mcp-page"]',
  MCP_NEW_BTN: '[data-testid="mcp-new-btn"]',
  MCP_CARD: '[data-testid="mcp-card"]',
  MCP_TRANSPORT_STDIO: '[data-testid="mcp-transport-stdio"]',
  MCP_TRANSPORT_SSE: '[data-testid="mcp-transport-sse"]',
  MCP_TRANSPORT_HTTP: '[data-testid="mcp-transport-http"]',

  // Cron
  CRON_PAGE: '[data-testid="cron-page"]',
  CRON_NEW_BTN: '[data-testid="cron-new-btn"]',
  CRON_CARD: '[data-testid="cron-card"]',
  CRON_TOGGLE: '[data-testid="cron-toggle"]',
  CRON_TRIGGER_BTN: '[data-testid="cron-trigger-btn"]',
  CRON_HISTORY_BTN: '[data-testid="cron-history-btn"]',

  // Workspace
  WORKSPACE_PAGE: '[data-testid="workspace-page"]',
  WORKSPACE_REFRESH_BTN: '[data-testid="workspace-refresh-btn"]',
  WORKSPACE_FILE_TREE: '[data-testid="workspace-file-tree"]',
  WORKSPACE_PREVIEW: '[data-testid="workspace-preview"]',

  // Topology
  TOPOLOGY_CANVAS: '[data-testid="topology-canvas"]',
  TOPOLOGY_NODE: '[data-testid="topology-node"]',

  // Common
  SAVE_BTN: '[data-testid="save-btn"]',
  DELETE_BTN: '[data-testid="delete-btn"]',
  EDIT_BTN: '[data-testid="edit-btn"]',
  MODAL_SAVE_BTN: '[data-testid="modal-save-btn"]',
  MODAL_CANCEL_BTN: '[data-testid="modal-cancel-btn"]',

  // Navigation
  NAV_LINK: (name: string) => `[data-testid="nav-${name}"]`,

  // Project Settings
  PROJECT_SETTINGS_TAB: (name: string) => `[data-testid="project-settings-tab-${name}"]`,
} as const
