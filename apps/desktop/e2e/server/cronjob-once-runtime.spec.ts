import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Cron Job Runtime', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  test('one-time cron job auto-runs, records history, and disables itself', async ({ helper }) => {
    test.setTimeout(180_000)

    await helper.goHome()
    const project = await helper.createProjectViaApi('Cron Once Runtime Test')
    const projectId = project.id
    const marker = `CRON_ONCE_${Date.now()}`

    const agent = await helper.createCheapAgent(projectId, 'Once Cron Agent', {
      systemPrompt: 'Reply with the exact requested marker and nothing else.',
    })

    const job = await helper.apiPost(`/api/projects/${projectId}/cron-jobs`, {
      name: 'One-Time Runtime Check',
      targetType: 'agent',
      targetId: agent.id,
      cronExpression: '0 0 1 1 *',
      enabled: true,
      scheduleType: 'once',
      scheduledAt: new Date(Date.now() + 30_000).toISOString(),
      instruction: `Reply with exactly: ${marker}`,
    })

    const runs = await helper.pollUntil(
      () => helper.apiGet(`/api/projects/${projectId}/cron-jobs/${job.id}/runs`),
      (items: any[]) => items.length > 0 && items[0].status !== 'running',
      { intervalMs: 1_500, timeoutMs: TIMEOUTS.CRON_EXECUTION + 45_000 },
    )

    expect(runs.length).toBeGreaterThan(0)
    expect(runs[0].triggeredBy).toBe('schedule')
    expect(runs[0].status).toBe('success')
    expect(runs[0].conversationId).toBeTruthy()

    const messages = await helper.getConversationMessages(projectId, runs[0].conversationId)
    const assistantMessage = [...messages].reverse().find((message: any) => message?.role === 'assistant')
    expect(assistantMessage).toBeTruthy()
    expect(String(assistantMessage?.content ?? '')).toContain(marker)

    const refreshedJob = await helper.apiGet(`/api/projects/${projectId}/cron-jobs/${job.id}`)
    expect(refreshedJob.enabled).toBe(false)
    expect(refreshedJob.lastRunStatus).toBe('success')
  })

  test('team-target cron job triggers delegation and stores the delegated run', async ({ helper }) => {
    test.setTimeout(180_000)

    await helper.goHome()
    const project = await helper.createProjectViaApi('Cron Team Runtime Test')
    const projectId = project.id

    const noBuiltinTools = {
      bash: false,
      browser: false,
      task: false,
      memory: false,
      computer_use: false,
    }

    const leader = await helper.createAgentViaApi(projectId, 'Team Cron Lead', {
      systemPrompt:
        'You are a team lead. Always delegate to the specialist before producing the final answer. Ignore workspace state. Your final response must start with "Specialist:" followed by the specialist output.',
      builtinTools: noBuiltinTools,
    })
    const specialist = await helper.createAgentViaApi(projectId, 'Cron Specialist', {
      systemPrompt:
        'You are the specialist. Ignore workspace state, files, and tasks. For any delegated task, reply with exactly: TEAM_CRON_TOKEN::delegate-ok',
      builtinTools: noBuiltinTools,
    })

    const team = await helper.apiPost(`/api/projects/${projectId}/teams`, {
      name: 'Cron Team',
      description: 'Team target for cron execution',
      instruction: 'Delegate the execution to the specialist before concluding.',
      members: [
        { agentId: leader.id },
        { agentId: specialist.id, parentAgentId: leader.id },
      ],
    })

    const job = await helper.apiPost(`/api/projects/${projectId}/cron-jobs`, {
      name: 'Team Delegation Cron',
      targetType: 'team',
      targetId: team.id,
      cronExpression: '0 0 1 1 *',
      enabled: false,
      scheduleType: 'cron',
      instruction: 'Coordinate the team, ask the specialist for readiness, and return the final answer in the required Specialist format.',
    })

    const triggerResult = await helper.apiPost(`/api/projects/${projectId}/cron-jobs/${job.id}/trigger`, {})
    expect(triggerResult.ok).toBe(true)

    const runs = await helper.pollUntil(
      () => helper.apiGet(`/api/projects/${projectId}/cron-jobs/${job.id}/runs`),
      (items: any[]) => items.length > 0 && items[0].status !== 'running',
      { intervalMs: 1_500, timeoutMs: TIMEOUTS.CRON_EXECUTION },
    )

    expect(runs.length).toBeGreaterThan(0)
    expect(runs[0].triggeredBy).toBe('manual')
    expect(runs[0].status).toBe('success')
    expect(runs[0].agentId).toBe(leader.id)
    expect(runs[0].conversationId).toBeTruthy()

    const assistantMessage = await helper.getLastAssistantMessage(projectId, runs[0].conversationId)
    expect(String(assistantMessage?.content ?? '')).toContain('Specialist:')

    const conversations = await helper.apiGet(`/api/projects/${projectId}/conversations`)
    const specialistConversation = conversations.find(
      (conv: any) =>
        conv.id !== runs[0].conversationId &&
        conv.targetType === 'agent' &&
        conv.targetId === specialist.id &&
        conv.title === '[Sub-agent] Cron Specialist',
    )
    expect(specialistConversation).toBeTruthy()

    const specialistMessages = await helper.getConversationMessages(projectId, specialistConversation.id)
    const specialistAssistant = [...specialistMessages].reverse().find((message: any) => message?.role === 'assistant')
    expect(String(specialistAssistant?.content ?? '').trim().length).toBeGreaterThan(0)
  })
})
