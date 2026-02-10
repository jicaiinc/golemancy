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

async function main() {
  const port = parseInt(process.env.PORT ?? '3000', 10)

  // Ensure data directory exists
  await fs.mkdir(getDataDir(), { recursive: true })

  // Initialize database
  const db = createDatabase(getDbPath())
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

  const app = createApp(deps)

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Server ready on port ${info.port}`)

    if (process.send) {
      process.send({ type: 'ready', port: info.port })
    }
  })
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
