import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Agent Status Transitions', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('Agent Status Transitions')
    projectId = project.id
  })

  test('agent appears in runningChats during active conversation', async ({ helper }) => {
    test.setTimeout(120_000)

    const agent = await helper.createToolAgent(projectId, 'Running Status Agent', {
      systemPrompt:
        'You are a test assistant. When asked to write something long, write a detailed essay of at least 500 words about the topic.',
    })

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'status running test')

    // Fire the chat request WITHOUT awaiting completion
    const chatPromise = helper.sendChatViaApi(
      projectId,
      agent.id,
      conv.id,
      'Write a very detailed and long essay about the history of computing, at least 500 words. Cover every decade from the 1940s to 2020s.',
      TIMEOUTS.AI_RESPONSE,
    )

    // Poll the runtime status to catch the agent while it's running
    let caughtRunning = false
    const runtimeStatus = await helper.pollUntil(
      () => helper.apiGet(`/api/projects/${projectId}/dashboard/runtime-status`),
      (status: any) => {
        const chats = status?.runningChats ?? []
        if (chats.length > 0) {
          caughtRunning = true
          return true
        }
        return false
      },
      { intervalMs: 300, timeoutMs: 30_000 },
    )

    // Wait for the chat to actually finish
    await chatPromise

    // Primary assertion: we observed the agent running at least once
    expect(caughtRunning).toBe(true)

    // Secondary: runningChats had entries during the conversation
    const runningChats = runtimeStatus?.runningChats ?? []
    expect(runningChats.length).toBeGreaterThanOrEqual(1)
  })

  test('agent disappears from runningChats after conversation completes', async ({ helper }) => {
    test.setTimeout(120_000)

    const agent = await helper.createToolAgent(projectId, 'Idle Status Agent', {
      systemPrompt: 'You are a test assistant. Reply briefly.',
    })

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'status idle test')
    await helper.sendChatViaApi(
      projectId,
      agent.id,
      conv.id,
      'Say "done" and nothing else.',
      TIMEOUTS.AI_RESPONSE,
    )

    // After chat completes, poll until runningChats is empty
    const finalStatus = await helper.pollUntil(
      () => helper.apiGet(`/api/projects/${projectId}/dashboard/runtime-status`),
      (status: any) => {
        const chats = status?.runningChats ?? []
        return chats.length === 0
      },
      { intervalMs: 300, timeoutMs: 10_000 },
    )

    const runningChats = finalStatus?.runningChats ?? []
    expect(runningChats.length).toBe(0)
  })

  test('agent does not get stuck in running state on invalid provider error', async ({ helper }) => {
    test.setTimeout(120_000)

    // Create agent with a nonsense provider that will fail
    const agent = await helper.createAgentViaApi(projectId, 'Bad Provider Agent', {
      systemPrompt: 'You are a test assistant.',
      modelConfig: { provider: 'nonexistent-provider-xyz', model: 'fake-model-123' },
    })

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'bad provider test')

    // Send chat — this should fail
    try {
      await helper.sendChatViaApi(
        projectId,
        agent.id,
        conv.id,
        'Hello',
        30_000,
      )
    } catch {
      // Expected to fail — invalid provider
    }

    // After the failed attempt, the agent should NOT be stuck in running
    const finalStatus = await helper.pollUntil(
      () => helper.apiGet(`/api/projects/${projectId}/dashboard/runtime-status`),
      (status: any) => {
        const chats = status?.runningChats ?? []
        // Should not contain our conversation
        return !chats.some((c: any) => c.conversationId === conv.id)
      },
      { intervalMs: 500, timeoutMs: 15_000 },
    )

    const stuckChats = (finalStatus?.runningChats ?? []).filter(
      (c: any) => c.conversationId === conv.id,
    )
    expect(stuckChats.length).toBe(0)
  })

  // B7: Multi-agent concurrent running status

  test('two agents running concurrently both appear in runningChats', async ({ helper }) => {
    test.setTimeout(180_000)

    const agentA = await helper.createToolAgent(projectId, 'Concurrent Agent A', {
      systemPrompt:
        'You are a test assistant. When asked to write something long, write a detailed essay of at least 500 words.',
    })
    const agentB = await helper.createToolAgent(projectId, 'Concurrent Agent B', {
      systemPrompt:
        'You are a test assistant. When asked to write something long, write a detailed essay of at least 500 words.',
    })

    const convA = await helper.createConversationViaApi(projectId, agentA.id, 'concurrent A')
    const convB = await helper.createConversationViaApi(projectId, agentB.id, 'concurrent B')

    // Fire both chats concurrently WITHOUT awaiting
    const chatAPromise = helper.sendChatViaApi(
      projectId, agentA.id, convA.id,
      'Write a very detailed and long essay about the history of astronomy, at least 500 words.',
      TIMEOUTS.AI_RESPONSE,
    )
    const chatBPromise = helper.sendChatViaApi(
      projectId, agentB.id, convB.id,
      'Write a very detailed and long essay about the history of architecture, at least 500 words.',
      TIMEOUTS.AI_RESPONSE,
    )

    // Poll until we see at least 2 running chats simultaneously
    let caughtBothRunning = false
    await helper.pollUntil(
      () => helper.apiGet(`/api/projects/${projectId}/dashboard/runtime-status`),
      (status: any) => {
        const chats = status?.runningChats ?? []
        if (chats.length >= 2) {
          caughtBothRunning = true
          return true
        }
        return false
      },
      { intervalMs: 300, timeoutMs: 30_000 },
    )

    // Wait for both chats to finish
    await Promise.allSettled([chatAPromise, chatBPromise])

    expect(caughtBothRunning).toBe(true)
  })

  test('after concurrent chats complete, runningChats is empty', async ({ helper }) => {
    test.setTimeout(60_000)

    // After previous test, both chats should have completed
    const finalStatus = await helper.pollUntil(
      () => helper.apiGet(`/api/projects/${projectId}/dashboard/runtime-status`),
      (status: any) => {
        const chats = status?.runningChats ?? []
        return chats.length === 0
      },
      { intervalMs: 500, timeoutMs: 15_000 },
    )

    expect((finalStatus?.runningChats ?? []).length).toBe(0)
  })
})
