import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { MAIN_ENTRY, ROOT_DIR, TIMEOUTS } from '../constants'
import { ConsoleLogger, TestHelper } from '../fixtures'
import { getNodePath } from '../fixtures/platform'

type Session = {
  app: ElectronApplication
  page: Page
  helper: TestHelper
}

async function launchSession(): Promise<Session> {
  const testDataDir = process.env.GOLEMANCY_TEST_DATA_DIR
  if (!testDataDir) {
    throw new Error('GOLEMANCY_TEST_DATA_DIR not set')
  }

  const nodePath = getNodePath()
  const app = await _electron.launch({
    args: [MAIN_ENTRY],
    env: {
      ...process.env,
      GOLEMANCY_DATA_DIR: testDataDir,
      GOLEMANCY_FORK_EXEC_PATH: nodePath,
      GOLEMANCY_ROOT_DIR: ROOT_DIR,
      NODE_ENV: 'test',
    },
    timeout: TIMEOUTS.APP_LAUNCH,
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded', { timeout: TIMEOUTS.APP_READY * 2 })
  await page.waitForFunction(
    () => (document.querySelector('#root')?.children.length ?? 0) > 0,
    { timeout: TIMEOUTS.APP_READY * 2 },
  )

  const logger = new ConsoleLogger()
  logger.attach(page)

  return {
    app,
    page,
    helper: new TestHelper(page, logger),
  }
}

test.describe('Agent Status Relaunch', () => {
  test('stale running agent resets to idle after app relaunch', async () => {
    test.setTimeout(120_000)

    let firstSession: Session | null = null
    let secondSession: Session | null = null

    try {
      firstSession = await launchSession()
      const { helper } = firstSession

      await helper.goHome()
      const project = await helper.createProjectViaApi('Agent Status Relaunch Test')
      const projectId = project.id
      const agent = await helper.createAgentViaApi(projectId, 'Stale Running Agent', {
        systemPrompt: 'You are a test agent.',
      })

      await helper.apiPatch(`/api/projects/${projectId}/agents/${agent.id}`, { status: 'running' })
      const persistedRunning = await helper.apiGet(`/api/projects/${projectId}/agents/${agent.id}`)
      expect(persistedRunning.status).toBe('running')

      await firstSession.app.close()
      firstSession = null

      secondSession = await launchSession()
      const helperAfterRestart = secondSession.helper
      const pageAfterRestart = secondSession.page

      await helperAfterRestart.goHome()
      await pageAfterRestart.evaluate(async () => {
        const store = (window as any).__GOLEMANCY_STORE__
        await store?.getState()?.loadProjects?.()
      })
      await helperAfterRestart.navigateTo(`/projects/${projectId}/agents`)
      await pageAfterRestart.evaluate(async (pid: string) => {
        const store = (window as any).__GOLEMANCY_STORE__
        await store?.getState()?.loadAgents?.(pid)
      }, projectId)

      const statusBadge = pageAfterRestart.locator(`[data-testid="agent-list-status-${agent.id}"]`)
      const statusBar = pageAfterRestart.locator(`[data-testid="agent-list-status-bar-${agent.id}"]`)
      await expect(statusBadge).toHaveAttribute('data-agent-status', 'idle')
      await expect(statusBar).toHaveAttribute('data-agent-status', 'idle')

      const persistedIdle = await helperAfterRestart.apiGet(`/api/projects/${projectId}/agents/${agent.id}`)
      expect(persistedIdle.status).toBe('idle')
    } finally {
      await secondSession?.app.close().catch(() => {})
      await firstSession?.app.close().catch(() => {})
    }
  })
})
