import fs from 'fs'
import path from 'path'
import type { Page } from '@playwright/test'
import { SELECTORS, TIMEOUTS } from '../constants'
import { StoreBridge } from './store-bridge'
import { ConsoleLogger } from './console-logger'

export interface SSEEvent {
  type: string
  data: any
}

/**
 * Unified testing API that combines StoreBridge, ConsoleLogger, and DOM operations.
 */
export class TestHelper {
  readonly store: StoreBridge
  readonly console: ConsoleLogger
  private serverInfoCache: { baseUrl: string; token: string } | null = null

  constructor(private page: Page, logger: ConsoleLogger) {
    this.store = new StoreBridge(page)
    this.console = logger
    this.console.clear()
  }

  // ===== Server API =====

  /** Get server base URL and auth token from the Electron preload bridge */
  async getServerInfo(): Promise<{ baseUrl: string; token: string }> {
    if (this.serverInfoCache) return this.serverInfoCache

    const info = await this.page.evaluate(() => {
      const api = (window as any).electronAPI
      if (!api) throw new Error('electronAPI not available — not running in Electron?')
      const baseUrl = api.getServerBaseUrl()
      const token = api.getServerToken()
      if (!baseUrl || !token) throw new Error('Server not ready: missing baseUrl or token')
      return { baseUrl: baseUrl as string, token: token as string }
    })

    this.serverInfoCache = info
    return info
  }

  /** Send an authenticated GET request to the server API and return parsed JSON */
  async apiGet(path: string): Promise<any> {
    const { baseUrl, token } = await this.getServerInfo()
    const response = await this.page.request.get(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return response.json()
  }

  /** Send an authenticated POST request */
  async apiPost(path: string, body: Record<string, unknown>): Promise<any> {
    const { baseUrl, token } = await this.getServerInfo()
    const response = await this.page.request.post(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: body,
    })
    return response.json()
  }

