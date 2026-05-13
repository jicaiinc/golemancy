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

    // Create leader agent — must delegate to team member (use tool-calling tier for reliable tool use)
    const leader = await helper.createToolAgent(projectId, 'Team Leader', {
      systemPrompt:
        'You are a team coordinator. You have ZERO domain knowledge — you cannot answer any question yourself.\n\n' +
        'MANDATORY PROCEDURE (follow these steps in exact order for EVERY user message):\n' +
        'Step 1: Call the delegate_to_Researcher tool, passing the user\'s full question as the argument.\n' +
        'Step 2: Wait for the Researcher\'s response to come back.\n' +
        'Step 3: Relay the Researcher\'s response back to the user as your final answer. Do not add commentary.\n\n' +
        'RULES:\n' +
        '- You MUST call delegate_to_Researcher for EVERY question — no exceptions.\n' +
        '- NEVER answer a question using your own knowledge.\n' +
        '- After the delegate tool returns, ALWAYS reply to the user with the result.',
    })
    leaderId = leader.id

    // Create researcher agent — answers directly
    const researcher = await helper.createSmartAgent(projectId, 'Researcher', {
      systemPrompt:
        'You are a researcher. Answer questions in one short sentence. Always start your reply with "Research finding:".',
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
      'I need a research finding: What is the tallest mountain in the world? Delegate this to the Researcher.',
    )

    // Response should exist
    expect(response.length).toBeGreaterThan(0)

    // Verify delegation happened via at least one evidence path:
    // 1. Tool call visible in DOM
    const hasToolCall = await helper.hasToolCall()
    // 2. Sub-agent conversation created via API
    const conversations = await helper.apiGet(`/api/projects/${projectId}/conversations`)
    const subAgentConversation = conversations.find(
      (conv: any) =>
        conv.id !== conversationId &&
        conv.targetType === 'agent' &&
        conv.targetId === researcherId,
    )
    // 3. Response contains researcher's marker
    const hasResearcherMarker = response.includes('Research finding:')

    expect(
      hasToolCall || !!subAgentConversation || hasResearcherMarker,
      `Delegation evidence: toolCall=${hasToolCall}, subConv=${!!subAgentConversation}, marker=${hasResearcherMarker}`,
    ).toBe(true)

    // If sub-agent conversation exists, verify it has a response
    if (subAgentConversation) {
      const subAgentMessages = await helper.getConversationMessages(projectId, subAgentConversation.id)
      const subAgentAssistant = [...subAgentMessages].reverse().find((message: any) => message?.role === 'assistant')
      expect(String(subAgentAssistant?.content ?? '').trim().length).toBeGreaterThan(0)
    }
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
