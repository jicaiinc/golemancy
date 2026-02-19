import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { serve } from '@hono/node-server'
import { createApp, type ServerDependencies } from './app'
import { ProjectDbManager } from './db/project-db'
import { getDataDir } from './utils/paths'
import { FileProjectStorage } from './storage/projects'
import { FileAgentStorage } from './storage/agents'
import { SqliteConversationStorage } from './storage/conversations'
import { SqliteConversationTaskStorage } from './storage/tasks'
import { FileArtifactStorage } from './storage/artifacts'
import { FileMemoryStorage } from './storage/memories'
import { FileSkillStorage } from './storage/skills'
import { FileCronJobStorage } from './storage/cronjobs'
import { FileMCPStorage } from './storage/mcp'
import { FileSettingsStorage } from './storage/settings'
import { FilePermissionsConfigStorage } from './storage/permissions-config'
import { DashboardService } from './storage/dashboard'
import { SqliteCronJobRunStorage } from './storage/cron-job-runs'
import { cronScheduler } from './scheduler'
import { CronJobExecutor } from './scheduler'
import { sandboxPool } from './agent/sandbox-pool'
import { mcpPool } from './agent/mcp-pool'
import { logger } from './logger'

async function main() {
  const port = parseInt(process.env.PORT ?? '3000', 10)

  // Ensure data directory exists
  const dataDir = getDataDir()
  logger.debug({ dataDir }, 'ensuring data directory exists')
  await fs.mkdir(dataDir, { recursive: true })

  // Per-project database manager (lazy-loads DBs on first access)
  const dbManager = new ProjectDbManager()

  // Construct dependencies
  const projectStorage = new FileProjectStorage()
  const agentStorage = new FileAgentStorage()
  const cronJobRunStorage = new SqliteCronJobRunStorage(dbManager.getProjectDb)
  const deps: ServerDependencies = {
    projectStorage,
    agentStorage,
    conversationStorage: new SqliteConversationStorage(dbManager.getProjectDb),
    taskStorage: new SqliteConversationTaskStorage(dbManager.getProjectDb),
    artifactStorage: new FileArtifactStorage(),
    memoryStorage: new FileMemoryStorage(),
    skillStorage: new FileSkillStorage(agentStorage),
    cronJobStorage: new FileCronJobStorage(),
    cronJobRunStorage,
    settingsStorage: new FileSettingsStorage(),
    mcpStorage: new FileMCPStorage(),
    permissionsConfigStorage: new FilePermissionsConfigStorage(),
    dashboardService: new DashboardService({
      projectStorage,
      agentStorage,
      getProjectDb: dbManager.getProjectDb,
    }),
  }

  // SEC-07: Generate auth token for IPC-based authentication
  const authToken = crypto.randomUUID()
  const app = createApp(deps, authToken)

  // Graceful shutdown: clean up sandbox workers, MCP connections, and cron scheduler
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down')
    await Promise.allSettled([
      sandboxPool.shutdown(),
      mcpPool.shutdown(),
      cronScheduler.shutdown(),
    ])
  })

  // Start MCP pool idle connection scanner
  mcpPool.startIdleScanner()

  // SEC-09: Bind to loopback only
  serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
    logger.info({ port: info.port, host: '127.0.0.1' }, 'server ready')

    if (process.send) {
      process.send({ type: 'ready', port: info.port, token: authToken })
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
    })
    cronScheduler.start({
      cronJobStorage: deps.cronJobStorage as FileCronJobStorage,
      executor,
    })
  })
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start server')
  process.exit(1)
})
