import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Memory Edit Behavior', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('Memory Edit Behavior')
    projectId = project.id

    const agent = await helper.createToolAgent(projectId, 'Memory Edit Agent', {
      systemPrompt: [
        'You are a helpful assistant with memory.',
        'When asked about what you know about the user, check your memory first.',
        'Report exactly what your memory says. Be precise with codes and identifiers.',
      ].join(' '),
      builtinTools: { bash: false, browser: false, task: false, memory: true },
    })
    agentId = agent.id
  })

  test('pinned memory is recalled in a new conversation', async ({ helper }) => {
    test.setTimeout(120_000)

    const alphaCode = `ALPHA_${Date.now()}_RECALL`

    // Create pinned memory via API
    const memory = await helper.createMemoryViaApi(projectId, agentId, `The user's secret code is ${alphaCode}`, {
      pinned: true,
      priority: 5,
    })

    // Verify memory was created
    const memories = await helper.apiGet(`/api/projects/${projectId}/agents/${agentId}/memories`)
    expect(memories.some((m: any) => String(m?.content ?? '').includes(alphaCode))).toBe(true)

    // Start a fresh conversation and ask about the code
    const conv = await helper.createConversationViaApi(projectId, agentId, 'recall alpha')
    const { response } = await helper.sendChatViaApi(
      projectId,
      agentId,
      conv.id,
      'What is my secret code? Check your memory.',
      TIMEOUTS.AI_RESPONSE,
    )

    expect(response).toContain(alphaCode)

    // Clean up for next test
    await helper.apiDelete(`/api/projects/${projectId}/agents/${agentId}/memories/${memory.id}`)
  })

  test('edited memory replaces old content in new conversations', async ({ helper }) => {
    test.setTimeout(180_000)

    const betaCode = `BETA_${Date.now()}_EDITED`
    const originalCode = `ORIGINAL_${Date.now()}_OLD`

    // Create pinned memory with original content
    const memory = await helper.createMemoryViaApi(
      projectId,
      agentId,
      `The user's project name is ${originalCode}`,
      { pinned: true, priority: 5 },
    )

    // PATCH the memory to new content
    await helper.apiPatch(`/api/projects/${projectId}/agents/${agentId}/memories/${memory.id}`, {
      content: `The user's project name is ${betaCode}`,
    })

    // Verify the memory was updated via API (no GET /:id route — use list + find)
    const allMemories = await helper.apiGet(`/api/projects/${projectId}/agents/${agentId}/memories`)
    const updated = allMemories.find((m: any) => m.id === memory.id)
    expect(updated).toBeDefined()
    expect(String(updated?.content ?? '')).toContain(betaCode)
    expect(String(updated?.content ?? '')).not.toContain(originalCode)

    // New conversation: ask about the project name
    const conv = await helper.createConversationViaApi(projectId, agentId, 'recall beta')
    const { response } = await helper.sendChatViaApi(
      projectId,
      agentId,
      conv.id,
      'What is my project name? Check your memory and tell me the exact name.',
      TIMEOUTS.AI_RESPONSE,
    )

    expect(response).toContain(betaCode)
    expect(response).not.toContain(originalCode)

    // Clean up
    await helper.apiDelete(`/api/projects/${projectId}/agents/${agentId}/memories/${memory.id}`)
  })

  test('deleted memory is no longer recalled', async ({ helper }) => {
    test.setTimeout(120_000)

    const deletedCode = `DELETED_${Date.now()}_GONE`

    // Create and then immediately delete the memory
    const memory = await helper.createMemoryViaApi(
      projectId,
      agentId,
      `The user's favorite number is ${deletedCode}`,
      { pinned: true, priority: 5 },
    )

    // Verify it exists
    const before = await helper.apiGet(`/api/projects/${projectId}/agents/${agentId}/memories`)
    expect(before.some((m: any) => String(m?.content ?? '').includes(deletedCode))).toBe(true)

    // Delete it
    await helper.apiDelete(`/api/projects/${projectId}/agents/${agentId}/memories/${memory.id}`)

    // Verify it's gone from API
    const after = await helper.apiGet(`/api/projects/${projectId}/agents/${agentId}/memories`)
    expect(after.some((m: any) => String(m?.content ?? '').includes(deletedCode))).toBe(false)

    // New conversation: ask about the deleted info
    const conv = await helper.createConversationViaApi(projectId, agentId, 'recall deleted')
    const { response } = await helper.sendChatViaApi(
      projectId,
      agentId,
      conv.id,
      'What is my favorite number? Check your memory.',
      TIMEOUTS.AI_RESPONSE,
    )

    // The unique code should NOT appear in the response
    expect(response).not.toContain(deletedCode)
  })
})
