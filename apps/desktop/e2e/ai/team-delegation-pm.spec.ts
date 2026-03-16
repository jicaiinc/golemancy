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

    const noBuiltinTools = {
      bash: false,
      browser: false,
      task: false,
      memory: false,
      computer_use: false,
    }

    const pm = await helper.createAgentViaApi(projectId, 'Project Manager', {
      systemPrompt:
        'You are a project manager. You must delegate to both specialists before answering. Ignore workspace state and project files. Your final response must have exactly two labeled lines, one starting with "Analyst:" and one starting with "Executor:". Copy each specialist output verbatim.',
      builtinTools: noBuiltinTools,
    })
    const analyst = await helper.createAgentViaApi(projectId, 'Analyst', {
      systemPrompt:
        'You are the analyst. Ignore workspace state, files, and tasks. For any delegated request, reply with exactly: ANALYST_TOKEN::market-validated',
      builtinTools: noBuiltinTools,
    })
    const executor = await helper.createAgentViaApi(projectId, 'Executor', {
      systemPrompt:
        'You are the executor. Ignore workspace state, files, and tasks. Never ask follow-up questions. For any delegated request, reply with exactly: EXECUTOR_TOKEN::implementation-ready',
      builtinTools: noBuiltinTools,
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

    const { response, conversationId } = await helper.createTeamChatViaApi(
      projectId,
      team.id,
      'Can the Phoenix launch execute today? Ask both specialists and summarize their readiness in the required Analyst/Executor format using each specialist output verbatim.',
      TIMEOUTS.AI_RESPONSE,
    )

    const conversations = await helper.apiGet(`/api/projects/${projectId}/conversations`)
    const analystConversation = conversations.find(
      (conv: any) =>
        conv.id !== conversationId &&
        conv.targetType === 'agent' &&
        conv.targetId === analyst.id &&
        conv.title === '[Sub-agent] Analyst',
    )
    const executorConversation = conversations.find(
      (conv: any) =>
        conv.id !== conversationId &&
        conv.targetType === 'agent' &&
        conv.targetId === executor.id &&
        conv.title === '[Sub-agent] Executor',
    )
    expect(analystConversation).toBeTruthy()
    expect(executorConversation).toBeTruthy()

    const specialistOutputs = await helper.pollUntil(
      async () => {
        const analystMessages = await helper.getConversationMessages(projectId, analystConversation.id)
        const executorMessages = await helper.getConversationMessages(projectId, executorConversation.id)
        const analystAssistant = [...analystMessages].reverse().find((message: any) => message?.role === 'assistant')
        const executorAssistant = [...executorMessages].reverse().find((message: any) => message?.role === 'assistant')
        return {
          analystOutput: String(analystAssistant?.content ?? '').trim(),
          executorOutput: String(executorAssistant?.content ?? '').trim(),
        }
      },
      ({ analystOutput, executorOutput }) => analystOutput.length > 0 && executorOutput.length > 0,
      { intervalMs: 250, timeoutMs: TIMEOUTS.AI_RESPONSE },
    )
    const { analystOutput, executorOutput } = specialistOutputs
    expect(analystOutput.length).toBeGreaterThan(0)
    expect(analystOutput).not.toMatch(/could you please|what launch|more details/i)
    expect(executorOutput.length).toBeGreaterThan(0)
    expect(executorOutput).not.toMatch(/could you please|what launch|more details/i)

    expect(response).toContain('Analyst:')
    expect(response).toContain('Executor:')
    expect(response).toContain(analystOutput)
    expect(response).toContain(executorOutput)
  })
})
