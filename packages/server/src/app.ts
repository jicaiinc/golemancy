import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type {
  IProjectService, IAgentService, IConversationService, ITaskService,
  IArtifactService, IMemoryService, ISettingsService, IDashboardService,
} from '@solocraft/shared'
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
  conversationStorage: IConversationService
  taskStorage: ITaskService
  artifactStorage: IArtifactService
  memoryStorage: IMemoryService
  settingsStorage: ISettingsService
  dashboardService: IDashboardService
}

export function createApp(deps: ServerDependencies, authToken?: string) {
  const app = new Hono()

  // SEC-03: Restrict CORS to localhost origins only
  app.use('/api/*', cors({
    origin: (origin) => {
      return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        ? origin
        : undefined
    },
  }))

  // SEC-07: Validate Bearer token on all /api/* routes
  if (authToken) {
    app.use('/api/*', async (c, next) => {
      const header = c.req.header('Authorization')
      if (header !== `Bearer ${authToken}`) {
        return c.json({ error: 'Unauthorized' }, 401)
      }
      await next()
    })
  }

  // W1: Global error handler — structured JSON, no stack leaks in production
  app.onError((err, c) => {
    console.error('Unhandled error:', err)
    return c.json({
      error: 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' ? { message: err.message } : {}),
    }, 500)
  })

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
