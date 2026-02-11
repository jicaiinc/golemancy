import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { bodyLimit } from 'hono/body-limit'
import { pinoLogger } from 'hono-pino'
import type {
  IProjectService, IAgentService, IConversationService, ITaskService,
  IArtifactService, IMemoryService, ISkillService, ISettingsService, IDashboardService, ICronJobService,
} from '@solocraft/shared'
import { createProjectRoutes } from './routes/projects'
import { createAgentRoutes } from './routes/agents'
import { createConversationRoutes } from './routes/conversations'
import { createChatRoutes } from './routes/chat'
import { createTaskRoutes } from './routes/tasks'
import { createArtifactRoutes } from './routes/artifacts'
import { createMemoryRoutes } from './routes/memories'
import { createSettingsRoutes } from './routes/settings'
import { createDashboardRoutes } from './routes/dashboard'
import { createSkillRoutes } from './routes/skills'
import { createCronJobRoutes } from './routes/cronjobs'
import { logger } from './logger'

export interface ServerDependencies {
  projectStorage: IProjectService
  agentStorage: IAgentService
  conversationStorage: IConversationService
  taskStorage: ITaskService
  artifactStorage: IArtifactService
  memoryStorage: IMemoryService
  skillStorage: ISkillService
  settingsStorage: ISettingsService
  dashboardService: IDashboardService
  cronJobStorage: ICronJobService
}

export function createApp(deps: ServerDependencies, authToken?: string) {
  const app = new Hono()

  // Request body size limit (2 MB)
  app.use('/api/*', bodyLimit({ maxSize: 2 * 1024 * 1024 }))

  // SEC-03: Restrict CORS to localhost origins only
  app.use('/api/*', cors({
    origin: (origin) => {
      return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        ? origin
        : undefined
    },
  }))

  // Structured HTTP request/response logging via hono-pino
  app.use('/api/*', pinoLogger({ pino: logger }))

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
    logger.error({ err, method: c.req.method, path: c.req.path }, 'unhandled error')
    return c.json({
      error: 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' ? { message: err.message } : {}),
    }, 500)
  })

  app.get('/api/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  app.route('/api/projects', createProjectRoutes(deps.projectStorage))
  app.route('/api/projects/:projectId/agents', createAgentRoutes({
    agentStorage: deps.agentStorage,
    projectStorage: deps.projectStorage,
  }))
  app.route('/api/projects/:projectId/conversations', createConversationRoutes(deps.conversationStorage))
  app.route('/api/projects/:projectId/tasks', createTaskRoutes(deps.taskStorage))
  app.route('/api/projects/:projectId/artifacts', createArtifactRoutes(deps.artifactStorage))
  app.route('/api/projects/:projectId/memories', createMemoryRoutes(deps.memoryStorage))
  app.route('/api/projects/:projectId/skills', createSkillRoutes({
    skillStorage: deps.skillStorage,
    agentStorage: deps.agentStorage,
  }))
  app.route('/api/chat', createChatRoutes({
    agentStorage: deps.agentStorage,
    conversationStorage: deps.conversationStorage,
    settingsStorage: deps.settingsStorage,
  }))
  app.route('/api/settings', createSettingsRoutes(deps.settingsStorage))
  app.route('/api/projects/:projectId/cron-jobs', createCronJobRoutes(deps.cronJobStorage))
  app.route('/api/dashboard', createDashboardRoutes(deps.dashboardService))

  return app
}
