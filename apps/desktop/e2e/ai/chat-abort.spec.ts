import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

test.describe('Chat Abort', () => {
  let projectId: string
  let agentId: string
  let toolAgentId: string
  let leaderAgentId: string
  let memberAgentId: string
  let teamId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()

    const project = await helper.createProjectViaApi('Chat Abort Test')
    projectId = project.id

    // Cheap agent for basic abort tests (no tools → single step)
    const agent = await helper.createCheapAgent(projectId, 'Abort Test Agent')
    agentId = agent.id

    // Agent with memory tool for multi-step abort token test
    const toolAgent = await helper.createCheapAgent(projectId, 'Abort Tool Agent', {
      systemPrompt: 'You MUST save a memory using the MemorySave tool before answering any question. After saving, write an extremely long and detailed response.',
      builtinTools: { memory: true, bash: false, browser: false, task: false },
    })
    toolAgentId = toolAgent.id

    // Team for sub-agent abort test
    const leader = await helper.createCheapAgent(projectId, 'Abort Leader', {
      systemPrompt: 'You are a team leader. Always delegate tasks to your team members.',
    })
    leaderAgentId = leader.id

    const member = await helper.createCheapAgent(projectId, 'Abort Member', {
      systemPrompt: 'You are a helpful team member.',
    })
    memberAgentId = member.id

    const team = await helper.createTeamViaApi(projectId, 'Abort Test Team', [
      { agentId: leaderAgentId },
      { agentId: memberAgentId, parentAgentId: leaderAgentId },
    ])
    teamId = team.id
  })

  /**
   * Start a chat stream via raw fetch, returning the AbortController for manual abort.
   * Unlike helper.sendChatViaApi, this exposes the controller so we can abort mid-stream.
   */
  async function startAbortableChat(
    helper: any,
    targetType: 'agent' | 'team',
    targetId: string,
    conversationId: string,
    message: string,
  ): Promise<{ controller: AbortController; response: Promise<Response | void> }> {
    const { baseUrl, token } = await helper.getServerInfo()
    const controller = new AbortController()

    // Suppress unhandled rejection when abort fires — the abort is intentional
    const response = fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectId,
        targetType,
        targetId,
        conversationId,
        messages: [{
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: 'user',
          parts: [{ type: 'text', text: message }],
        }],
      }),
      signal: controller.signal,
    }).catch(() => {})

    return { controller, response }
  }

  /** Poll /api/active-chats/count until it satisfies the predicate. */
  async function waitForActiveChatCount(
    helper: any,
    predicate: (count: number) => boolean,
    timeoutMs = 15_000,
  ): Promise<number> {
    const result = await helper.pollUntil(
      async () => {
        const data = await helper.apiGet('/api/active-chats/count')
        return data.count as number
      },
      predicate,
      { intervalMs: 300, timeoutMs },
    )
    return result
  }

  test('abort mid-stream: agent status returns to idle and active count drops to 0', async ({ helper }) => {
    test.setTimeout(60_000)

    const conv = await helper.createConversationViaApi(projectId, agentId)

    // Start a chat that requests a long response
    const { controller } = await startAbortableChat(
      helper, 'agent', agentId, conv.id,
      'Write an extremely detailed 5000-word essay about the complete history of computing from 1940 to today. Cover every decade in depth.',
    )

    // Wait for streaming to start
    await waitForActiveChatCount(helper, (c) => c > 0)

    // Abort mid-stream
    controller.abort()

    // Wait for cleanup: active count back to 0
    await waitForActiveChatCount(helper, (c) => c === 0)

    // Agent status should be idle
    const agent = await helper.apiGet(`/api/projects/${projectId}/agents/${agentId}`)
    expect(agent.status).toBe('idle')
  })

  test('abort mid-stream: token usage is recorded for completed steps', async ({ helper }) => {
    test.setTimeout(90_000)

    // Use the tool agent — it will call MemorySave (step 1 completes with usage),
    // then start writing a long response (step 2). We abort during step 2.
    const conv = await helper.createConversationViaApi(projectId, toolAgentId)

    const { controller } = await startAbortableChat(
      helper, 'agent', toolAgentId, conv.id,
      'Remember this fact: "The speed of light is 299792458 m/s". Then write an extremely detailed 5000-word essay about the history of space exploration covering every mission from 1957 to today.',
    )

    await waitForActiveChatCount(helper, (c) => c > 0)

    // Wait for the tool call step to complete before aborting.
    // MemorySave is fast (~1-3s), then the model starts step 2 (long text).
    await new Promise((r) => setTimeout(r, 8_000))

    controller.abort()
    await waitForActiveChatCount(helper, (c) => c === 0)

    // onAbort sums completed steps — step 1 (tool call) should have usage > 0
    const usage = await helper.apiGet(
      `/api/projects/${projectId}/conversations/${conv.id}/token-usage`,
    )
    expect(usage.total.inputTokens).toBeGreaterThan(0)
  })

  test('abort mid-stream: partial assistant message is not persisted', async ({ helper }) => {
    test.setTimeout(60_000)

    const conv = await helper.createConversationViaApi(projectId, agentId)

    const { controller } = await startAbortableChat(
      helper, 'agent', agentId, conv.id,
      'Write an extremely detailed 5000-word essay about the history of mathematics. Cover every century.',
    )

    await waitForActiveChatCount(helper, (c) => c > 0)
    controller.abort()
    await waitForActiveChatCount(helper, (c) => c === 0)

    // Check persisted messages — should have user message but no assistant message
    const messages = await helper.apiGet(
      `/api/projects/${projectId}/conversations/${conv.id}/messages`,
    )
    const items = messages.items ?? messages
    const assistantMessages = (Array.isArray(items) ? items : []).filter(
      (m: any) => m.role === 'assistant',
    )
    expect(assistantMessages.length).toBe(0)
  })

  test('abort then recover: new chat works normally after abort', async ({ helper }) => {
    test.setTimeout(90_000)

    const conv1 = await helper.createConversationViaApi(projectId, agentId)

    // Start and abort a chat
    const { controller } = await startAbortableChat(
      helper, 'agent', agentId, conv1.id,
      'Write an extremely detailed 5000-word essay about ocean biology.',
    )

    await waitForActiveChatCount(helper, (c) => c > 0)
    controller.abort()
    await waitForActiveChatCount(helper, (c) => c === 0)

    // Now send a new chat — should work normally
    const conv2 = await helper.createConversationViaApi(projectId, agentId)
    const result = await helper.sendChatViaApi(
      projectId, agentId, conv2.id,
      'Say exactly: RECOVERY_OK',
      TIMEOUTS.AI_RESPONSE,
    )

    expect(result.response).toContain('RECOVERY_OK')

    // Agent should be idle after normal completion
    const agent = await helper.apiGet(`/api/projects/${projectId}/agents/${agentId}`)
    expect(agent.status).toBe('idle')
  })

  test('sub-agent abort: team chat abort returns all agents to idle', async ({ helper }) => {
    test.setTimeout(90_000)

    // Create a team conversation
    const conv = await helper.apiPost(`/api/projects/${projectId}/conversations`, {
      targetType: 'team',
      targetId: teamId,
      title: 'Team Abort Test',
    })

    // Start a team chat requesting a long delegation
    const { controller } = await startAbortableChat(
      helper, 'team', teamId, conv.id,
      'Write an extremely detailed and comprehensive 5000-word analysis of global climate change. Delegate research tasks to your team members and have them each write a section.',
    )

    // Wait for streaming to start
    await waitForActiveChatCount(helper, (c) => c > 0)

    // Abort the team chat
    controller.abort()

    // Wait for all chats to clean up
    await waitForActiveChatCount(helper, (c) => c === 0)

    // Both leader and member agents should return to idle
    const leader = await helper.apiGet(`/api/projects/${projectId}/agents/${leaderAgentId}`)
    expect(leader.status).toBe('idle')

    const member = await helper.apiGet(`/api/projects/${projectId}/agents/${memberAgentId}`)
    expect(member.status).toBe('idle')
  })
})
