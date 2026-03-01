import { Hono } from 'hono'
import type { ProjectId, ConversationId, TaskId, ITaskService } from '@golemancy/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:tasks' })

export function createTaskRoutes(storage: ITaskService) {
  const app = new Hono()

  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const conversationId = c.req.query('conversationId') as ConversationId | undefined
    log.debug({ projectId, conversationId }, 'listing tasks')
    const tasks = await storage.list(projectId, conversationId)
    log.debug({ projectId, count: tasks.length }, 'listed tasks')
    return c.json(tasks)
  })

  app.get('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const taskId = c.req.param('id') as TaskId
    log.debug({ projectId, taskId }, 'getting task')
    const task = await storage.getById(projectId, taskId)
    if (!task) return c.json({ error: 'NOT_FOUND' }, 404)
    return c.json(task)
  })

  return app
}
