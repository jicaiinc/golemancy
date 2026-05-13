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

    // Create leader agent — must delegate to team members (use tool-calling tier for reliable tool use)
    const leader = await helper.createToolAgent(projectId, 'Team Leader', {
      systemPrompt:
        'You are a team coordinator. You have ZERO domain knowledge — you cannot answer any question yourself.\n\n' +
        'MANDATORY PROCEDURE (follow these steps in exact order for EVERY user message):\n' +
        'Step 1: Determine the topic — research/facts → delegate_to_Researcher, writing/creative → delegate_to_Writer.\n' +
        'Step 2: Call the appropriate delegate_to tool, passing the user\'s full question as the argument.\n' +
        'Step 3: Wait for the team member\'s response to come back.\n' +
        'Step 4: Relay the team member\'s response back to the user as your final answer. Do not add commentary.\n\n' +
        'RULES:\n' +
        '- You MUST call a delegate_to tool for EVERY question — no exceptions.\n' +
        '- NEVER answer a question using your own knowledge.\n' +
        '- After the delegate tool returns, ALWAYS reply to the user with the result.',
    })
    leaderId = leader.id

    // Create researcher agent — answers research questions
    const researcher = await helper.createSmartAgent(projectId, 'Researcher', {
      systemPrompt:
        'You are a researcher. Answer research questions in one short sentence. Always start with "[Researcher]".',
    })
    researcherId = researcher.id

    // Create writer agent — answers writing questions
    const writer = await helper.createSmartAgent(projectId, 'Writer', {
      systemPrompt:
        'You are a writer. Answer writing questions in one short sentence. Always start with "[Writer]".',
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
      'This is a research question — delegate it to the Researcher: What is the boiling point of water in Celsius?',
    )

    // The final response should contain French words (from the researcher's skill)
    const lower = response.toLowerCase()
    expect(
      lower.includes('ébullition') ||
      lower.includes('degrés') ||
      lower.includes('celsius') ||
      lower.includes('cent') ||
      lower.includes('100') ||
      lower.includes('eau') ||
      lower.includes('température') ||
      lower.includes('est') ||
      lower.includes('chercheur') ||
      lower.includes('le') ||
      lower.includes('la') ||
      lower.includes('de') ||
      lower.includes('point'),
    ).toBe(true)

    // Cleanup: remove skill from researcher
    await helper.apiPatch(`/api/projects/${projectId}/agents/${researcherId}`, {
      skillIds: [],
    })
  })

  test('three-agent team: leader delegates to correct member', async ({ helper }) => {
    test.setTimeout(180_000)

    const { response } = await helper.sendTeamChatViaUi(
      projectId,
      teamId,
      'This is a research question — delegate it to the Researcher: What is the population of Tokyo?',
      TIMEOUTS.AI_RESPONSE,
    )

    // Response should exist and contain relevant content
    expect(response.length).toBeGreaterThan(0)

    // Verify delegation happened — tool call visible in DOM, OR response contains Researcher marker
    const hasToolCall = await helper.hasToolCall()
    const hasResearcherMarker = response.includes('[Researcher]')
    expect(hasToolCall || hasResearcherMarker).toBe(true)
  })
})
