import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { bodyLimit } from 'hono/body-limit'
import { pinoLogger } from 'hono-pino'
import type {
  IProjectService, IAgentService, IConversationService, ITaskService,
  IMemoryService, ISkillService, ISettingsService, IDashboardService, IGlobalDashboardService, ICronJobService,
  IMCPService, IPermissionsConfigService,
} from '@golemancy/shared'
import type { SqliteCronJobRunStorage } from './storage/cron-job-runs'
import type { TokenRecordStorage } from './storage/token-records'
import type { CompactRecordStorage } from './storage/compact-records'
import type { WebSocketManager } from './ws/handler'
import type { ActiveChatRegistry } from './agent/active-chat-registry'
import { createProjectRoutes } from './routes/projects'
import { createAgentRoutes } from './routes/agents'
import { createConversationRoutes } from './routes/conversations'
import { createChatRoutes } from './routes/chat'
import { createTaskRoutes } from './routes/tasks'
import { createWorkspaceRoutes } from './routes/workspace'
import { createMemoryRoutes } from './routes/memories'
import { createSettingsRoutes } from './routes/settings'
import { createDashboardRoutes } from './routes/dashboard'
import { createGlobalDashboardRoutes } from './routes/global-dashboard'
import { createSkillRoutes } from './routes/skills'
import { createCronJobRoutes } from './routes/cronjobs'
import { createMCPRoutes } from './routes/mcp'
import { createTopologyRoutes } from './routes/topology'
import { createPermissionsConfigRoutes } from './routes/permissions-config'
import { createRuntimeRoutes } from './routes/runtime'
import { createSandboxRoutes } from './routes/sandbox'
import { createUploadRoutes } from './routes/uploads'
import { logger } from './logger'

export interface ServerDependencies {
  projectStorage: IProjectService
  agentStorage: IAgentService
  conversationStorage: IConversationService
  taskStorage: ITaskService
  memoryStorage: IMemoryService
  skillStorage: ISkillService
  settingsStorage: ISettingsService
  dashboardService: IDashboardService
  globalDashboardService?: IGlobalDashboardService
  cronJobStorage: ICronJobService
  cronJobRunStorage: SqliteCronJobRunStorage
  mcpStorage: IMCPService
  permissionsConfigStorage: IPermissionsConfigService
  tokenRecordStorage: TokenRecordStorage
  compactRecordStorage: CompactRecordStorage
  wsManager?: WebSocketManager
  activeChatRegistry?: ActiveChatRegistry
}

export function createApp(deps: ServerDependencies, authToken?: string) {
  const app = new Hono()

  // Request body size limit: 50 MB (chat may send images as base64; server is local-only with auth token)
  app.use('/api/*', bodyLimit({ maxSize: 50 * 1024 * 1024 }))

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
  app.route('/api/projects/:projectId/conversations', createConversationRoutes({
    conversationStorage: deps.conversationStorage,
    tokenRecordStorage: deps.tokenRecordStorage,
    compactRecordStorage: deps.compactRecordStorage,
    agentStorage: deps.agentStorage,
    settingsStorage: deps.settingsStorage,
  }))
  app.route('/api/projects/:projectId/tasks', createTaskRoutes(deps.taskStorage))
  app.route('/api/projects/:projectId/workspace', createWorkspaceRoutes())
  app.route('/api/projects/:projectId/memories', createMemoryRoutes(deps.memoryStorage))
  app.route('/api/projects/:projectId/skills', createSkillRoutes({
    skillStorage: deps.skillStorage,
    agentStorage: deps.agentStorage,
  }))
  app.route('/api/projects/:projectId/mcp-servers', createMCPRoutes({
    mcpStorage: deps.mcpStorage,
    agentStorage: deps.agentStorage,
    projectStorage: deps.projectStorage,
    permissionsConfigStorage: deps.permissionsConfigStorage,
  }))
  app.route('/api/chat', createChatRoutes({
    agentStorage: deps.agentStorage,
    projectStorage: deps.projectStorage,
    conversationStorage: deps.conversationStorage,
    settingsStorage: deps.settingsStorage,
    mcpStorage: deps.mcpStorage,
    permissionsConfigStorage: deps.permissionsConfigStorage,
    taskStorage: deps.taskStorage as import('./storage/tasks').SqliteConversationTaskStorage,
    tokenRecordStorage: deps.tokenRecordStorage,
    compactRecordStorage: deps.compactRecordStorage,
    activeChatRegistry: deps.activeChatRegistry,
    wsManager: deps.wsManager,
  }))
  app.route('/api/settings', createSettingsRoutes(deps.settingsStorage))
  app.route('/api/projects/:projectId/cron-jobs', createCronJobRoutes({
    storage: deps.cronJobStorage,
    runStorage: deps.cronJobRunStorage,
  }))
  app.route('/api/projects/:projectId/dashboard', createDashboardRoutes(deps.dashboardService))
  if (deps.globalDashboardService) {
    app.route('/api/dashboard', createGlobalDashboardRoutes(deps.globalDashboardService))
  }
  app.route('/api/projects/:projectId/topology-layout', createTopologyRoutes())
  app.route('/api/projects/:projectId/permissions-config', createPermissionsConfigRoutes(deps.permissionsConfigStorage))
  app.route('/api/projects/:projectId/runtime', createRuntimeRoutes())
  app.route('/api/sandbox', createSandboxRoutes())
  app.route('/api/projects/:projectId/uploads', createUploadRoutes())

  return app
}
