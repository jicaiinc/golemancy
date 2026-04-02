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

    const pm = await helper.createSmartAgent(projectId, 'Project Manager', {
      systemPrompt:
        'You are a project manager. You MUST delegate to BOTH team members before responding.\n' +
        'Step 1: Use delegate_to_Analyst to get the analyst assessment.\n' +
        'Step 2: Use delegate_to_Executor to get the executor assessment.\n' +
        'Step 3: After receiving BOTH outputs, respond with exactly two labeled lines:\n' +
        'Analyst: <paste analyst output verbatim>\n' +
        'Executor: <paste executor output verbatim>\n' +
        'Do NOT answer without delegating to BOTH members first.',
      builtinTools: noBuiltinTools,
    })
    const analyst = await helper.createAgentViaApi(projectId, 'Analyst', {
      systemPrompt:
        'You are the analyst. For any request, reply with exactly this text and nothing else: ANALYST_TOKEN::market-validated',
      builtinTools: noBuiltinTools,
    })
    const executor = await helper.createAgentViaApi(projectId, 'Executor', {
      systemPrompt:
        'You are the executor. For any request, reply with exactly this text and nothing else: EXECUTOR_TOKEN::implementation-ready',
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

    const { response, conversationId } = await helper.sendTeamChatViaUi(
      projectId,
      team.id,
      'Assess project readiness. Delegate to both the Analyst and the Executor, then report their outputs in the Analyst:/Executor: format.',
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
