import type { Page } from '@playwright/test'
import { SELECTORS, TIMEOUTS } from '../constants'
import { StoreBridge } from './store-bridge'
import { ConsoleLogger } from './console-logger'

/**
 * Unified testing API that combines StoreBridge, ConsoleLogger, and DOM operations.
 */
export class TestHelper {
  readonly store: StoreBridge
  readonly console: ConsoleLogger

  constructor(private page: Page, logger: ConsoleLogger) {
    this.store = new StoreBridge(page)
    this.console = logger
    this.console.clear()
  }

  // ===== Navigation =====

  /** Navigate to a hash route */
  async navigateTo(route: string): Promise<void> {
    // HashRouter uses #/ prefix
    const currentUrl = this.page.url()
    const base = currentUrl.split('#')[0]
    await this.page.goto(`${base}#${route}`)
    // Wait for React to render the new route's content
    await this.page.waitForFunction(
      () => document.querySelector('#root')?.children.length ?? 0 > 0,
      { timeout: TIMEOUTS.PAGE_LOAD },
    )
  }

  /** Go to the project list (home) */
  async goHome(): Promise<void> {
    await this.navigateTo('/')
  }

  /** Navigate to a specific project */
  async goToProject(projectId: string): Promise<void> {
    await this.navigateTo(`/projects/${projectId}`)
  }

  // ===== Project operations =====

  /** Create a project via the UI and return its ID from the store */
  async createProject(name: string, description = ''): Promise<string> {
    // Click "New Project" button
    await this.page.click(SELECTORS.CREATE_PROJECT_BTN)

    // Fill in the form
    await this.page.fill(SELECTORS.PROJECT_NAME_INPUT, name)
    if (description) {
      await this.page.fill(SELECTORS.PROJECT_DESC_INPUT, description)
    }

    // Submit
    await this.page.click(SELECTORS.CONFIRM_BTN)

    // After creation, the modal navigates to /projects/:id which triggers
    // ProjectLayout → selectProject → sets currentProjectId.
    // Wait for the sidebar to appear (confirms we're inside a project route).
    await this.page.waitForSelector(SELECTORS.SIDEBAR, {
      state: 'visible',
      timeout: TIMEOUTS.PAGE_LOAD,
    })

    // Wait for the store to have currentProjectId set
    await this.store.waitFor('state.currentProjectId !== null', TIMEOUTS.PAGE_LOAD)

    const projectId = await this.store.get<string>('currentProjectId')
    if (!projectId) throw new Error('Project creation failed: no currentProjectId in store')
    return projectId
  }

  // ===== Agent operations =====

  /** Create an agent via the UI and return its ID from the store */
  async createAgent(name: string, systemPrompt = ''): Promise<string> {
    // Capture current agent count before creating
    const initialAgents = await this.store.get<Array<{ id: string }>>('agents')
    const initialCount = initialAgents?.length ?? 0

    await this.page.click(SELECTORS.CREATE_AGENT_BTN)

    await this.page.fill(SELECTORS.AGENT_NAME_INPUT, name)
    if (systemPrompt) {
      await this.page.fill(SELECTORS.AGENT_PROMPT_INPUT, systemPrompt)
    }

    await this.page.click(SELECTORS.CONFIRM_BTN)

    // Wait for a NEW agent to appear in store (count increases)
    await this.store.waitFor(`state.agents.length > ${initialCount}`, TIMEOUTS.PAGE_LOAD)

    // Return the ID of the most recently added agent
    const agents = await this.store.get<Array<{ id: string }>>('agents')
    return agents[agents.length - 1].id
  }

  // ===== Chat operations =====

  /** Type and send a chat message */
  async sendChatMessage(message: string): Promise<void> {
    await this.page.fill(SELECTORS.CHAT_INPUT, message)
    await this.page.click(SELECTORS.CHAT_SEND_BTN)
  }

  /** Wait for an assistant response to appear and streaming to complete */
  async waitForResponse(timeout = TIMEOUTS.AI_RESPONSE): Promise<string> {
    // Wait for assistant message to appear
    const assistantMsg = this.page
      .locator(`${SELECTORS.CHAT_MESSAGE}[data-role="assistant"]`)
      .last()
    await assistantMsg.waitFor({ state: 'visible', timeout })

    // Wait for streaming to complete (input re-enabled = not disabled)
    await this.page.waitForFunction(
      (selector: string) => {
        const input = document.querySelector(selector) as HTMLTextAreaElement | null
        return input !== null && !input.disabled
      },
      SELECTORS.CHAT_INPUT,
      { timeout },
    )

    // Return the final complete text
    return assistantMsg.innerText()
  }

  /** Start a chat by clicking an agent card in the empty state */
  async startChatWithAgent(agentName: string): Promise<void> {
    await this.page.getByText(agentName).click()
    await this.page.waitForSelector(SELECTORS.CHAT_WINDOW, {
      state: 'visible',
      timeout: TIMEOUTS.PAGE_LOAD,
    })
  }

  // ===== Assertions =====

  /** Assert no console errors were logged */
  hasNoErrors(): boolean {
    const errors = this.console.getErrors()
    return errors.length === 0
  }

  /** Get all console errors (useful for test failure diagnostics) */
  getErrors() {
    return this.console.getErrors()
  }

  // ===== Sidebar navigation =====

  /** Click a sidebar nav item by name (e.g., 'agents', 'chat', 'tasks') */
  async clickNav(name: string): Promise<void> {
    await this.page.click(SELECTORS.NAV_LINK(name))
    // Wait for navigation to complete — URL hash should update
    await this.page.waitForFunction(
      (n: string) => window.location.hash.includes(n),
      name === 'dashboard' ? 'projects/' : name,
      { timeout: TIMEOUTS.PAGE_LOAD },
    )
  }
}
