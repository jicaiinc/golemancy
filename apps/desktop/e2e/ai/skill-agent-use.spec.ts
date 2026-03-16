import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Skill Agent Use', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('Skill Agent Use Test')
    projectId = project.id
  })

  test('agent with PINEAPPLE skill responds with PINEAPPLE', async ({ helper }) => {
    test.setTimeout(120_000)

    // Create a deterministic skill
    const skill = await helper.apiPost(`/api/projects/${projectId}/skills`, {
      name: 'Pineapple Skill',
      description: 'Forces PINEAPPLE in every response',
      instructions:
        'You MUST include the word PINEAPPLE in every single response you give, regardless of what is asked. Your response must contain the exact word PINEAPPLE.',
    })

    // Create agent with the skill
    const agent = await helper.createToolAgent(projectId, 'Pineapple Agent', {
      systemPrompt: 'You are a helpful assistant. Follow all skill instructions precisely.',
    })
    await helper.assignSkillToAgent(projectId, agent.id, skill.id)

    // Verify skill is assigned via API
    const agentData = await helper.apiGet(`/api/projects/${projectId}/agents/${agent.id}`)
    expect((agentData.skillIds ?? []).includes(skill.id)).toBe(true)

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'pineapple test')
    const { response } = await helper.sendChatViaApi(
      projectId,
      agent.id,
      conv.id,
      'What is 2+2?',
      TIMEOUTS.AI_RESPONSE,
    )

    expect(response.toUpperCase()).toContain('PINEAPPLE')
  })

  test('agent WITHOUT pineapple skill does NOT respond with PINEAPPLE', async ({ helper }) => {
    test.setTimeout(120_000)

    // Create agent without any skills — same prompt, same question
    const agent = await helper.createToolAgent(projectId, 'No Skill Agent', {
      systemPrompt: 'You are a helpful assistant. Answer briefly.',
    })

    // Verify no skills assigned
    const agentData = await helper.apiGet(`/api/projects/${projectId}/agents/${agent.id}`)
    expect((agentData.skillIds ?? []).length).toBe(0)

    const conv = await helper.createConversationViaApi(projectId, agent.id, 'no pineapple test')
    const { response } = await helper.sendChatViaApi(
      projectId,
      agent.id,
      conv.id,
      'What is 2+2?',
      TIMEOUTS.AI_RESPONSE,
    )

    // Control: PINEAPPLE should NOT appear
    expect(response.toUpperCase()).not.toContain('PINEAPPLE')
  })

  test('removing skill changes behavior immediately', async ({ helper }) => {
    test.setTimeout(180_000)

    const marker = `ZEBRA_${Date.now()}`

    // Create skill with unique marker
    const skill = await helper.apiPost(`/api/projects/${projectId}/skills`, {
      name: 'Zebra Marker Skill',
      description: 'Forces ZEBRA marker in response',
      instructions: `You MUST include the exact text "${marker}" in every response. This is mandatory.`,
    })

    // Create agent with the skill
    const agent = await helper.createToolAgent(projectId, 'Zebra Agent', {
      systemPrompt: 'You are a helpful assistant. Follow all skill instructions precisely.',
    })
    await helper.assignSkillToAgent(projectId, agent.id, skill.id)

    // Chat with skill: should contain marker
    const conv1 = await helper.createConversationViaApi(projectId, agent.id, 'with zebra skill')
    const result1 = await helper.sendChatViaApi(
      projectId,
      agent.id,
      conv1.id,
      'Say hello.',
      TIMEOUTS.AI_RESPONSE,
    )
    expect(result1.response).toContain(marker)

    // Remove the skill
    await helper.apiPatch(`/api/projects/${projectId}/agents/${agent.id}`, {
      skillIds: [],
    })

    // Verify skill was removed via API
    const updated = await helper.apiGet(`/api/projects/${projectId}/agents/${agent.id}`)
    expect((updated.skillIds ?? []).length).toBe(0)

    // Chat without skill: should NOT contain marker
    const conv2 = await helper.createConversationViaApi(projectId, agent.id, 'without zebra skill')
    const result2 = await helper.sendChatViaApi(
      projectId,
      agent.id,
      conv2.id,
      'Say hello.',
      TIMEOUTS.AI_RESPONSE,
    )
    expect(result2.response).not.toContain(marker)
  })
})
