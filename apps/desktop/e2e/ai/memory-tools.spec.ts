import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Memory Tools', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)

    await helper.goHome()
    const project = await helper.createProjectViaApi('Memory Tools Test')
    projectId = project.id
  })

  test('pinned memory is available in new conversations', async ({ helper }) => {
    test.setTimeout(120_000)

    // Create agent with memory tool enabled
    const agent = await helper.createSmartAgent(projectId, 'Memory Recall Agent', {
      systemPrompt: 'You are a helpful assistant. Always check your memory for relevant information before answering.',
      builtinTools: { bash: false, browser: false, task: false, memory: true },
    })

    // Add pinned memory via API
    await helper.createMemoryViaApi(projectId, agent.id, 'The user\'s name is Golem', {
      pinned: true,
      priority: 5,
    })

    // Start a new conversation and ask about the name
    const conv = await helper.createConversationViaApi(projectId, agent.id, 'Memory Test Conv')
    const { response } = await helper.sendChatViaApi(
      projectId,
      agent.id,
      conv.id,
      'Do you remember my name? What is it?',
      TIMEOUTS.AI_RESPONSE,
    )

    // The AI should reference "Golem" from the pinned memory
    expect(response).toContain('Golem')
  })

  test('agent can save memory via MemorySave tool', async ({ helper }) => {
    test.setTimeout(120_000)

    const agent = await helper.createSmartAgent(projectId, 'Memory Save Agent', {
      systemPrompt:
        'You are a helpful assistant with memory capabilities. When the user tells you to remember something, use the MemorySave tool to store it. Confirm what you saved.',
      builtinTools: { bash: false, browser: false, task: false, memory: true },
    })

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'Save Test Conv')
    const { response, events } = await helper.sendChatViaApi(
      projectId,
      agent.id,
      conv.id,
      'Please remember that my favorite color is emerald green.',
      TIMEOUTS.AI_RESPONSE,
    )

    // Check that a tool call happened (MemorySave or memory_save)
    const memoryToolCalls = events.filter(
      e =>
        e.type === 'tool_call' &&
        typeof e.data?.toolName === 'string' &&
        /memory/i.test(e.data.toolName),
    )
    expect(memoryToolCalls.length).toBeGreaterThanOrEqual(1)

    // Response should confirm the save
    const lower = response.toLowerCase()
    expect(lower).toMatch(/remember|saved|stored|noted/i)
  })

  test('agent can search memory via MemorySearch tool', async ({ helper }) => {
    test.setTimeout(120_000)

    const agent = await helper.createSmartAgent(projectId, 'Memory Search Agent', {
      systemPrompt:
        'You are a helpful assistant. When asked about what you remember, use the MemorySearch tool to look it up. Report what you find.',
      builtinTools: { bash: false, browser: false, task: false, memory: true },
    })

    // Pre-seed a memory via API
    await helper.createMemoryViaApi(projectId, agent.id, 'The project deadline is March 30th', {
      pinned: false,
      priority: 3,
      tags: ['project', 'deadline'],
    })

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'Search Test Conv')
    const { response } = await helper.sendChatViaApi(
      projectId,
      agent.id,
      conv.id,
      'Search your memory: what is the project deadline?',
      TIMEOUTS.AI_RESPONSE,
    )

    // Response should mention the deadline
    expect(response).toMatch(/march\s*30|30/i)
  })
})
