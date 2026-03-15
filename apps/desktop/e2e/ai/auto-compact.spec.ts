import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Auto Compact', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string
  let agentId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('Auto Compact Test')
    projectId = project.id

    // Create agent with low compactThreshold to trigger auto-compact
    const agent = await helper.createCheapAgent(projectId, 'Compact Agent', {
      systemPrompt: 'You are a helpful assistant. Always give detailed answers of at least 3 sentences.',
      compactThreshold: 5000,
    })
    agentId = agent.id
  })

  test('auto compact triggers after multiple rounds exceeding threshold', async ({ helper }) => {
    test.setTimeout(300_000) // generous timeout for multiple rounds

    const conv = await helper.apiPost(`/api/projects/${projectId}/conversations`, {
      targetType: 'agent',
      targetId: agentId,
      title: 'Auto Compact Trigger',
    })

    // Questions designed to generate longer responses to build up context quickly
    const questions = [
      'Explain the concept of recursion in programming with examples.',
      'What are the main differences between TCP and UDP protocols?',
      'Describe the MVC architecture pattern and its benefits.',
      'How does garbage collection work in modern programming languages?',
      'What are microservices and how do they compare to monolithic architecture?',
    ]

    let compactEventFound = false

    // Send multiple rounds; check each for compact events
    for (let i = 0; i < questions.length; i++) {
      const result = await helper.sendChatViaApi(
        projectId, agentId, conv.id,
        questions[i],
        TIMEOUTS.AI_RESPONSE,
      )

      // Check if any compact-related event appeared
      const hasCompact = result.events.some(
        (e) => e.type.includes('compact') || (e.data?.type && String(e.data.type).includes('compact')),
      )

      if (hasCompact) {
        compactEventFound = true
        break
      }
    }

    // Auto-compact should have triggered by now (5000 token threshold)
    // If not triggered via events, check compact records via API
    if (!compactEventFound) {
      const convData = await helper.apiGet(
        `/api/projects/${projectId}/conversations/${conv.id}`,
      )
      // compactRecords is attached by the GET route
      compactEventFound = Array.isArray(convData.compactRecords) && convData.compactRecords.length > 0
    }

    expect(compactEventFound).toBe(true)
  })
})
