import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures'
import { TIMEOUTS } from '../constants'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

async function reloadAgents(window: Page, projectId: string) {
  await window.evaluate(async (pid: string) => {
    const store = (window as any).__GOLEMANCY_STORE__
    await store?.getState()?.loadAgents(pid)
  }, projectId)
}

test.describe('Agent Status', () => {
  test.skip(!hasApiKeys, 'Status E2E requires API keys in .env.e2e.local')

  test('agent status syncs across list, detail, and dashboard while running', async ({ helper, window }) => {
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
    await reloadAgents(window, projectId)
    const agentCard = window.locator(`[data-testid="agent-item-${agent.id}"]`)
    const listStatus = window.locator(`[data-testid="agent-list-status-${agent.id}"]`)
    const listStatusBar = window.locator(`[data-testid="agent-list-status-bar-${agent.id}"]`)
    await expect(agentCard).toBeVisible()
    await expect(listStatus).toHaveAttribute('data-agent-status', 'idle')
    await expect(listStatusBar).toHaveAttribute('data-agent-status', 'idle')
    await expect(listStatusBar).toHaveClass(/bg-text-secondary/)

    await agentCard.click()
    const detailStatus = window.locator('[data-testid="agent-detail-status"]')
    const detailStatusBar = window.locator('[data-testid="agent-detail-status-bar"]')
    await expect(detailStatus).toHaveAttribute('data-agent-status', 'idle')
    await expect(detailStatusBar).toHaveAttribute('data-agent-status', 'idle')
    await expect(detailStatusBar).toHaveClass(/bg-text-secondary/)

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
      async () => await detailStatus.getAttribute('data-agent-status'),
      { timeout: 20_000, intervals: [250, 500, 1000] },
    ).toBe('running')
    await expect(detailStatusBar).toHaveAttribute('data-agent-status', 'running')
    await expect(detailStatusBar).toHaveClass(/bg-accent-green/)
    await expect(detailStatusBar).toHaveClass(/pixel-pulse/)

    await helper.clickNav('agents')
    await expect.poll(
      async () => await listStatus.getAttribute('data-agent-status'),
      { timeout: 20_000, intervals: [250, 500, 1000] },
    ).toBe('running')
    await expect(listStatusBar).toHaveAttribute('data-agent-status', 'running')
    await expect(listStatusBar).toHaveClass(/bg-accent-green/)
    await expect(listStatusBar).toHaveClass(/pixel-pulse/)

    await helper.clickNav('dashboard')
    await expect(window.getByText('TOKEN USAGE')).toBeVisible()
    await expect(window.locator('[data-testid="runtime-status-panel"]')).toBeVisible()
    await expect(window.getByText('Status Long Run').first()).toBeVisible({ timeout: 15_000 })
    await expect(window.getByText('@Status Agent').first()).toBeVisible()

    const result = await helper.waitForBackgroundChat(
      projectId,
      conversation.id,
      backgroundRunId,
      TIMEOUTS.AI_RESPONSE + 45_000,
    )
    expect(result.response).toContain(marker)

    await expect(window.getByRole('button', { name: 'Recent' })).toBeVisible()
    await window.getByRole('button', { name: 'Recent' }).click()
    await expect(window.getByText('Status Long Run').first()).toBeVisible({ timeout: 15_000 })

    await helper.clickNav('agents')
    await reloadAgents(window, projectId)
    await expect.poll(
      async () => await listStatus.getAttribute('data-agent-status'),
      { timeout: 20_000, intervals: [250, 500, 1000] },
    ).toBe('idle')
    await expect(listStatusBar).toHaveAttribute('data-agent-status', 'idle')
    await expect(listStatusBar).toHaveClass(/bg-text-secondary/)

    await agentCard.click()
    await expect(detailStatus).toHaveAttribute('data-agent-status', 'idle')
    await expect(detailStatusBar).toHaveAttribute('data-agent-status', 'idle')
    await expect(detailStatusBar).toHaveClass(/bg-text-secondary/)

    const persistedConversation = await helper.apiGet(`/api/projects/${projectId}/conversations/${conversation.id}`)
    expect(persistedConversation.id).toBe(conversation.id)
  })

  test('agent error state appears in list, detail, and dashboard recent activity', async ({ helper, window }) => {
    test.setTimeout(120_000)

    await helper.goHome()
    const projectId = await helper.createProject('Agent Status Error Test')
    const agent = await helper.createAgentViaApi(projectId, 'Broken Status Agent', {
      systemPrompt: 'You are a test agent.',
      modelConfig: { provider: 'missing-provider', model: 'missing-model' },
      builtinTools: {
        bash: false,
        browser: false,
        task: false,
        memory: false,
        computer_use: false,
      },
    })
    const conversation = await helper.createConversationViaApi(projectId, agent.id, 'Status Error Run')

    await helper.clickNav('agents')
    await reloadAgents(window, projectId)
    const agentCard = window.locator(`[data-testid="agent-item-${agent.id}"]`)
    const listStatus = window.locator(`[data-testid="agent-list-status-${agent.id}"]`)
    const listStatusBar = window.locator(`[data-testid="agent-list-status-bar-${agent.id}"]`)
    await expect(agentCard).toBeVisible()
    await expect(listStatus).toHaveAttribute('data-agent-status', 'idle')

    await expect(
      helper.sendChatViaApiBuffered(
        projectId,
        agent.id,
        conversation.id,
        'Say hello.',
        TIMEOUTS.AI_RESPONSE,
      ),
    ).rejects.toThrow(/PROVIDER_NOT_CONFIGURED|Provider/)

    await expect.poll(
      async () => await listStatus.getAttribute('data-agent-status'),
      { timeout: 15_000, intervals: [250, 500, 1000] },
    ).toBe('error')
    await expect(listStatusBar).toHaveAttribute('data-agent-status', 'error')
    await expect(listStatusBar).toHaveClass(/bg-accent-red/)

    await agentCard.click()
    const detailStatus = window.locator('[data-testid="agent-detail-status"]')
    const detailStatusBar = window.locator('[data-testid="agent-detail-status-bar"]')
    await expect(detailStatus).toHaveAttribute('data-agent-status', 'error')
    await expect(detailStatusBar).toHaveAttribute('data-agent-status', 'error')
    await expect(detailStatusBar).toHaveClass(/bg-accent-red/)

    await helper.clickNav('dashboard')
    await expect(window.locator('[data-testid="runtime-status-panel"]')).toBeVisible()
    await window.getByRole('button', { name: 'Recent' }).click()
    await expect(window.getByText('Status Error Run').first()).toBeVisible({ timeout: 15_000 })
    await expect(window.getByText('@Broken Status Agent').first()).toBeVisible()

    const runtimeStatus = await helper.apiGet(`/api/projects/${projectId}/dashboard/runtime-status`)
    const failedChat = runtimeStatus.recentCompleted.find((item: any) =>
      item.type === 'chat' && item.id === conversation.id,
    )
    expect(failedChat).toBeTruthy()
    expect(failedChat.status).toBe('error')
  })
})
