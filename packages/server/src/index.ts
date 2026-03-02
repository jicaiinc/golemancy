import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { createApp, type ServerDependencies } from './app'
import path from 'node:path'
import { ProjectDbManager } from './db/project-db'
import { createSpeechDatabase } from './db/speech-db'
import { migrateSpeechDatabase } from './db/speech-migrate'
import { getDataDir, getSpeechDbPath } from './utils/paths'
import { FileProjectStorage } from './storage/projects'
import { FileAgentStorage } from './storage/agents'
import { SqliteConversationStorage } from './storage/conversations'
import { SqliteConversationTaskStorage } from './storage/tasks'
import { KnowledgeBaseStorage } from './storage/knowledge-base'
import { FileSkillStorage } from './storage/skills'
import { FileCronJobStorage } from './storage/cronjobs'
import { FileMCPStorage } from './storage/mcp'
import { FileSettingsStorage } from './storage/settings'
import { FilePermissionsConfigStorage } from './storage/permissions-config'
import { DashboardService } from './storage/dashboard'
import { GlobalDashboardService } from './storage/global-dashboard'
import { TokenRecordStorage } from './storage/token-records'
import { CompactRecordStorage } from './storage/compact-records'
import { SqliteCronJobRunStorage } from './storage/cron-job-runs'
import { SpeechStorage } from './storage/speech'
import { WebSocketManager } from './ws/handler'
import { ActiveChatRegistry } from './agent/active-chat-registry'
import { cronScheduler } from './scheduler'
import { CronJobExecutor } from './scheduler'
import { sandboxPool } from './agent/sandbox-pool'
import { mcpPool } from './agent/mcp-pool'
import { logger } from './logger'

