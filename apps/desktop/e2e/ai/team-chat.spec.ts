import { test, expect } from '../fixtures'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Team Chat', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string
  let leaderId: string
  let researcherId: string
  let teamId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)

    await helper.goHome()
    const project = await helper.createProjectViaApi('Team Chat Test')
    projectId = project.id

    // Create leader agent — must delegate to team member
    const leader = await helper.createSmartAgent(projectId, 'Team Leader', {
      systemPrompt:
        'You are a team leader. You MUST NOT answer any question yourself. For EVERY user message, you MUST use the delegate_to tool to forward the question to your team member. Always delegate, never respond directly.',
    })
    leaderId = leader.id

    // Create researcher agent — answers directly
    const researcher = await helper.createSmartAgent(projectId, 'Researcher', {
      systemPrompt:
        'You are a researcher. Answer questions in one short sentence.',
    })
    researcherId = researcher.id

    // Create team with hierarchy: leader → researcher
    const team = await helper.createTeamViaApi(projectId, 'Research Team', [
      { agentId: leaderId },
      { agentId: researcherId, parentAgentId: leaderId },
    ])
    teamId = team.id
  })

  test('team chat triggers sub-agent delegation via tool call', async ({ helper }) => {
    test.setTimeout(120_000)

    const { response, conversationId } = await helper.sendTeamChatViaUi(
      projectId,
      teamId,
      'What is 2+2?',
    )

    // Response should exist
    expect(response.length).toBeGreaterThan(0)

    // Sub-agent display should be visible in DOM
    expect(await helper.hasToolCall()).toBe(true)

    // Verify sub-agent conversation was created via API
    const conversations = await helper.apiGet(`/api/projects/${projectId}/conversations`)
    const subAgentConversation = conversations.find(
      (conv: any) =>
        conv.id !== conversationId &&
        conv.targetType === 'agent' &&
        conv.targetId === researcherId &&
        (conv.title ?? '').includes('Researcher'),
    )
    expect(subAgentConversation).toBeTruthy()

    const subAgentMessages = await helper.getConversationMessages(projectId, subAgentConversation.id)
    const subAgentAssistant = [...subAgentMessages].reverse().find((message: any) => message?.role === 'assistant')
    expect(String(subAgentAssistant?.content ?? '').trim().length).toBeGreaterThan(0)
  })

  test('team chat returns a meaningful response', async ({ helper }) => {
    test.setTimeout(120_000)

    const { response } = await helper.sendTeamChatViaUi(
      projectId,
      teamId,
      'What is the capital of France? Reply in one word.',
    )

    // The researcher should have answered through delegation
    expect(response.toLowerCase()).toContain('paris')
  })
})
