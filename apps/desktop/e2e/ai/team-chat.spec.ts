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
        'You are a team leader. When you receive any question, you MUST delegate it to your team member using the delegation tool available to you. Never answer directly.',
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

    const { response, events } = await helper.createTeamChatViaApi(
      projectId,
      teamId,
      'What is 2+2?',
    )

    // Response should exist
    expect(response.length).toBeGreaterThan(0)

    // Verify delegation happened: look for tool_call events with delegate_to_ in the name
    const delegationEvents = events.filter(
      e => e.type === 'tool_call' && typeof e.data?.toolName === 'string' && e.data.toolName.includes('delegate_to_'),
    )
    expect(delegationEvents.length).toBeGreaterThanOrEqual(1)
  })

  test('team chat returns a meaningful response', async ({ helper }) => {
    test.setTimeout(120_000)

    const { response } = await helper.createTeamChatViaApi(
      projectId,
      teamId,
      'What is the capital of France? Reply in one word.',
    )

    // The researcher should have answered through delegation
    expect(response.toLowerCase()).toContain('paris')
  })
})
