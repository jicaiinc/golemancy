import { execSync } from 'child_process'
import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { MAIN_ENTRY, ROOT_DIR, TIMEOUTS } from '../constants'
import { ConsoleLogger, TestHelper } from '../fixtures'

const hasApiKeys = !!(
  process.env.TEST_GOOGLE_API_KEY ||
  process.env.TEST_OPENAI_API_KEY ||
  process.env.TEST_ANTHROPIC_API_KEY
)

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

  const nodePath = execSync('which node', { encoding: 'utf-8' }).trim()
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
  await page.waitForSelector('#root > *', {
    state: 'attached',
    timeout: TIMEOUTS.APP_READY,
  })

  const logger = new ConsoleLogger()
  logger.attach(page)

  return {
    app,
    page,
    helper: new TestHelper(page, logger),
  }
}

test.describe('Memory Persistence', () => {
  test.skip(!hasApiKeys, 'AI tests require API keys in .env.e2e.local')

  test('memory survives app relaunch and is recalled in a new conversation', async () => {
    test.setTimeout(180_000)

    let firstSession: Session | null = null
    let secondSession: Session | null = null
    const persistedCode = `PERSIST-${Date.now()}-OMEGA`

    try {
      firstSession = await launchSession()
      const { helper } = firstSession

      await helper.goHome()
      const project = await helper.createProjectViaApi('Memory Persistence Test')
      const projectId = project.id
      const agent = await helper.createToolAgent(projectId, 'Memory Persistence Agent', {
        systemPrompt:
          'You are a helpful assistant. Save important facts with memory tools immediately. Pinned memories loaded into context are reliable facts. When the user asks for a remembered code, return the exact code only.',
        builtinTools: { bash: false, browser: false, task: false, memory: true },
      })

      const rememberConv = await helper.createConversationViaApi(projectId, agent.id, 'Before Restart')
      await helper.enterConversation(projectId, rememberConv.id)
      const rememberResponse = await helper.sendAndWaitForResponse(
        `Use your memory tool to remember this exact code and then confirm with only the code: ${persistedCode}`,
        TIMEOUTS.AI_RESPONSE,
      )

      expect(await helper.hasToolCall()).toBe(true)
      expect(rememberResponse).toContain(persistedCode)

      const memoriesBeforeRestart = await helper.apiGet(`/api/projects/${projectId}/agents/${agent.id}/memories`)
      const persistedMemory = memoriesBeforeRestart.find((memory: any) =>
        String(memory?.content ?? '').includes(persistedCode),
      )
      expect(persistedMemory).toBeTruthy()

      await helper.apiPatch(
        `/api/projects/${projectId}/agents/${agent.id}/memories/${persistedMemory.id}`,
        { pinned: true, priority: 5 },
      )

      await firstSession.app.close()
      firstSession = null

      secondSession = await launchSession()
      const helperAfterRestart = secondSession.helper

      const memoriesAfterRestart = await helperAfterRestart.apiGet(`/api/projects/${projectId}/agents/${agent.id}/memories`)
      const restartedMemory = memoriesAfterRestart.find((memory: any) =>
        String(memory?.content ?? '').includes(persistedCode),
      )
      expect(restartedMemory).toBeTruthy()
      expect(restartedMemory.pinned).toBe(true)
      expect(restartedMemory.priority).toBe(5)

      const recallConv = await helperAfterRestart.createConversationViaApi(projectId, agent.id, 'After Restart')
      await helperAfterRestart.enterConversation(projectId, recallConv.id)
      const recallResponse = await helperAfterRestart.sendAndWaitForResponse(
        'What exact code did I ask you to remember before the app restart? Return only the exact code.',
        TIMEOUTS.AI_RESPONSE,
      )

      expect(recallResponse).toContain(persistedCode)
    } finally {
      await secondSession?.app.close().catch(() => {})
      await firstSession?.app.close().catch(() => {})
    }
  })
})
