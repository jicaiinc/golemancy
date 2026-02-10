import { Hono } from 'hono'
import type { IAgentService, ProjectId, AgentId } from '@solocraft/shared'

export function createAgentRoutes(storage: IAgentService) {
  const app = new Hono()

  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const agents = await storage.list(projectId)
    return c.json(agents)
  })

  app.get('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const agent = await storage.getById(projectId, c.req.param('id') as AgentId)
    if (!agent) return c.json({ error: 'Not found' }, 404)
    return c.json(agent)
  })

  app.post('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const data = await c.req.json()
    const agent = await storage.create(projectId, data)
    return c.json(agent, 201)
  })

  app.patch('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const data = await c.req.json()
    const agent = await storage.update(projectId, c.req.param('id') as AgentId, data)
    return c.json(agent)
  })

  app.delete('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    await storage.delete(projectId, c.req.param('id') as AgentId)
    return c.json({ ok: true })
  })

  return app
}
