import { Hono } from 'hono'
import type { IAgentService, ProjectId, AgentId } from '@solocraft/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:agents' })

export function createAgentRoutes(storage: IAgentService) {
  const app = new Hono()

  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.debug({ projectId }, 'listing agents')
    const agents = await storage.list(projectId)
    log.debug({ projectId, count: agents.length }, 'listed agents')
    return c.json(agents)
  })

  app.get('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const agentId = c.req.param('id') as AgentId
    log.debug({ projectId, agentId }, 'getting agent')
    const agent = await storage.getById(projectId, agentId)
    if (!agent) return c.json({ error: 'Not found' }, 404)
    return c.json(agent)
  })

  app.post('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const data = await c.req.json()
    log.debug({ projectId }, 'creating agent')
    const agent = await storage.create(projectId, data)
    log.debug({ projectId, agentId: agent.id }, 'created agent')
    return c.json(agent, 201)
  })

  app.patch('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const agentId = c.req.param('id') as AgentId
    const data = await c.req.json()
    log.debug({ projectId, agentId }, 'updating agent')
    const agent = await storage.update(projectId, agentId, data)
    return c.json(agent)
  })

  app.delete('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const agentId = c.req.param('id') as AgentId
    log.debug({ projectId, agentId }, 'deleting agent')
    await storage.delete(projectId, agentId)
    return c.json({ ok: true })
  })

  return app
}
