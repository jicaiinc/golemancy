import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const ROOT_DIR = path.resolve(__dirname, '../../..')
export const DESKTOP_DIR = path.resolve(ROOT_DIR, 'apps/desktop')
// Point to the desktop directory (not the compiled JS) so Electron reads package.json.
// This ensures app.getAppPath() returns apps/desktop/ — needed for correct server path resolution.
export const MAIN_ENTRY = DESKTOP_DIR

const TIMEOUT_MULTIPLIER = process.platform === 'win32' ? 2 : 1

export const TIMEOUTS = {
  APP_LAUNCH: 30_000 * TIMEOUT_MULTIPLIER,
  APP_READY: 15_000 * TIMEOUT_MULTIPLIER,
  PAGE_LOAD: 10_000 * TIMEOUT_MULTIPLIER,
  AI_RESPONSE: 60_000 * TIMEOUT_MULTIPLIER,
  TOOL_EXECUTION: 30_000 * TIMEOUT_MULTIPLIER,
  CRON_EXECUTION: 90_000 * TIMEOUT_MULTIPLIER,
  SSE_CHAT: 60_000 * TIMEOUT_MULTIPLIER,
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

  // Chat (AI response elements)
  TOOL_CALL: '[data-testid="tool-call"]',
  TOOL_CALL_BY_NAME: (name: string) => `[data-testid="tool-call"][data-tool-name="${name}"]`,
  SUB_AGENT_DISPLAY: '[data-testid="sub-agent-display"]',
  SUB_AGENT_BY_NAME: (name: string) => `[data-testid="sub-agent-display"][data-agent-name="${name}"]`,
  COMPACT_BOUNDARY: '[data-testid="compact-boundary"]',
  CHAT_THINKING: '[data-testid="chat-thinking"]',
  CHAT_COMPACTING: '[data-testid="chat-compacting"]',
  CHAT_EMPTY_PROMPT: '[data-testid="chat-empty-prompt"]',
  CHAT_EMPTY_STATE_PAGE: '[data-testid="chat-empty-state"]',

  // Chat (StatusBar)
  CHAT_STOP_BTN: '[data-testid="chat-stop-btn"]',
  CONTEXT_WINDOW_BTN: '[data-testid="context-window-btn"]',
  CONTEXT_POPOVER: '[data-testid="context-popover"]',

  // Team
  TEAM_LIST_PAGE: '[data-testid="team-list-page"]',
  CREATE_TEAM_BTN: '[data-testid="create-team-btn"]',
  TEAM_EMPTY_STATE: '[data-testid="team-empty-state"]',
  TEAM_CARD: (teamId: string) => `[data-testid="team-card-${teamId}"]`,
  TEAM_CLONE_BTN: (teamId: string) => `[data-testid="team-clone-btn-${teamId}"]`,
  TEAM_DETAIL_PAGE: '[data-testid="team-detail-page"]',
  TEAM_NAME_INPUT: '[data-testid="team-name-input"]',
  TEAM_DESC_INPUT: '[data-testid="team-desc-input"]',
  TEAM_CREATE_BTN: '[data-testid="team-create-btn"]',
  TEAM_CANCEL_BTN: '[data-testid="team-cancel-btn"]',

  // Memory
  MEMORY_ADD_BTN: '[data-testid="memory-add-btn"]',
  MEMORY_ADD_FORM: '[data-testid="memory-add-form"]',
  MEMORY_CONTENT_INPUT: '[data-testid="memory-content-input"]',
  MEMORY_TAGS_INPUT: '[data-testid="memory-tags-input"]',
  MEMORY_PINNED_CHECKBOX: '[data-testid="memory-pinned-checkbox"]',
  MEMORY_SAVE_BTN: '[data-testid="memory-save-btn"]',
  MEMORY_CANCEL_BTN: '[data-testid="memory-cancel-btn"]',
  MEMORY_EMPTY_STATE: '[data-testid="memory-empty-state"]',
  MEMORY_CARD: (memoryId: string) => `[data-testid="memory-card-${memoryId}"]`,
  MEMORY_PIN_BTN: (memoryId: string) => `[data-testid="memory-pin-btn-${memoryId}"]`,
  MEMORY_EDIT_BTN: (memoryId: string) => `[data-testid="memory-edit-btn-${memoryId}"]`,
  MEMORY_DELETE_BTN: (memoryId: string) => `[data-testid="memory-delete-btn-${memoryId}"]`,

  // Agent (extended)
  AGENT_TABS: '[data-testid="agent-tabs"]',
  AGENT_CLONE_BTN: (agentId: string) => `[data-testid="agent-clone-btn-${agentId}"]`,
  SKILL_ASSIGNED: (skillId: string) => `[data-testid="skill-assigned-${skillId}"]`,
  SKILL_ASSIGN_BTN: (skillId: string) => `[data-testid="skill-assign-btn-${skillId}"]`,
  SKILL_REMOVE_BTN: (skillId: string) => `[data-testid="skill-remove-btn-${skillId}"]`,
  MCP_ASSIGNED: (mcpName: string) => `[data-testid="mcp-assigned-${mcpName}"]`,
  MCP_ASSIGN_BTN: (mcpName: string) => `[data-testid="mcp-assign-btn-${mcpName}"]`,
  MCP_REMOVE_BTN: (mcpName: string) => `[data-testid="mcp-remove-btn-${mcpName}"]`,
  TOOL_TOGGLE: (toolId: string) => `[data-testid="tool-toggle-${toolId}"]`,

  // Project (extended)
  PROJECT_CLONE_BTN: (projectId: string) => `[data-testid="project-clone-btn-${projectId}"]`,

  // Onboarding
  ONBOARDING_PAGE: '[data-testid="onboarding-page"]',
  ONBOARDING_PROGRESS: '[data-testid="onboarding-progress"]',
  ONBOARDING_SKIP_BTN: '[data-testid="onboarding-skip-btn"]',
  ONBOARDING_BACK_BTN: '[data-testid="onboarding-back-btn"]',
  ONBOARDING_NEXT_BTN: '[data-testid="onboarding-next-btn"]',
  ONBOARDING_GET_STARTED_BTN: '[data-testid="onboarding-get-started-btn"]',
  ONBOARDING_WELCOME_STEP: '[data-testid="onboarding-welcome-step"]',
  ONBOARDING_PROVIDER_STEP: '[data-testid="onboarding-provider-step"]',
  ONBOARDING_SPEECH_STEP: '[data-testid="onboarding-speech-step"]',
  ONBOARDING_PROJECT_STEP: '[data-testid="onboarding-project-step"]',
  ONBOARDING_COMPLETE_STEP: '[data-testid="onboarding-complete-step"]',
  ONBOARDING_API_KEY_INPUT: '[data-testid="onboarding-api-key-input"]',
  ONBOARDING_TEST_PROVIDER_BTN: '[data-testid="onboarding-test-provider-btn"]',
  ONBOARDING_PROJECT_NAME_INPUT: '[data-testid="onboarding-project-name-input"]',
  ONBOARDING_START_CHATTING_BTN: '[data-testid="onboarding-start-chatting-btn"]',
  ONBOARDING_GO_DASHBOARD_BTN: '[data-testid="onboarding-go-dashboard-btn"]',

  // Permissions
  PERMISSIONS_SETTINGS: '[data-testid="permissions-settings"]',
  PERMISSION_MODE_SELECTOR: '[data-testid="permission-mode-selector"]',
  NETWORK_RESTRICTIONS_TOGGLE: '[data-testid="network-restrictions-toggle"]',
  APPLY_TO_MCP_TOGGLE: '[data-testid="apply-to-mcp-toggle"]',

  // Speech (Settings)
  SPEECH_TAB: '[data-testid="speech-tab"]',
  SPEECH_ENABLE_TOGGLE: '[data-testid="speech-enable-toggle"]',
  SPEECH_TEST_BTN: '[data-testid="speech-test-btn"]',

  // Template
  TEMPLATE_SELECTOR: '[data-testid="template-selector"]',
  TEMPLATE_BLANK_BTN: '[data-testid="template-blank-btn"]',
  TEMPLATE_FROM_TEMPLATE_BTN: '[data-testid="template-from-template-btn"]',
  TEMPLATE_CATEGORY_ALL: '[data-testid="template-category-all"]',
  TEMPLATE_CATEGORY: (cat: string) => `[data-testid="template-category-${cat}"]`,
  TEMPLATE_ITEM: (templateId: string) => `[data-testid="template-item-${templateId}"]`,
  TEMPLATE_DETAIL_PANEL: '[data-testid="template-detail-panel"]',

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
