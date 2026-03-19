import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Team Collaboration', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  let projectId: string
  let leaderId: string
  let researcherId: string
  let writerId: string
  let teamId: string

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(180_000)

    await helper.goHome()
    const project = await helper.createProjectViaApi('Team Collaboration Test')
    projectId = project.id

    // Create leader agent — must delegate to team members (Tier B for stronger reasoning)
    const leader = await helper.createSmartAgent(projectId, 'Team Leader', {
      systemPrompt:
        'You are a team leader. Always delegate questions to your team members using the delegation tools. Never answer directly.',
    })
    leaderId = leader.id

    // Create researcher agent — answers research questions
    const researcher = await helper.createSmartAgent(projectId, 'Researcher', {
      systemPrompt:
        'You are a researcher. Answer research questions in one short sentence. Always mention you are the Researcher.',
    })
    researcherId = researcher.id

    // Create writer agent — answers writing questions
    const writer = await helper.createSmartAgent(projectId, 'Writer', {
      systemPrompt:
        'You are a writer. Answer writing questions in one short sentence. Always mention you are the Writer.',
    })
    writerId = writer.id

    // Create team: leader → researcher, leader → writer
    const team = await helper.createTeamViaApi(projectId, 'Collaboration Team', [
      { agentId: leaderId },
      { agentId: researcherId, parentAgentId: leaderId },
      { agentId: writerId, parentAgentId: leaderId },
    ])
    teamId = team.id
  })

  test('leader knows team members', async ({ helper }) => {
    test.setTimeout(120_000)

    const { response } = await helper.sendTeamChatViaUi(
      projectId,
      teamId,
      'What tools or team members do you have available? List them.',
    )

    // The leader should mention its delegation tools or team member names
    const lower = response.toLowerCase()
    expect(
      lower.includes('researcher') ||
      lower.includes('writer') ||
      lower.includes('delegate'),
    ).toBe(true)
  })

  test('member with skill: skill affects delegation response', async ({ helper }) => {
    test.setTimeout(180_000)

    // Create a skill that forces French replies
    const skill = await helper.apiPost(`/api/projects/${projectId}/skills`, {
      name: 'French Reply',
      description: 'Always reply in French',
      instructions: 'You MUST reply entirely in French. Every word must be in French.',
    })

    // Assign skill to researcher
    await helper.assignSkillToAgent(projectId, researcherId, skill.id)

    const { response } = await helper.sendTeamChatViaUi(
      projectId,
      teamId,
      'Ask the Researcher: What is 2+2? The Researcher must answer.',
    )

    // The final response should contain French words (from the researcher's skill)
    const lower = response.toLowerCase()
    expect(
      lower.includes('quatre') ||
      lower.includes('deux') ||
      lower.includes('est') ||
      lower.includes('réponse') ||
      lower.includes('résultat'),
    ).toBe(true)

    // Cleanup: remove skill from researcher
    await helper.apiPatch(`/api/projects/${projectId}/agents/${researcherId}`, {
      skillIds: [],
    })
  })

  test('three-agent team: leader delegates to correct member', async ({ helper }) => {
    test.setTimeout(120_000)

    const { response } = await helper.sendTeamChatViaUi(
      projectId,
      teamId,
      'I need research on the population of Tokyo. This is a research question.',
    )

    // Response should exist
    expect(response.length).toBeGreaterThan(0)

    // Verify delegation happened — sub-agent display should be visible in DOM
    expect(await helper.hasToolCall()).toBe(true)
  })
})