async function main() {
  const startTime = Date.now()
  logger.info({ node: process.version, platform: process.platform, arch: process.arch, pid: process.pid }, 'server starting')

  const port = parseInt(process.env.PORT ?? '3000', 10)

  // Ensure data directory exists
  const dataDir = getDataDir()
  logger.debug({ dataDir }, 'ensuring data directory exists')
  await fs.mkdir(dataDir, { recursive: true })

  // Per-project database manager (lazy-loads DBs on first access)
  const dbManager = new ProjectDbManager()

  // Global speech database (transcription records)
  const speechDb = createSpeechDatabase(getSpeechDbPath())
  migrateSpeechDatabase(speechDb)
  const audioDir = path.join(dataDir, 'speech', 'audio')
  await fs.mkdir(audioDir, { recursive: true })
  const speechStorage = new SpeechStorage(speechDb, audioDir)

  // Construct dependencies
  const projectStorage = new FileProjectStorage()
  const agentStorage = new FileAgentStorage()
  const cronJobRunStorage = new SqliteCronJobRunStorage(dbManager.getProjectDb)
  const tokenRecordStorage = new TokenRecordStorage(dbManager.getProjectDb)
  const compactRecordStorage = new CompactRecordStorage(dbManager.getProjectDb)
  const wsManager = new WebSocketManager()
  const activeChatRegistry = new ActiveChatRegistry()
  const cronJobStorage = new FileCronJobStorage()
  const dashboardDeps = {
    projectStorage,
    agentStorage,
    getProjectDb: dbManager.getProjectDb,
    activeChatRegistry,
    cronJobRunStorage,
    cronJobStorage,
  }
  const deps: ServerDependencies = {
    projectStorage,
    agentStorage,
    conversationStorage: new SqliteConversationStorage(dbManager.getProjectDb),
    taskStorage: new SqliteConversationTaskStorage(dbManager.getProjectDb),
    kbStorage: new KnowledgeBaseStorage(
      dbManager.getProjectDb,
      () => deps.settingsStorage.get(),
      async (projectId) => {
        const project = await projectStorage.getById(projectId)
        return project?.config
      },
    ),
    skillStorage: new FileSkillStorage(agentStorage),
    cronJobStorage,
    cronJobRunStorage,
    settingsStorage: new FileSettingsStorage(),
    mcpStorage: new FileMCPStorage(),
    permissionsConfigStorage: new FilePermissionsConfigStorage(),
    dashboardService: new DashboardService(dashboardDeps),
    globalDashboardService: new GlobalDashboardService(dashboardDeps),
    tokenRecordStorage,
    compactRecordStorage,
    speechStorage,
    wsManager,
    activeChatRegistry,
  }

  // SEC-07: Generate auth token for IPC-based authentication
  const authToken = crypto.randomUUID()
  const app = createApp(deps, authToken)

  // Wire WebSocket: createNodeWebSocket must receive the same Hono app to install upgrade middleware
  const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app })

  // /ws route — does not match /api/* so CORS and Bearer auth middleware are bypassed.
  // Auth is validated via query param token instead.
  app.get('/ws', (c, next) => {
    const token = c.req.query('token')
    if (token !== authToken) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    return next()
  }, upgradeWebSocket(() => {
    let clientId: string | null = null
    return {
      onOpen(_event, ws) {
        clientId = wsManager.addClient(ws)
      },
      onMessage(event, _ws) {
        if (clientId) {
          const data = typeof event.data === 'string' ? event.data : String(event.data)
          wsManager.handleMessage(clientId, data)
        }
      },
      onClose() {
        if (clientId) {
          wsManager.removeClient(clientId)
        }
      },
    }
  }))

  // Graceful shutdown: clean up sandbox workers, MCP connections, and cron scheduler
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down')
    await Promise.allSettled([
      sandboxPool.shutdown(),
      mcpPool.shutdown(),
      cronScheduler.shutdown(),
    ])
    logger.info('shutdown complete')
    logger.flush()
  })

  // Start MCP pool idle connection scanner
  mcpPool.startIdleScanner()
  logger.info('MCP idle connection scanner started')

  // SEC-09: Bind to loopback only
  const server = serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, async (info) => {
    // Inject WebSocket upgrade handler into the HTTP server
    injectWebSocket(server)
    logger.info({ port: info.port, host: '127.0.0.1', startupMs: Date.now() - startTime }, 'server ready (ws enabled)')

    if (process.send) {
      process.send({ type: 'ready', port: info.port, token: authToken })
    }

    // Startup cleanup: reset stale 'running' agents to 'idle'
    // (Agents may be stuck in 'running' if the server crashed previously)
    try {
      const projects = await projectStorage.list()
      for (const project of projects) {
        const agents = await agentStorage.list(project.id)
        for (const agent of agents) {
          if (agent.status === 'running') {
            await agentStorage.update(project.id, agent.id, { status: 'idle' })
            logger.info({ projectId: project.id, agentId: agent.id }, 'reset stale running agent to idle')
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, 'failed to reset stale agent statuses on startup')
    }

    // Start cron scheduler after server is ready
    const executor = new CronJobExecutor({
      agentStorage,
      conversationStorage: deps.conversationStorage as SqliteConversationStorage,
      settingsStorage: deps.settingsStorage as FileSettingsStorage,
      mcpStorage: deps.mcpStorage as FileMCPStorage,
      permissionsConfigStorage: deps.permissionsConfigStorage as FilePermissionsConfigStorage,
      cronJobRunStorage,
      cronJobStorage: deps.cronJobStorage as FileCronJobStorage,
      taskStorage: deps.taskStorage as SqliteConversationTaskStorage,
      projectStorage,
      tokenRecordStorage,
      kbStorage: deps.kbStorage,
      wsManager,
    })
    cronScheduler.start({
      cronJobStorage: deps.cronJobStorage as FileCronJobStorage,
      executor,
    })
  })
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start server')
  logger.flush(() => process.exit(1))
})

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception')
  logger.flush(() => process.exit(1))
})

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled rejection')
  logger.flush(() => process.exit(1))
})
