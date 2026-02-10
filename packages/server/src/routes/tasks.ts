import { Hono } from 'hono'
import type { ProjectId, AgentId, TaskId } from '@solocraft/shared'
import type { FileTaskStorage } from '../storage/tasks'

export function createTaskRoutes(storage: FileTaskStorage) {
  const app = new Hono()

  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const agentId = c.req.query('agentId') as AgentId | undefined
    const tasks = await storage.list(projectId, agentId)
    return c.json(tasks)
  })

  app.get('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const task = await storage.getById(projectId, c.req.param('id') as TaskId)
    if (!task) return c.json({ error: 'Not found' }, 404)
    return c.json(task)
  })

  app.post('/:id/cancel', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    await storage.cancel(projectId, c.req.param('id') as TaskId)
    return c.json({ ok: true })
  })

  app.get('/:id/logs', async (c) => {
    const cursor = c.req.query('cursor') ? parseInt(c.req.query('cursor')!, 10) : undefined
    const limit = parseInt(c.req.query('limit') ?? '100', 10)
    const logs = await storage.getLogs(c.req.param('id') as TaskId, cursor, limit)
    return c.json(logs)
  })

  return app
}
