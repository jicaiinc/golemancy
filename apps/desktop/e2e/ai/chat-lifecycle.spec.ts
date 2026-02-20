import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Chat Lifecycle', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string
  let primaryAgentId: string
  let secondaryAgentId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('Chat Lifecycle Test')
    projectId = project.id

    const primary = await helper.createAgentViaApi(projectId, 'Primary Agent', {
      systemPrompt: 'You are a helpful test assistant. Keep responses brief and concise.',
    })
    primaryAgentId = primary.id

    const secondary = await helper.createAgentViaApi(projectId, 'Secondary Agent', {
      systemPrompt: 'You are a secondary test assistant. Always start your reply with "Secondary:".',
    })
    secondaryAgentId = secondary.id
  })

  // ===== Chat lifecycle (5 tests) =====

  test('create conversation and send message via API', async ({ helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(projectId, primaryAgentId, 'Lifecycle Test')
    expect(conv.id).toBeTruthy()

    const result = await helper.sendChatViaApi(
      projectId, primaryAgentId, conv.id,
      'Say hello in one word.',
    )

    expect(result.response).toBeTruthy()
    expect(result.response.length).toBeGreaterThan(0)
  })

  test('verify conversation messages contain user and assistant', async ({ helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(projectId, primaryAgentId, 'Messages Test')
    await helper.sendChatViaApi(projectId, primaryAgentId, conv.id, 'Reply with OK.')

    const messages = await helper.apiGet(
      `/api/projects/${projectId}/conversations/${conv.id}/messages`,
    )

    expect(messages.items).toBeDefined()
    expect(Array.isArray(messages.items)).toBe(true)

    const roles = messages.items.map((m: { role: string }) => m.role)
    expect(roles).toContain('user')
    expect(roles).toContain('assistant')
  })

  test('verify agent status after chat completes', async ({ helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(projectId, primaryAgentId, 'Status Test')
    await helper.sendChatViaApi(projectId, primaryAgentId, conv.id, 'Reply with OK.')

    // After chat completes, runtime-status should not show this chat as running
    const status = await helper.apiGet(
      `/api/projects/${projectId}/dashboard/runtime-status`,
    )

    expect(status.runningChats).toBeDefined()
    expect(Array.isArray(status.runningChats)).toBe(true)

    // The chat we just finished should not be in runningChats
    const runningConvIds = status.runningChats.map(
      (c: { conversationId: string }) => c.conversationId,
    )
    expect(runningConvIds).not.toContain(conv.id)
  })

  test('verify runtime-status structure', async ({ helper }) => {
    test.setTimeout(60_000)

    const status = await helper.apiGet(
      `/api/projects/${projectId}/dashboard/runtime-status`,
    )

    // Verify the full structure of RuntimeStatus
    expect(status).toHaveProperty('runningChats')
    expect(status).toHaveProperty('runningCrons')
    expect(status).toHaveProperty('upcoming')
    expect(status).toHaveProperty('recentCompleted')

    expect(Array.isArray(status.runningChats)).toBe(true)
    expect(Array.isArray(status.runningCrons)).toBe(true)
    expect(Array.isArray(status.upcoming)).toBe(true)
    expect(Array.isArray(status.recentCompleted)).toBe(true)
  })

  test('delete conversation and verify messages deleted', async ({ helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(projectId, primaryAgentId, 'Delete Test')
    await helper.sendChatViaApi(projectId, primaryAgentId, conv.id, 'Reply with OK.')

    // Delete the conversation
    const deleteResult = await helper.apiDelete(
      `/api/projects/${projectId}/conversations/${conv.id}`,
    )
    expect(deleteResult.ok).toBe(true)

    // Verify the conversation is gone (404)
    const getResult = await helper.apiGetRaw(
      `/api/projects/${projectId}/conversations/${conv.id}`,
    )
    expect(getResult.status()).toBe(404)
  })

  // ===== Multi-Agent (3 tests) =====

  test('chat with primary agent', async ({ helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(projectId, primaryAgentId, 'Primary Chat')
    const result = await helper.sendChatViaApi(
      projectId, primaryAgentId, conv.id,
      'What is 1+1? Reply with just the number.',
    )

    expect(result.response).toBeTruthy()
    expect(result.response.length).toBeGreaterThan(0)
  })

  test('chat with secondary agent', async ({ helper }) => {
    test.setTimeout(120_000)

    const conv = await helper.createConversationViaApi(projectId, secondaryAgentId, 'Secondary Chat')
    const result = await helper.sendChatViaApi(
      projectId, secondaryAgentId, conv.id,
      'Say hello.',
    )

    expect(result.response).toBeTruthy()
    expect(result.response.length).toBeGreaterThan(0)
  })

  test('dashboard shows independent token counts for each agent', async ({ helper }) => {
    test.setTimeout(60_000)

    const tokenByAgent = await helper.apiGet(
      `/api/projects/${projectId}/dashboard/token-by-agent`,
    )

    expect(Array.isArray(tokenByAgent)).toBe(true)

    // Should have entries for both agents (they both had chats in previous tests)
    const agentIds = tokenByAgent.map((a: { agentId: string }) => a.agentId)
    expect(agentIds).toContain(primaryAgentId)
    expect(agentIds).toContain(secondaryAgentId)

    // Each agent should have their own token counts
    for (const entry of tokenByAgent) {
      expect(entry.inputTokens).toBeGreaterThanOrEqual(0)
      expect(entry.outputTokens).toBeGreaterThanOrEqual(0)
      expect(entry.callCount).toBeGreaterThanOrEqual(0)
    }
  })
})
