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
    await helper.enterConversation(projectId, rememberConv.id)
    const rememberResponse = await helper.sendAndWaitForResponse(
      `Remember this exact launch code in memory and confirm it back to me: ${uniqueCode}`,
      TIMEOUTS.AI_RESPONSE,
    )

    // Verify memory tool call appeared in DOM
    expect(await helper.hasToolCall()).toBe(true)
    expect(rememberResponse).toContain(uniqueCode)

    // Verify memory was stored via API
    const memories = await helper.apiGet(`/api/projects/${projectId}/agents/${agent.id}/memories`)
    expect(
      memories.some((memory: any) => String(memory?.content ?? '').includes(uniqueCode)),
    ).toBe(true)

    // Recall in a new conversation
    const recallConv = await helper.createConversationViaApi(projectId, agent.id, 'Memory Recall Conv')
    await helper.enterConversation(projectId, recallConv.id)
    const recallResponse = await helper.sendAndWaitForResponse(
      'What exact launch code did I ask you to remember earlier?',
      TIMEOUTS.AI_RESPONSE,
    )

    expect(recallResponse).toContain(uniqueCode)
  })

  test('agent can save memory via MemorySave tool', async ({ helper }) => {
    test.setTimeout(120_000)

    const agent = await helper.createSmartAgent(projectId, 'Memory Save Agent', {
      systemPrompt:
        'You are a helpful assistant with memory capabilities. When the user tells you to remember something, use the MemorySave tool to store it. Confirm what you saved.',
      builtinTools: { bash: false, browser: false, task: false, memory: true },
    })

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'Save Test Conv')
    await helper.enterConversation(projectId, conv.id)
    const response = await helper.sendAndWaitForResponse(
      'Please remember that my favorite color is emerald green.',
      TIMEOUTS.AI_RESPONSE,
    )

    // Check that a tool call appeared in DOM
    expect(await helper.hasToolCall()).toBe(true)

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
    await helper.enterConversation(projectId, conv.id)
    const response = await helper.sendAndWaitForResponse(
      'Search your memory: what is the project deadline?',
      TIMEOUTS.AI_RESPONSE,
    )

    // Response should mention the deadline
    expect(response).toMatch(/march\s*30|30/i)
  })
})
