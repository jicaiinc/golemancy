import { Hono } from 'hono'
import type { ProjectId, AgentId, TaskId, ITaskService } from '@solocraft/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:tasks' })

export function createTaskRoutes(storage: ITaskService) {
  const app = new Hono()

  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const agentId = c.req.query('agentId') as AgentId | undefined
    log.debug({ projectId, agentId }, 'listing tasks')
    const tasks = await storage.list(projectId, agentId)
    log.debug({ projectId, count: tasks.length }, 'listed tasks')
    return c.json(tasks)
  })

  app.get('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const taskId = c.req.param('id') as TaskId
    log.debug({ projectId, taskId }, 'getting task')
    const task = await storage.getById(projectId, taskId)
    if (!task) return c.json({ error: 'Not found' }, 404)
    return c.json(task)
  })

  app.post('/:id/cancel', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const taskId = c.req.param('id') as TaskId
    log.debug({ projectId, taskId }, 'cancelling task')
    await storage.cancel(projectId, taskId)
    return c.json({ ok: true })
  })

  app.get('/:id/logs', async (c) => {
    const taskId = c.req.param('id') as TaskId
    const cursor = c.req.query('cursor') ? parseInt(c.req.query('cursor')!, 10) : undefined
    const limit = parseInt(c.req.query('limit') ?? '100', 10)
    log.debug({ taskId, cursor, limit }, 'getting task logs')
    const logs = await storage.getLogs(taskId, cursor, limit)
    return c.json(logs)
  })

  return app
}
