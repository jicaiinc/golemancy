import fs from 'fs'
import path from 'path'
import type { Page } from '@playwright/test'
import { SELECTORS, TIMEOUTS } from '../constants'
import { StoreBridge } from './store-bridge'
import { ConsoleLogger } from './console-logger'
import type { PermissionsConfigFile } from '@golemancy/shared'

export interface SSEEvent {
  type: string
  data: any
}

interface ChatStreamResult {
  response: string
  usage: { inputTokens: number; outputTokens: number }
  events: SSEEvent[]
}

interface SSEAccumulator extends ChatStreamResult {
  buffer: string
  eventDataLines: string[]
}

/**
 * Unified testing API that combines StoreBridge, ConsoleLogger, and DOM operations.
 */
export class TestHelper {
  readonly store: StoreBridge
  readonly console: ConsoleLogger
  private serverInfoCache: { baseUrl: string; token: string } | null = null
  private defaultModelCache: { provider: string; model: string } | null = null
  private readonly backgroundChatPromises = new Map<string, Promise<ChatStreamResult>>()

  constructor(private page: Page, logger: ConsoleLogger) {
    this.store = new StoreBridge(page)
    this.console = logger
    this.console.clear()
  }

  private extractAssistantTextFromMessages(messagesResponse: any): string {
    const lastAssistant = [...(messagesResponse.items ?? [])].reverse().find((msg: any) => msg.role === 'assistant')
    if (!lastAssistant) return ''
    if (typeof lastAssistant.content === 'string') return lastAssistant.content
    if (!Array.isArray(lastAssistant.parts)) return ''
    return lastAssistant.parts
      .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
      .map((part: any) => part.text)
      .join('\n')
  }

  private createSSEAccumulator(): SSEAccumulator {
    return {
      response: '',
      usage: { inputTokens: 0, outputTokens: 0 },
      events: [],
      buffer: '',
      eventDataLines: [],
    }
  }

  private processSSEEventData(rawData: string, acc: SSEAccumulator): void {
    const data = rawData.trim()
    if (!data || data === '[DONE]') return

    try {
      const parsed = JSON.parse(data)
      acc.events.push({ type: parsed.type ?? 'unknown', data: parsed })
      if (parsed.type === 'text-delta') {
        const delta = parsed.delta ?? parsed.textDelta ?? parsed.text
        if (typeof delta === 'string') {
          acc.response += delta
        }
      }
      if (parsed.type === 'usage' || parsed.type === 'finish' || parsed.type === 'data-usage') {
        const usageData = parsed.usage ?? parsed.data
        if (usageData) {
          acc.usage.inputTokens = usageData.promptTokens || usageData.inputTokens || 0
          acc.usage.outputTokens = usageData.completionTokens || usageData.outputTokens || 0
        }
      }
    } catch {
      // ignore malformed event data in tests
    }
  }

  private pushSSELine(line: string, acc: SSEAccumulator): void {
    if (line === '') {
      if (acc.eventDataLines.length > 0) {
        this.processSSEEventData(acc.eventDataLines.join('\n'), acc)
        acc.eventDataLines.length = 0
      }
      return
    }

    if (line.startsWith('data:')) {
      acc.eventDataLines.push(line.slice(5).trimStart())
    }
  }

  private appendSSEText(rawText: string, acc: SSEAccumulator): void {
    acc.buffer += rawText
    const lines = acc.buffer.split('\n')
    acc.buffer = lines.pop() ?? ''

    for (const rawLine of lines) {
      this.pushSSELine(rawLine.replace(/\r$/, ''), acc)
    }
  }

  private finalizeSSEAccumulator(acc: SSEAccumulator): ChatStreamResult {
    if (acc.buffer) {
      const trailingLines = acc.buffer.split('\n')
      acc.buffer = ''
      for (const rawLine of trailingLines) {
        this.pushSSELine(rawLine.replace(/\r$/, ''), acc)
      }
    }

    if (acc.eventDataLines.length > 0) {
      this.processSSEEventData(acc.eventDataLines.join('\n'), acc)
      acc.eventDataLines.length = 0
    }

    return {
      response: acc.response,
      usage: acc.usage,
      events: acc.events,
    }
  }

  private parseSSEPayload(rawText: string): ChatStreamResult {
    const acc = this.createSSEAccumulator()
    this.appendSSEText(rawText, acc)
    return this.finalizeSSEAccumulator(acc)
  }

  private buildChatRequest(
    projectId: string,
    targetType: 'agent' | 'team',
    targetId: string,
    conversationId: string,
    message: string,
  ): Record<string, unknown> {
    return {
      projectId,
      targetType,
      targetId,
      conversationId,
      messages: [{
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'user',
        parts: [{ type: 'text', text: message }],
      }],
    }
  }

