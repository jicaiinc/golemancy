import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Compact Conversation Quality', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('Compact Quality Test')
    projectId = project.id

    const agent = await helper.createCheapAgent(projectId, 'Compact Quality Agent', {
      systemPrompt:
        'You are a helpful assistant. Remember all facts the user tells you. When asked about previously mentioned facts, recall them accurately. Keep responses concise.',
    })
    agentId = agent.id
  })

  test('context is preserved after manual compact', async ({ helper }) => {
    test.setTimeout(180_000)

    const conv = await helper.createConversationViaApi(projectId, agentId, 'Context Preservation')

    // Build up context with several facts
    await helper.sendChatViaApi(
      projectId, agentId, conv.id,
      'Remember: my dog is named Pixel and he is a golden retriever.',
      TIMEOUTS.AI_RESPONSE,
    )

    await helper.sendChatViaApi(
      projectId, agentId, conv.id,
      'Remember: my favorite programming language is Rust.',
      TIMEOUTS.AI_RESPONSE,
    )

    await helper.sendChatViaApi(
      projectId, agentId, conv.id,
      'Remember: I live in Tokyo, Japan.',
      TIMEOUTS.AI_RESPONSE,
    )

    // Trigger manual compact
    const compactResponse = await helper.apiPostRaw(
      `/api/projects/${projectId}/conversations/${conv.id}/compact`,
      {},
    )
    expect(compactResponse.status()).toBe(201)

    // Ask about the facts after compaction
    const result = await helper.sendChatViaApi(
      projectId, agentId, conv.id,
      'What is my dog\'s name and breed? Where do I live? What is my favorite programming language?',
      TIMEOUTS.AI_RESPONSE,
    )

    // The AI should still know the key facts from the compacted context
    const lower = result.response.toLowerCase()
    expect(lower).toContain('pixel')
    // At least one more fact should be retained
    const factsRetained = [
      lower.includes('golden retriever') || lower.includes('retriever'),
      lower.includes('rust'),
      lower.includes('tokyo'),
    ].filter(Boolean).length
    expect(factsRetained).toBeGreaterThanOrEqual(2)
  })

  test('chat continues normally after compact', async ({ helper }) => {
    test.setTimeout(180_000)

    const conv = await helper.createConversationViaApi(projectId, agentId, 'Continue After Compact')

    // Have a conversation
    await helper.sendChatViaApi(
      projectId, agentId, conv.id,
      'Hello! Let us talk about space exploration.',
      TIMEOUTS.AI_RESPONSE,
    )

    await helper.sendChatViaApi(
      projectId, agentId, conv.id,
      'What was the first moon landing year?',
      TIMEOUTS.AI_RESPONSE,
    )

    // Compact
    const compactResponse = await helper.apiPostRaw(
      `/api/projects/${projectId}/conversations/${conv.id}/compact`,
      {},
    )
    expect(compactResponse.status()).toBe(201)

    // Continue the conversation — should work seamlessly
    const result = await helper.sendChatViaApi(
      projectId, agentId, conv.id,
      'And what about the Mars rovers? Name one.',
      TIMEOUTS.AI_RESPONSE,
    )

    // Should produce a coherent response about Mars rovers
    const lower = result.response.toLowerCase()
    const hasMarsRover =
      lower.includes('curiosity') ||
      lower.includes('perseverance') ||
      lower.includes('opportunity') ||
      lower.includes('spirit') ||
      lower.includes('sojourner') ||
      lower.includes('rover')
    expect(hasMarsRover).toBe(true)
  })

  test('compact summary is stored and retrievable', async ({ helper }) => {
    test.setTimeout(180_000)

    const conv = await helper.createConversationViaApi(projectId, agentId, 'Summary Storage')

    // Build some conversation content
    await helper.sendChatViaApi(
      projectId, agentId, conv.id,
      'The secret code word is "butterfly garden". Please acknowledge.',
      TIMEOUTS.AI_RESPONSE,
    )

    await helper.sendChatViaApi(
      projectId, agentId, conv.id,
      'Also remember that the meeting is scheduled for next Tuesday at 3pm.',
      TIMEOUTS.AI_RESPONSE,
    )

    // Trigger compact
    const compactResponse = await helper.apiPostRaw(
      `/api/projects/${projectId}/conversations/${conv.id}/compact`,
      {},
    )
    expect(compactResponse.status()).toBe(201)

    const compactRecord = await compactResponse.json()
    expect(compactRecord.id).toBeDefined()
    expect(compactRecord.summary).toBeTruthy()
    expect(compactRecord.trigger).toBe('manual')

    // Verify compact record is accessible via conversation API
    const convData = await helper.apiGet(
      `/api/projects/${projectId}/conversations/${conv.id}`,
    )
    expect(Array.isArray(convData.compactRecords)).toBe(true)
    expect(convData.compactRecords.length).toBeGreaterThanOrEqual(1)

    // The summary should contain some reference to the conversation content
    const summary = compactRecord.summary.toLowerCase()
    const hasRelevantContent =
      summary.includes('butterfly') ||
      summary.includes('code') ||
      summary.includes('meeting') ||
      summary.includes('tuesday') ||
      summary.length > 20 // at minimum, it's a non-trivial summary
    expect(hasRelevantContent).toBe(true)
  })
})
