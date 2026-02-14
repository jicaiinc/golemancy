import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { serve } from '@hono/node-server'
import { createApp, type ServerDependencies } from './app'
import { ProjectDbManager } from './db/project-db'
import { getDataDir } from './utils/paths'
import { FileProjectStorage } from './storage/projects'
import { FileAgentStorage } from './storage/agents'
import { SqliteConversationStorage } from './storage/conversations'
import { FileTaskStorage } from './storage/tasks'
import { FileArtifactStorage } from './storage/artifacts'
import { FileMemoryStorage } from './storage/memories'
import { FileSkillStorage } from './storage/skills'
import { FileCronJobStorage } from './storage/cronjobs'
import { FileMCPStorage } from './storage/mcp'
import { FileSettingsStorage } from './storage/settings'
import { sandboxPool } from './agent/sandbox-pool'
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
  const agentStorage = new FileAgentStorage()
  const deps: ServerDependencies = {
    projectStorage: new FileProjectStorage(),
    agentStorage,
    conversationStorage: new SqliteConversationStorage(dbManager.getProjectDb),
    taskStorage: new FileTaskStorage(dbManager.getProjectDb),
    artifactStorage: new FileArtifactStorage(),
    memoryStorage: new FileMemoryStorage(),
    skillStorage: new FileSkillStorage(agentStorage),
    cronJobStorage: new FileCronJobStorage(),
    settingsStorage: new FileSettingsStorage(),
    mcpStorage: new FileMCPStorage(),
    dashboardService: {
      getSummary: async () => ({ totalProjects: 0, totalAgents: 0, activeAgents: 0, runningTasks: 0, completedTasksToday: 0, totalTokenUsageToday: 0 }),
      getActiveAgents: async () => [],
      getRecentTasks: async () => [],
      getActivityFeed: async () => [],
    },
  }

  // SEC-07: Generate auth token for IPC-based authentication
  const authToken = crypto.randomUUID()
  const app = createApp(deps, authToken)

  // Graceful shutdown: clean up sandbox workers
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down sandbox pool')
    await sandboxPool.shutdown()
  })

  // SEC-09: Bind to loopback only
  serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
    logger.info({ port: info.port, host: '127.0.0.1' }, 'server ready')

    if (process.send) {
      process.send({ type: 'ready', port: info.port, token: authToken })
    }
  })
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start server')
  process.exit(1)
})