  private async postChatStream(body: Record<string, unknown>, timeout: number): Promise<ChatStreamResult> {
    const { baseUrl, token } = await this.getServerInfo()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new Error(`Chat API returned ${response.status}${errorText ? `: ${errorText}` : ''}`)
      }
      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const acc = this.createSSEAccumulator()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        this.appendSSEText(decoder.decode(value, { stream: true }), acc)
      }

      this.appendSSEText(decoder.decode(), acc)
      return this.finalizeSSEAccumulator(acc)
    } finally {
      clearTimeout(timeoutId)
    }
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

  /** Send an authenticated multipart POST and return raw response */
  async apiPostMultipartRaw(
    path: string,
    multipart: Record<string, unknown>,
  ) {
    const { baseUrl, token } = await this.getServerInfo()
    return this.page.request.post(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart,
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
    const sel = {
      assistant: `${SELECTORS.CHAT_MESSAGE}[data-role="assistant"]`,
      input: SELECTORS.CHAT_INPUT,
      toolCall: SELECTORS.TOOL_CALL,
    }

    // Step 1: Wait for assistant message to appear
    const assistantMsg = this.page.locator(sel.assistant).last()
    await assistantMsg.waitFor({ state: 'visible', timeout })

    // Step 2: Wait for streaming to complete
    // First ensure input IS disabled (streaming started), then wait for re-enable
    await this.page.waitForFunction(
      (inputSel: string) => {
        const input = document.querySelector(inputSel) as HTMLTextAreaElement | null
        return input !== null && input.disabled
      },
      sel.input,
      { timeout: 5000 },
    ).catch(() => { /* input may never disable for instant responses */ })

    await this.page.waitForFunction(
      (inputSel: string) => {
        const input = document.querySelector(inputSel) as HTMLTextAreaElement | null
        return input !== null && !input.disabled
      },
      sel.input,
      { timeout },
    )

    // Step 3: Wait for actual content to render (text or tool-call elements)
    // Tool calls may render asynchronously after the stream completes
    await this.page.waitForFunction(
      (args: { msgSel: string; toolSel: string }) => {
        const msgs = document.querySelectorAll(args.msgSel)
        if (msgs.length === 0) return false
        for (const msg of Array.from(msgs)) {
          const el = msg as HTMLElement
          if (el.innerText.trim().length > 0) return true
          if (el.querySelector(args.toolSel)) return true
        }
        return false
      },
      { msgSel: sel.assistant, toolSel: sel.toolCall },
      { timeout: 15_000 },
    ).catch(() => { /* content might not appear for edge cases */ })

    // Return all assistant message text (handles multi-bubble tool call scenarios)
    const allText = await this.page.evaluate((msgSel: string) => {
      const msgs = document.querySelectorAll(msgSel)
      return Array.from(msgs).map(el => (el as HTMLElement).innerText.trim()).filter(t => t.length > 0).join('\n')
    }, sel.assistant)

    return allText || await assistantMsg.innerText()
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
    opts: {
      description?: string
      systemPrompt?: string
      model?: { provider: string; model: string }
      modelConfig?: { provider: string; model: string }
      builtinTools?: Record<string, unknown>
      compactThreshold?: number
      mcpServers?: string[]
      skillIds?: string[]
      tools?: Record<string, unknown>
    } = {},
  ): Promise<{ id: string; [key: string]: any }> {
    const modelConfig = opts.modelConfig ?? opts.model ?? await this.getDefaultModelConfig()
    const agent = await this.apiPost(`/api/projects/${projectId}/agents`, {
      name,
      description: opts.description ?? '',
      systemPrompt: opts.systemPrompt ?? '',
      modelConfig,
      builtinTools: opts.builtinTools,
      compactThreshold: opts.compactThreshold,
      mcpServers: opts.mcpServers,
      skillIds: opts.skillIds,
      tools: opts.tools,
    })
    return agent
  }

  private async getDefaultModelConfig(): Promise<{ provider: string; model: string }> {
    if (this.defaultModelCache) return this.defaultModelCache

    const settings = await this.apiGet('/api/settings')
    const fallback = process.env.TEST_GOOGLE_API_KEY
      ? { provider: 'google', model: 'gemini-2.5-flash' }
      : { provider: 'openai', model: 'gpt-5-mini' }

    const defaultModel = settings?.defaultModel
    if (
      defaultModel &&
      typeof defaultModel.provider === 'string' &&
      typeof defaultModel.model === 'string'
    ) {
      this.defaultModelCache = {
        provider: defaultModel.provider,
        model: defaultModel.model,
      }
      return this.defaultModelCache
    }

    this.defaultModelCache = fallback
    return this.defaultModelCache
  }

  /** Create a conversation via the API */
  async createConversationViaApi(
    projectId: string,
    agentId: string,
    title = 'Test Conversation',
  ): Promise<{ id: string; [key: string]: any }> {
    return this.apiPost(`/api/projects/${projectId}/conversations`, {
      targetType: 'agent',
      targetId: agentId,
      title,
    })
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
  ): Promise<ChatStreamResult> {
    const result = await this.postChatStream(
      this.buildChatRequest(projectId, 'agent', agentId, conversationId, message),
      timeout,
    )

    if (!result.response.trim()) {
      const messages = await this.apiGet(`/api/projects/${projectId}/conversations/${conversationId}/messages`)
      result.response = this.extractAssistantTextFromMessages(messages)
    }

    return result
  }

  /** Send a chat message via buffered HTTP request and parse the final SSE payload. */
  async sendChatViaApiBuffered(
    projectId: string,
    agentId: string,
    conversationId: string,
    message: string,
    timeout = TIMEOUTS.AI_RESPONSE,
  ): Promise<ChatStreamResult> {
    const { baseUrl, token } = await this.getServerInfo()
    const response = await this.page.request.post(`${baseUrl}/api/chat`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: this.buildChatRequest(projectId, 'agent', agentId, conversationId, message),
      timeout,
    })

    if (!response.ok()) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`Chat API returned ${response.status()}${errorText ? `: ${errorText}` : ''}`)
    }

    const result = this.parseSSEPayload(await response.text())
    if (!result.response.trim()) {
      const messages = await this.apiGet(`/api/projects/${projectId}/conversations/${conversationId}/messages`)
      result.response = this.extractAssistantTextFromMessages(messages)
    }

    return result
  }

  /** Start a chat stream in the page context without waiting for completion. */
  async startChatViaApiInBackground(
    projectId: string,
    agentId: string,
    conversationId: string,
    message: string,
    timeout = TIMEOUTS.AI_RESPONSE,
  ): Promise<string> {
    const requestId = `bg-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    this.backgroundChatPromises.set(
      requestId,
      this.postChatStream(
        this.buildChatRequest(projectId, 'agent', agentId, conversationId, message),
        timeout,
      ),
    )

    return requestId
  }

  /** Wait for a previously started background chat stream to complete. */
  async waitForBackgroundChat(
    projectId: string,
    conversationId: string,
    requestId: string,
    timeout = TIMEOUTS.AI_RESPONSE,
  ): Promise<ChatStreamResult> {
    const promise = this.backgroundChatPromises.get(requestId)
    if (!promise) {
      throw new Error(`Background chat ${requestId} was not found`)
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`Background chat ${requestId} timed out after ${timeout}ms`)), timeout)
      promise.finally(() => clearTimeout(timer))
    })
    const result = await Promise.race([promise, timeoutPromise])
    this.backgroundChatPromises.delete(requestId)

    if (!String(result.response ?? '').trim()) {
      const messages = await this.apiGet(`/api/projects/${projectId}/conversations/${conversationId}/messages`)
      result.response = this.extractAssistantTextFromMessages(messages)
    }

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
  ): Promise<{ conversationId: string } & ChatStreamResult> {
    // Create a conversation for the team first
    const conv = await this.apiPost(`/api/projects/${projectId}/conversations`, {
      targetType: 'team',
      targetId: teamId,
      title: 'Team Chat Test',
    })
    const result = await this.postChatStream(
      this.buildChatRequest(projectId, 'team', teamId, conv.id, message),
      timeout,
    )

    if (!result.response.trim()) {
      const messages = await this.apiGet(`/api/projects/${projectId}/conversations/${conv.id}/messages`)
      result.response = this.extractAssistantTextFromMessages(messages)
    }

    return { conversationId: conv.id, ...result }
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

  /** Get an absolute path inside the project's workspace directory */
  getWorkspaceFilePath(projectId: string, relativePath = ''): string {
    const dataDir = process.env.GOLEMANCY_TEST_DATA_DIR
    if (!dataDir) throw new Error('GOLEMANCY_TEST_DATA_DIR not set')
    return path.join(dataDir, 'projects', projectId, 'workspace', relativePath)
  }

  /** Get an absolute path inside the project's skill directory */
  getSkillFilePath(projectId: string, skillId: string, relativePath = ''): string {
    const dataDir = process.env.GOLEMANCY_TEST_DATA_DIR
    if (!dataDir) throw new Error('GOLEMANCY_TEST_DATA_DIR not set')
    return path.join(dataDir, 'projects', projectId, 'skills', skillId, relativePath)
  }

  /** Write a file directly into a project's workspace directory (via Node.js fs) */
  seedWorkspaceFile(projectId: string, relativePath: string, content: string): void {
    const filePath = this.getWorkspaceFilePath(projectId, relativePath)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
  }

  /** Read a file directly from the project's workspace directory */
  readWorkspaceFile(projectId: string, relativePath: string): string {
    return fs.readFileSync(this.getWorkspaceFilePath(projectId, relativePath), 'utf-8')
  }

  /** Check whether a workspace file exists */
  workspaceFileExists(projectId: string, relativePath: string): boolean {
    return fs.existsSync(this.getWorkspaceFilePath(projectId, relativePath))
  }

  /** Delete a workspace file if it exists */
  removeWorkspaceFile(projectId: string, relativePath: string): void {
    const filePath = this.getWorkspaceFilePath(projectId, relativePath)
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true })
    }
  }

  /** Read an arbitrary file from disk if it exists */
  readFileIfExists(filePath: string): string | null {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null
  }

  /** Read a file from a skill directory if it exists */
  readSkillFile(projectId: string, skillId: string, relativePath: string): string {
    return fs.readFileSync(this.getSkillFilePath(projectId, skillId, relativePath), 'utf-8')
  }

  /** Check whether a skill file exists */
  skillFileExists(projectId: string, skillId: string, relativePath: string): boolean {
    return fs.existsSync(this.getSkillFilePath(projectId, skillId, relativePath))
  }

  /** Delete an arbitrary file if it exists */
  removeFileIfExists(filePath: string): void {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true })
    }
  }

  // ===== Permissions helpers =====

  /** Create a permissions config via API */
  async createPermissionsConfigViaApi(
    projectId: string,
    data: {
      title: string
      mode: PermissionsConfigFile['mode']
      config: PermissionsConfigFile['config']
    },
  ): Promise<{ id: string; [key: string]: any }> {
    return this.apiPost(`/api/projects/${projectId}/permissions-config`, data)
  }

  /** Assign a permissions config to a project */
  async applyPermissionsConfig(projectId: string, permissionsConfigId: string): Promise<void> {
    await this.apiPatch(`/api/projects/${projectId}`, {
      config: { permissionsConfigId },
    })
  }

  // ===== Generic polling =====

  /** Poll an async function until a predicate passes or timeout is reached */
  async pollUntil<T>(
    fn: () => Promise<T>,
    predicate: (value: T) => boolean,
    opts: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<T> {
    const intervalMs = opts.intervalMs ?? 500
    const timeoutMs = opts.timeoutMs ?? 10_000
    const start = Date.now()

    while (Date.now() - start < timeoutMs) {
      const value = await fn()
      if (predicate(value)) return value
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }

    return fn()
  }

  /** Filter captured SSE events down to tool-call events */
  getToolCallEvents(
    events: SSEEvent[],
    toolName?: string,
  ): SSEEvent[] {
    return events.filter(event => {
      if (
        event.type !== 'tool_call' &&
        event.type !== 'tool-call' &&
        event.type !== 'tool-input-available'
      ) {
        return false
      }
      if (!toolName) return true
      return event.data?.toolName === toolName
    })
  }

  async getConversationMessages(projectId: string, conversationId: string): Promise<any[]> {
    const response = await this.apiGet(`/api/projects/${projectId}/conversations/${conversationId}/messages`)
    return Array.isArray(response?.items) ? response.items : []
  }

  async getLastAssistantMessage(projectId: string, conversationId: string): Promise<any | null> {
    const messages = await this.getConversationMessages(projectId, conversationId)
    return [...messages].reverse().find((message: any) => message?.role === 'assistant') ?? null
  }

  getToolInvocationParts(message: any, toolName?: string): any[] {
    if (!Array.isArray(message?.parts)) return []
    return message.parts.filter((part: any) => {
      if (part?.type !== 'tool-invocation') return false
      if (!toolName) return true
      return part?.toolInvocation?.toolName === toolName
    })
  }

  // ===== Model tier helpers =====

  /** Create an agent using the global default model (Tier A — cheapest) */
  async createCheapAgent(
    projectId: string,
    name: string,
    opts: { systemPrompt?: string; builtinTools?: Record<string, unknown>; compactThreshold?: number } = {},
  ): Promise<{ id: string; [key: string]: any }> {
    // Tier A uses global defaultModel (set in globalSetup — gemini-2.5-flash or gpt-5-mini)
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
      : { provider: 'openai', model: 'gpt-5-mini' }
    return this.createAgentViaApi(projectId, name, { ...opts, model })
  }

  /** Create an agent using a model that is more reliable for tool calling. */
  async createToolAgent(
    projectId: string,
    name: string,
    opts: { systemPrompt?: string; builtinTools?: Record<string, unknown>; compactThreshold?: number } = {},
  ): Promise<{ id: string; [key: string]: any }> {
    const model = process.env.TEST_OPENAI_API_KEY
      ? { provider: 'openai', model: 'gpt-5-mini' }
      : process.env.TEST_ANTHROPIC_API_KEY
        ? { provider: 'anthropic', model: 'claude-haiku-4-5' }
        : process.env.TEST_GOOGLE_API_KEY
          ? { provider: 'google', model: 'gemini-2.5-pro' }
          : undefined

    return this.createAgentViaApi(projectId, name, { ...opts, ...(model ? { model } : {}) })
  }

  // ===== UI Chat helpers (for AI E2E tests) =====

  /** Navigate to a conversation page and wait for chat input to be visible */
  async enterConversation(projectId: string, conversationId: string): Promise<void> {
    // Ensure the store's project list is fresh so ProjectLayout doesn't redirect
    await this.page.evaluate(async () => {
      const store = (window as any).__GOLEMANCY_STORE__
      if (store) await store.getState().loadProjects()
    })
    await this.page.waitForFunction(
      (pid: string) => {
        const store = (window as any).__GOLEMANCY_STORE__
        if (!store) return false
        const state = store.getState()
        return !state.projectsLoading && state.projects.some((p: any) => p.id === pid)
      },
      projectId,
      { timeout: TIMEOUTS.PAGE_LOAD },
    )
    await this.navigateTo(`/projects/${projectId}/chat?conv=${conversationId}`)
    await this.page.waitForSelector(SELECTORS.CHAT_INPUT, {
      state: 'visible',
      timeout: TIMEOUTS.PAGE_LOAD * 2,
    })
  }

  /** Send a message via UI and wait for the assistant response */
  async sendAndWaitForResponse(message: string, timeout = TIMEOUTS.AI_RESPONSE): Promise<string> {
    await this.sendChatMessage(message)
    return this.waitForResponse(timeout)
  }

  /** Wait for a specific tool call to appear in the DOM */
  async waitForToolCall(toolName: string, timeout = TIMEOUTS.AI_RESPONSE): Promise<void> {
    await this.page.waitForSelector(SELECTORS.TOOL_CALL_BY_NAME(toolName), {
      state: 'visible',
      timeout,
    })
  }

  /** Check if a tool call is visible in the DOM */
  async hasToolCall(toolName?: string): Promise<boolean> {
    const selector = toolName ? SELECTORS.TOOL_CALL_BY_NAME(toolName) : SELECTORS.TOOL_CALL
    return this.page.locator(selector).first().isVisible().catch(() => false)
  }

  /** Wait for a compact boundary marker to appear */
  async waitForCompactBoundary(timeout = TIMEOUTS.AI_RESPONSE): Promise<void> {
    await this.page.waitForSelector(SELECTORS.COMPACT_BOUNDARY, {
      state: 'visible',
      timeout,
    })
  }

  /** Wait for a sub-agent display to appear */
  async waitForSubAgentDisplay(agentName?: string, timeout = TIMEOUTS.AI_RESPONSE): Promise<void> {
    const selector = agentName ? SELECTORS.SUB_AGENT_BY_NAME(agentName) : SELECTORS.SUB_AGENT_DISPLAY
    await this.page.waitForSelector(selector, {
      state: 'visible',
      timeout,
    })
  }

  /** Get the count of visible assistant messages */
  async getAssistantMessageCount(): Promise<number> {
    return this.page.locator(`${SELECTORS.CHAT_MESSAGE}[data-role="assistant"]`).count()
  }

  /** Create a team conversation, navigate to it, and send a message via UI */
  async sendTeamChatViaUi(
    projectId: string,
    teamId: string,
    message: string,
    timeout = TIMEOUTS.AI_RESPONSE,
  ): Promise<{ conversationId: string; response: string }> {
    const conv = await this.apiPost(`/api/projects/${projectId}/conversations`, {
      targetType: 'team',
      targetId: teamId,
      title: 'Team Chat Test',
    })
    await this.enterConversation(projectId, conv.id)
    const response = await this.sendAndWaitForResponse(message, timeout)
    return { conversationId: conv.id, response }
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
