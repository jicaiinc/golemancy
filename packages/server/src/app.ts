import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type {
  IProjectService, IAgentService, ITaskService,
  IArtifactService, IMemoryService, ISettingsService, IDashboardService,
} from '@solocraft/shared'
import type { SqliteConversationStorage } from './storage/conversations'
import type { FileTaskStorage } from './storage/tasks'
import { createProjectRoutes } from './routes/projects'
import { createAgentRoutes } from './routes/agents'
import { createConversationRoutes } from './routes/conversations'
import { createChatRoute } from './routes/chat'
import { createTaskRoutes } from './routes/tasks'
import { createArtifactRoutes } from './routes/artifacts'
import { createMemoryRoutes } from './routes/memories'
import { createSettingsRoutes } from './routes/settings'
import { createDashboardRoutes } from './routes/dashboard'

export interface ServerDependencies {
  projectStorage: IProjectService
  agentStorage: IAgentService
  conversationStorage: SqliteConversationStorage
  taskStorage: FileTaskStorage
  artifactStorage: IArtifactService
  memoryStorage: IMemoryService
  settingsStorage: ISettingsService
  dashboardService: IDashboardService
}

export function createApp(deps: ServerDependencies) {
  const app = new Hono()

  app.use('/api/*', cors())

  app.get('/api/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  app.route('/api/projects', createProjectRoutes(deps.projectStorage))
  app.route('/api/projects/:projectId/agents', createAgentRoutes(deps.agentStorage))
  app.route('/api/projects/:projectId/conversations', createConversationRoutes(deps.conversationStorage))
  app.route('/api/projects/:projectId/tasks', createTaskRoutes(deps.taskStorage))
  app.route('/api/projects/:projectId/artifacts', createArtifactRoutes(deps.artifactStorage))
  app.route('/api/projects/:projectId/memories', createMemoryRoutes(deps.memoryStorage))
  app.route('/api/chat', createChatRoute())
  app.route('/api/settings', createSettingsRoutes(deps.settingsStorage))
  app.route('/api/dashboard', createDashboardRoutes(deps.dashboardService))

  return app
}
