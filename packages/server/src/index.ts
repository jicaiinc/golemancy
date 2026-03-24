import { execFileSync } from 'node:child_process'
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
import { SqliteMemoryStorage } from './storage/memories'
import { FileSkillStorage } from './storage/skills'
import { FileCronJobStorage } from './storage/cronjobs'
import { FileMCPStorage } from './storage/mcp'
import { FileSettingsStorage } from './storage/settings'
import { FilePermissionsConfigStorage } from './storage/permissions-config'
import { FileTeamStorage } from './storage/teams'
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
import { OAuthManager } from './auth/oauth-manager'
import { initOpenToolsIPC } from './agent/builtin-tools/open-tools'
import type { ProjectId } from '@golemancy/shared'
import { logger } from './logger'
import { removeProjectPythonEnv } from './runtime/python-manager'
import { getBundledNodeBinDir, getBundledUvBinDir, getBundledPythonPath } from './runtime/paths'

async function main() {
  const startTime = Date.now()
  logger.info({ node: process.version, platform: process.platform, arch: process.arch, pid: process.pid }, 'server starting')

  // macOS/Linux GUI apps inherit a truncated PATH (/usr/bin:/bin:/usr/sbin:/sbin).
  // Resolve the user's login shell PATH and merge missing entries so that
  // user-installed tools (uvx, uv, cargo, etc.) are available to MCP servers
  // and subprocess spawns (including @ai-sdk/mcp which overwrites custom
  // env.PATH with process.env.PATH).
  if (process.platform !== 'win32') {
    try {
      const shell = process.env.SHELL || '/bin/sh'
      const output = execFileSync(shell, ['-ilc', 'printf "%s" "$PATH"'], {
        encoding: 'utf-8',
        timeout: 5000,
      })
      const shellPath = output.split('\n').pop()?.trim()
      if (shellPath) {
        const currentEntries = new Set((process.env.PATH ?? '').split(path.delimiter))
        const newEntries = shellPath.split(path.delimiter).filter(e => e && !currentEntries.has(e))
        if (newEntries.length > 0) {
          process.env.PATH = [process.env.PATH ?? '', ...newEntries].join(path.delimiter)
          logger.info({ count: newEntries.length }, 'augmented PATH with login shell entries')
        }
      }
    } catch (err) {
      logger.warn({ err }, 'failed to resolve login shell PATH')
    }
  }

  // Prepend bundled runtime bin dirs to process.env.PATH so that all subprocess
  // spawns (including @ai-sdk/mcp which overwrites custom env.PATH with
  // process.env.PATH) can find bundled binaries.
  // Final PATH order: bundledUvBin → bundledNodeBin → shellPath → original GUI PATH
  const bundledNodeBin = getBundledNodeBinDir()
  if (bundledNodeBin && !process.env.PATH?.includes(bundledNodeBin)) {
    process.env.PATH = [bundledNodeBin, process.env.PATH ?? ''].join(path.delimiter)
    logger.info({ bundledNodeBin }, 'prepended bundled node bin to process.env.PATH')
  }

  const bundledUvBin = getBundledUvBinDir()
  if (bundledUvBin && !process.env.PATH?.includes(bundledUvBin)) {
    process.env.PATH = [bundledUvBin, process.env.PATH ?? ''].join(path.delimiter)
    logger.info({ bundledUvBin }, 'prepended bundled uv bin to process.env.PATH')
  }

  // Configure uv to use bundled Python and isolate its cache
  const bundledPython = getBundledPythonPath()
  if (bundledPython && !process.env.UV_PYTHON) {
    process.env.UV_PYTHON = bundledPython
    process.env.UV_PYTHON_DOWNLOADS = 'never'
    logger.info({ bundledPython }, 'set UV_PYTHON to bundled Python (downloads disabled)')
  }
  if (!process.env.UV_CACHE_DIR) {
    process.env.UV_CACHE_DIR = path.join(getDataDir(), 'runtime', 'cache', 'uv')
    logger.info({ uvCacheDir: process.env.UV_CACHE_DIR }, 'set UV_CACHE_DIR')
  }

  const port = parseInt(process.env.PORT ?? '3883', 10)

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
  const teamStorage = new FileTeamStorage()
  const cronJobRunStorage = new SqliteCronJobRunStorage(dbManager.getProjectDb)
  const memoryStorage = new SqliteMemoryStorage(dbManager.getProjectDb)
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
    teamStorage,
  }
  const settingsStorage = new FileSettingsStorage()
  const oauthManager = new OAuthManager(settingsStorage)

  const onProjectDeleting = async (id: ProjectId) => {
    // Close SQLite database connection first (prevents EPERM on Windows due to file locks)
    dbManager.closeProject(id)
    // Tear down sandbox worker and MCP connections
    await Promise.allSettled([
      removeProjectPythonEnv(id),
      sandboxPool.removeProject(id),
      mcpPool.invalidateProject(id),
    ])
  }

  const deps: ServerDependencies = {
    projectStorage,
    agentStorage,
    conversationStorage: new SqliteConversationStorage(dbManager.getProjectDb),
    taskStorage: new SqliteConversationTaskStorage(dbManager.getProjectDb),
    skillStorage: new FileSkillStorage(agentStorage),
    cronJobStorage,
    cronJobRunStorage,
    settingsStorage,
    mcpStorage: new FileMCPStorage(),
    permissionsConfigStorage: new FilePermissionsConfigStorage(),
    dashboardService: new DashboardService(dashboardDeps),
    globalDashboardService: new GlobalDashboardService(dashboardDeps),
    memoryStorage,
    tokenRecordStorage,
    compactRecordStorage,
    teamStorage,
    speechStorage,
    wsManager,
    activeChatRegistry,
    oauthManager,
    onProjectDeleting,
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

  // Graceful shutdown: clean up sandbox workers, MCP connections, cron scheduler, and OAuth
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down')
    oauthManager.shutdown()
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
      initOpenToolsIPC()
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

    // Initialize OAuth token refresh schedules for existing providers
    oauthManager.initializeRefreshSchedules().catch(err => {
      logger.warn({ err }, 'failed to initialize OAuth refresh schedules')
    })

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
      memoryStorage,
      projectStorage,
      teamStorage,
      tokenRecordStorage,
      wsManager,
      activeChatRegistry,
      oauthManager,
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
