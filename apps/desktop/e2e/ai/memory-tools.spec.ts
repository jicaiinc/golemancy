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

  test('agent saves memory in one conversation and recalls it in a new conversation', async ({ helper }) => {
    test.setTimeout(120_000)

    const uniqueCode = `COBALT-${Date.now()}-ALPHA`

    const agent = await helper.createToolAgent(projectId, 'Memory Recall Agent', {
      systemPrompt:
        'You are a helpful assistant. When the user asks you to remember something, use the memory tool immediately. When the user asks what you remember, search memory before answering.',
      builtinTools: { bash: false, browser: false, task: false, memory: true },
    })

    const rememberConv = await helper.createConversationViaApi(projectId, agent.id, 'Memory Save Conv')
    const rememberResult = await helper.sendChatViaApi(
      projectId,
      agent.id,
      rememberConv.id,
      `Remember this exact launch code in memory and confirm it back to me: ${uniqueCode}`,
      TIMEOUTS.AI_RESPONSE,
    )

    const saveToolCalls = helper.getToolCallEvents(rememberResult.events).filter(event =>
      /memory/i.test(String(event.data?.toolName ?? '')),
    )
    expect(saveToolCalls.length).toBeGreaterThanOrEqual(1)
    expect(rememberResult.response).toContain(uniqueCode)

    const memories = await helper.apiGet(`/api/projects/${projectId}/agents/${agent.id}/memories`)
    expect(
      memories.some((memory: any) => String(memory?.content ?? '').includes(uniqueCode)),
    ).toBe(true)

    const recallConv = await helper.createConversationViaApi(projectId, agent.id, 'Memory Recall Conv')
    const recallResult = await helper.sendChatViaApi(
      projectId,
      agent.id,
      recallConv.id,
      'What exact launch code did I ask you to remember earlier?',
      TIMEOUTS.AI_RESPONSE,
    )

    expect(recallResult.response).toContain(uniqueCode)
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
