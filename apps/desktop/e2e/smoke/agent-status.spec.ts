import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

test.describe('Agent Status', () => {
  test.skip(!hasApiKeys, 'Status E2E requires API keys in .env.e2e.local')

  test('agent status transitions idle -> running -> idle and shows on dashboard', async ({ helper, window }) => {
    test.setTimeout(180_000)

    await helper.goHome()
    const projectId = await helper.createProject('Agent Status Test')
    const marker = `STATUS_DONE_${Date.now()}`

    const agent = await helper.createToolAgent(projectId, 'Status Agent', {
      systemPrompt: [
        'You are a command-running agent.',
        'When the user asks you to execute a shell command, you must use the bash tool immediately.',
        'Do not explain the plan before calling bash.',
        'Keep your final answer short and include the command output.',
      ].join(' '),
      builtinTools: {
        bash: true,
        browser: false,
        task: false,
        memory: false,
        computer_use: false,
      },
    })

    const conversation = await helper.createConversationViaApi(projectId, agent.id, 'Status Long Run')

    await helper.clickNav('agents')
    await window.evaluate(async (pid: string) => {
      const store = (window as any).__GOLEMANCY_STORE__
      await store?.getState()?.loadAgents(pid)
    }, projectId)
    const agentCard = window.locator(`[data-testid="agent-item-${agent.id}"]`)
    await expect(agentCard).toBeVisible()
    await expect(agentCard).toContainText('idle')

    const backgroundRunId = await helper.startChatViaApiInBackground(
      projectId,
      agent.id,
      conversation.id,
      [
        'Use the bash tool to run this exact shell command and then return only its output:',
        `"sleep 8; printf '${marker}'"`,
      ].join(' '),
      TIMEOUTS.AI_RESPONSE + 30_000,
    )

    await expect.poll(
      async () => ((await agentCard.textContent()) ?? '').toLowerCase(),
      { timeout: 20_000, intervals: [250, 500, 1000] },
    ).toContain('running')

    await helper.clickNav('dashboard')
    await expect(window.getByText('TOKEN USAGE')).toBeVisible()
    await expect(window.getByText('ACTIVITY')).toBeVisible()
    await expect(window.getByText('Status Long Run').first()).toBeVisible({ timeout: 15_000 })
    await expect(window.getByText('@Status Agent').first()).toBeVisible()

    const result = await helper.waitForBackgroundChat(
      projectId,
      conversation.id,
      backgroundRunId,
      TIMEOUTS.AI_RESPONSE + 45_000,
    )
    expect(result.response).toContain(marker)

    await helper.clickNav('agents')
    await window.evaluate(async (pid: string) => {
      const store = (window as any).__GOLEMANCY_STORE__
      await store?.getState()?.loadAgents(pid)
    }, projectId)
    await expect.poll(
      async () => ((await agentCard.textContent()) ?? '').toLowerCase(),
      { timeout: 20_000, intervals: [250, 500, 1000] },
    ).toContain('idle')

    const persistedConversation = await helper.apiGet(`/api/projects/${projectId}/conversations/${conversation.id}`)
    expect(persistedConversation.id).toBe(conversation.id)
  })
})
