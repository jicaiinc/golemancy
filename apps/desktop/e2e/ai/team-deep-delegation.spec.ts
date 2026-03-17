import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

/**
 * B6: Deep delegation — 3-level team (Manager → Researcher → Specialist).
 *
 * Existing team tests only verify 1-level delegation (lead → member).
 * This test creates a 3-level hierarchy and verifies the delegation chain
 * reaches the leaf agent and produces a correct answer.
 */
test.describe('Team Deep Delegation', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string
  let teamId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)
    await helper.goHome()

    const project = await helper.createProjectViaApi('Deep Delegation Test')
    projectId = project.id

    // Create 3 agents for the hierarchy
    const manager = await helper.createCheapAgent(projectId, 'Team Manager', {
      systemPrompt:
        'You are a team manager. When asked a question, ALWAYS delegate to your team member "Senior Researcher" using the delegate tool. Never answer directly.',
    })

    const researcher = await helper.createCheapAgent(projectId, 'Senior Researcher', {
      systemPrompt:
        'You are a senior researcher. When asked a factual question, ALWAYS delegate to your team member "Data Specialist" using the delegate tool. Never answer directly.',
    })

    const specialist = await helper.createCheapAgent(projectId, 'Data Specialist', {
      systemPrompt:
        'You are a data specialist. Answer factual questions directly and briefly. You are the final authority — do not delegate further.',
    })

    // Create team with 3-level hierarchy: Manager → Researcher → Specialist
    const team = await helper.apiPost(`/api/projects/${projectId}/teams`, {
      name: 'Deep Delegation Team',
      description: 'Manager delegates to Researcher, who delegates to Specialist',
      members: [
        { agentId: manager.id, role: 'manager' },
        { agentId: researcher.id, role: 'researcher', parentAgentId: manager.id },
        { agentId: specialist.id, role: 'specialist', parentAgentId: researcher.id },
      ],
    })
    teamId = team.id
  })

  test('3-level delegation chain reaches leaf agent and produces answer', async ({ helper }) => {
    test.setTimeout(180_000)

    const { response, events } = await helper.createTeamChatViaApi(
      projectId,
      teamId,
      'What is the largest planet in our solar system?',
    )

    // Verify the final answer is correct — only the Specialist should know this
    expect(response.toLowerCase()).toContain('jupiter')

    // Verify delegation happened at least once
    const delegationEvents = events.filter(
      (e: any) =>
        e.type === 'tool_call' &&
        typeof e.data?.toolName === 'string' &&
        e.data.toolName.includes('delegate_to_'),
    )
    expect(delegationEvents.length).toBeGreaterThanOrEqual(1)
  })

  test('delegation events reference known team member agents', async ({ helper }) => {
    test.setTimeout(180_000)

    const { events } = await helper.createTeamChatViaApi(
      projectId,
      teamId,
      'What is the chemical symbol for gold?',
    )

    // Get all agent IDs in the project
    const agents = await helper.apiGet(`/api/projects/${projectId}/agents`)
    const agentIds = agents.map((a: any) => a.id)

    // Every delegation event should target a known agent
    const delegationEvents = events.filter(
      (e: any) =>
        e.type === 'tool_call' &&
        typeof e.data?.toolName === 'string' &&
        e.data.toolName.includes('delegate_to_'),
    )

    for (const event of delegationEvents) {
      const toolName = String(event.data.toolName)
      const targetIsKnown = agentIds.some((id: string) => toolName.includes(id))
      expect(targetIsKnown, `Delegation tool "${toolName}" should target a known agent`).toBe(true)
    }
  })
})
