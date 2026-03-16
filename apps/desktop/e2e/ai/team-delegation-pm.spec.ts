import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('PM Team Delegation', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  test('PM delegates to two members and returns both member outputs', async ({ helper }) => {
    test.setTimeout(180_000)

    await helper.goHome()
    const project = await helper.createProjectViaApi('PM Delegation Team Test')
    const projectId = project.id

    const pm = await helper.createToolAgent(projectId, 'Project Manager', {
      systemPrompt:
        'You are a project manager. You must delegate to both specialists before answering. Your final response must include both specialist tokens verbatim.',
    })
    const analyst = await helper.createToolAgent(projectId, 'Analyst', {
      systemPrompt:
        'You are the analyst. For any delegated request, reply with exactly: ANALYST_TOKEN::market-validated',
    })
    const executor = await helper.createToolAgent(projectId, 'Executor', {
      systemPrompt:
        'You are the executor. For any delegated request, reply with exactly: EXECUTOR_TOKEN::implementation-ready',
    })

    const team = await helper.apiPost(`/api/projects/${projectId}/teams`, {
      name: 'Launch Team',
      description: 'PM with analyst and executor',
      instruction: 'Always have the PM gather specialist outputs before concluding.',
      members: [
        { agentId: pm.id },
        { agentId: analyst.id, parentAgentId: pm.id },
        { agentId: executor.id, parentAgentId: pm.id },
      ],
    })

    const { response, events } = await helper.createTeamChatViaApi(
      projectId,
      team.id,
      'Can this launch execute today? Ask both specialists and summarize their readiness.',
      TIMEOUTS.AI_RESPONSE,
    )

    const delegationEvents = events.filter(
      event =>
        event.type === 'tool_call' &&
        typeof event.data?.toolName === 'string' &&
        event.data.toolName.includes('delegate_to_'),
    )

    expect(
      delegationEvents.some(event => String(event.data.toolName).includes(analyst.id)),
    ).toBe(true)
    expect(
      delegationEvents.some(event => String(event.data.toolName).includes(executor.id)),
    ).toBe(true)
    expect(response).toContain('ANALYST_TOKEN::market-validated')
    expect(response).toContain('EXECUTOR_TOKEN::implementation-ready')
  })
})
