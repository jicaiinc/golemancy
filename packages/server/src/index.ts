import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { serve } from '@hono/node-server'
import { createApp, type ServerDependencies } from './app'
import { createDatabase } from './db/client'
import { migrateDatabase } from './db/migrate'
import { getDataDir, getDbPath } from './utils/paths'
import { FileProjectStorage } from './storage/projects'
import { FileAgentStorage } from './storage/agents'
import { SqliteConversationStorage } from './storage/conversations'
import { FileTaskStorage } from './storage/tasks'
import { FileArtifactStorage } from './storage/artifacts'
import { FileMemoryStorage } from './storage/memories'
import { FileSettingsStorage } from './storage/settings'
import { logger } from './logger'

async function main() {
  const port = parseInt(process.env.PORT ?? '3000', 10)

  // Ensure data directory exists
  const dataDir = getDataDir()
  logger.debug({ dataDir }, 'ensuring data directory exists')
  await fs.mkdir(dataDir, { recursive: true })

  // Initialize database
  const dbPath = getDbPath()
  logger.debug({ dbPath }, 'initializing database')
  const db = createDatabase(dbPath)
  migrateDatabase(db)

  // Construct dependencies
  const deps: ServerDependencies = {
    projectStorage: new FileProjectStorage(),
    agentStorage: new FileAgentStorage(),
    conversationStorage: new SqliteConversationStorage(db),
    taskStorage: new FileTaskStorage(db),
    artifactStorage: new FileArtifactStorage(),
    memoryStorage: new FileMemoryStorage(),
    settingsStorage: new FileSettingsStorage(),
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