  /** Send an authenticated PATCH request */
  async apiPatch(path: string, body: Record<string, unknown>): Promise<any> {
    const { baseUrl, token } = await this.getServerInfo()
    const response = await this.page.request.patch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: body,
    })
    return response.json()
  }

  /** Send an authenticated DELETE request */
  async apiDelete(path: string): Promise<any> {
    const { baseUrl, token } = await this.getServerInfo()
    const response = await this.page.request.delete(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return response.json()
  }

  /** Send an authenticated PUT request */
  async apiPut(path: string, body: Record<string, unknown>): Promise<any> {
    const { baseUrl, token } = await this.getServerInfo()
    const response = await this.page.request.put(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: body,
    })
    return response.json()
  }

  // ===== Raw response methods =====

  /** Send an authenticated GET and return raw response (for status code checks) */
  async apiGetRaw(path: string) {
    const { baseUrl, token } = await this.getServerInfo()
    return this.page.request.get(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  }

  /** Send an authenticated POST and return raw response */
  async apiPostRaw(path: string, body: Record<string, unknown>) {
    const { baseUrl, token } = await this.getServerInfo()
    return this.page.request.post(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: body,
    })
  }

  /** Send an authenticated PATCH and return raw response */
  async apiPatchRaw(path: string, body: Record<string, unknown>) {
    const { baseUrl, token } = await this.getServerInfo()
    return this.page.request.patch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: body,
    })
  }

  /** Send an authenticated DELETE and return raw response */
  async apiDeleteRaw(path: string) {
    const { baseUrl, token } = await this.getServerInfo()
    return this.page.request.delete(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  }

  /** Send an authenticated PUT and return raw response */
  async apiPutRaw(path: string, body: Record<string, unknown>) {
    const { baseUrl, token } = await this.getServerInfo()
    return this.page.request.put(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: body,
    })
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

  // ===== API-level setup (bypass UI for speed) =====

  /** Create a project via the API (faster than UI) */
  async createProjectViaApi(name: string, description = ''): Promise<{ id: string; [key: string]: any }> {
    const project = await this.apiPost('/api/projects', { name, description })
    return project
  }

  /** Create an agent via the API */
  async createAgentViaApi(
    projectId: string,
    name: string,
    opts: { systemPrompt?: string; model?: { provider: string; model: string }; tools?: Record<string, unknown> } = {},
  ): Promise<{ id: string; [key: string]: any }> {
    const agent = await this.apiPost(`/api/projects/${projectId}/agents`, { name, ...opts })
    return agent
  }

  /** Create a conversation via the API */
  async createConversationViaApi(
    projectId: string,
    agentId: string,
    title = 'Test Conversation',
  ): Promise<{ id: string; [key: string]: any }> {
    return this.apiPost(`/api/projects/${projectId}/conversations`, { agentId, title })
  }

  /** Save a message to a conversation via the API */
  async saveMessageViaApi(
    projectId: string,
    conversationId: string,
    message: {
      id?: string
      role: 'user' | 'assistant'
      content: string
      parts?: unknown[]
      inputTokens?: number
      outputTokens?: number
    },
  ): Promise<void> {
    const id = message.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await this.apiPost(`/api/projects/${projectId}/conversations/${conversationId}/messages`, {
      id,
      role: message.role,
      content: message.content,
      parts: message.parts || [{ type: 'text', text: message.content }],
      ...(message.inputTokens !== undefined && { inputTokens: message.inputTokens }),
      ...(message.outputTokens !== undefined && { outputTokens: message.outputTokens }),
    })
  }

  /** Send a chat message via the SSE streaming API and return complete response + all SSE events */
  async sendChatViaApi(
    projectId: string,
    agentId: string,
    conversationId: string,
    message: string,
    timeout = TIMEOUTS.AI_RESPONSE,
  ): Promise<{ response: string; usage: { inputTokens: number; outputTokens: number }; events: SSEEvent[] }> {
    const { baseUrl, token } = await this.getServerInfo()

    const result = await this.page.evaluate(
      async ({ baseUrl, token, projectId, agentId, conversationId, message, timeout }) => {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        try {
          const res = await fetch(`${baseUrl}/api/projects/${projectId}/chat`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ agentId, conversationId, message }),
            signal: controller.signal,
          })

          if (!res.ok) throw new Error(`Chat API returned ${res.status}`)
          if (!res.body) throw new Error('No response body')

          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let fullText = ''
          let usage = { inputTokens: 0, outputTokens: 0 }
          const events: { type: string; data: any }[] = []

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split('\n')

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue

              try {
                const parsed = JSON.parse(data)
                events.push({ type: parsed.type ?? 'unknown', data: parsed })
                if (parsed.type === 'text-delta' && parsed.textDelta) {
                  fullText += parsed.textDelta
                }
                if (parsed.type === 'usage' || parsed.type === 'finish') {
                  if (parsed.usage) {
                    usage.inputTokens = parsed.usage.promptTokens || parsed.usage.inputTokens || 0
                    usage.outputTokens = parsed.usage.completionTokens || parsed.usage.outputTokens || 0
                  }
                }
              } catch {
                // skip unparseable lines
              }
            }
          }

          return { response: fullText, usage, events }
        } finally {
          clearTimeout(timeoutId)
        }
      },
      { baseUrl, token, projectId, agentId, conversationId, message, timeout },
    )

    return result
  }

  // ===== Team API helpers =====

  /** Create a team via the API */
  async createTeamViaApi(
    projectId: string,
    name: string,
    members: Array<{ agentId: string; parentAgentId?: string }> = [],
  ): Promise<{ id: string; [key: string]: any }> {
    return this.apiPost(`/api/projects/${projectId}/teams`, { name, description: '', members })
  }

  // ===== Memory API helpers =====

  /** Create a memory entry for an agent via the API */
  async createMemoryViaApi(
    projectId: string,
    agentId: string,
    content: string,
    opts: { pinned?: boolean; priority?: number; tags?: string[] } = {},
  ): Promise<{ id: string; [key: string]: any }> {
    return this.apiPost(`/api/projects/${projectId}/agents/${agentId}/memories`, { content, ...opts })
  }

  // ===== Agent config helpers =====

  /** Assign a skill to an agent by patching skillIds */
  async assignSkillToAgent(projectId: string, agentId: string, skillId: string): Promise<void> {
    const agent = await this.apiGet(`/api/projects/${projectId}/agents/${agentId}`)
    const currentSkills: string[] = agent.skillIds ?? []
    if (!currentSkills.includes(skillId)) {
      await this.apiPatch(`/api/projects/${projectId}/agents/${agentId}`, {
        skillIds: [...currentSkills, skillId],
      })
    }
  }

  /** Assign an MCP server to an agent by patching mcpServers */
  async assignMcpToAgent(projectId: string, agentId: string, mcpName: string): Promise<void> {
    const agent = await this.apiGet(`/api/projects/${projectId}/agents/${agentId}`)
    const currentMcp: string[] = agent.mcpServers ?? []
    if (!currentMcp.includes(mcpName)) {
      await this.apiPatch(`/api/projects/${projectId}/agents/${agentId}`, {
        mcpServers: [...currentMcp, mcpName],
      })
    }
  }

  // ===== Team Chat =====

  /** Send a team chat message via SSE and return complete response + events */
  async createTeamChatViaApi(
    projectId: string,
    teamId: string,
    message: string,
    timeout = TIMEOUTS.SSE_CHAT,
  ): Promise<{ response: string; usage: { inputTokens: number; outputTokens: number }; events: SSEEvent[] }> {
    // Create a conversation for the team first
    const conv = await this.apiPost(`/api/projects/${projectId}/conversations`, {
      targetType: 'team',
      targetId: teamId,
      title: 'Team Chat Test',
    })

    const { baseUrl, token } = await this.getServerInfo()

    const result = await this.page.evaluate(
      async ({ baseUrl, token, projectId, teamId, conversationId, message, timeout }) => {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        try {
          const res = await fetch(`${baseUrl}/api/projects/${projectId}/chat`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              targetType: 'team',
              targetId: teamId,
              conversationId,
              messages: [{ id: `msg-${Date.now()}`, role: 'user', parts: [{ type: 'text', text: message }] }],
            }),
            signal: controller.signal,
          })

          if (!res.ok) throw new Error(`Chat API returned ${res.status}`)
          if (!res.body) throw new Error('No response body')

          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let fullText = ''
          let usage = { inputTokens: 0, outputTokens: 0 }
          const events: { type: string; data: any }[] = []

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split('\n')

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue

              try {
                const parsed = JSON.parse(data)
                events.push({ type: parsed.type ?? 'unknown', data: parsed })
                if (parsed.type === 'text-delta' && parsed.textDelta) {
                  fullText += parsed.textDelta
                }
                if (parsed.type === 'usage' || parsed.type === 'finish') {
                  if (parsed.usage) {
                    usage.inputTokens = parsed.usage.promptTokens || parsed.usage.inputTokens || 0
                    usage.outputTokens = parsed.usage.completionTokens || parsed.usage.outputTokens || 0
                  }
                }
              } catch {
                // skip unparseable lines
              }
            }
          }

          return { response: fullText, usage, events }
        } finally {
          clearTimeout(timeoutId)
        }
      },
      { baseUrl, token, projectId, teamId, conversationId: conv.id, message, timeout },
    )

    return result
  }

  // ===== Project config =====

  /** Set the project's default target (agent or team) */
  async setProjectDefaultTarget(
    projectId: string,
    targetType: 'agent' | 'team',
    targetId: string,
  ): Promise<void> {
    await this.apiPatch(`/api/projects/${projectId}`, {
      defaultTargetType: targetType,
      defaultTargetId: targetId,
    })
  }

  // ===== Workspace file seeding =====

  /** Write a file directly into a project's workspace directory (via Node.js fs) */
  seedWorkspaceFile(projectId: string, relativePath: string, content: string): void {
    const dataDir = process.env.GOLEMANCY_TEST_DATA_DIR
    if (!dataDir) throw new Error('GOLEMANCY_TEST_DATA_DIR not set')
    const filePath = path.join(dataDir, 'projects', projectId, 'workspace', relativePath)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
  }

  // ===== Model tier helpers =====

  /** Create an agent using the global default model (Tier A — cheapest) */
  async createCheapAgent(
    projectId: string,
    name: string,
    opts: { systemPrompt?: string; builtinTools?: Record<string, unknown>; compactThreshold?: number } = {},
  ): Promise<{ id: string; [key: string]: any }> {
    // Tier A uses global defaultModel (set in globalSetup — gemini-2.5-flash or claude-sonnet-4-5)
    return this.createAgentViaApi(projectId, name, { ...opts })
  }

  /** Create an agent using a smarter model (Tier B) */
  async createSmartAgent(
    projectId: string,
    name: string,
    opts: { systemPrompt?: string; builtinTools?: Record<string, unknown>; compactThreshold?: number } = {},
  ): Promise<{ id: string; [key: string]: any }> {
    const hasGoogleKey = !!process.env.TEST_GOOGLE_API_KEY
    const model = hasGoogleKey
      ? { provider: 'google', model: 'gemini-2.5-pro' }
      : { provider: 'anthropic', model: 'claude-sonnet-4-6' }
    return this.createAgentViaApi(projectId, name, { ...opts, model })
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
