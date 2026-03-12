import { Hono } from 'hono'
import type { IAgentService, IProjectService, ProjectId, AgentId } from '@golemancy/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:agents' })

export interface AgentRouteDeps {
  agentStorage: IAgentService
  projectStorage: IProjectService
}

export function createAgentRoutes(deps: AgentRouteDeps) {
  const { agentStorage: storage, projectStorage } = deps
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
    if (!agent) return c.json({ error: 'NOT_FOUND' }, 404)
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

  app.post('/:id/clone', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const agentId = c.req.param('id') as AgentId
    const body = await c.req.json()
    const name = body?.name

    if (typeof name !== 'string' || name.trim().length === 0) {
      return c.json({ error: 'VALIDATION_FAILED', details: [{ field: 'name', message: 'Must be a non-empty string' }] }, 400)
    }
    if (name.length > 100) {
      return c.json({ error: 'VALIDATION_FAILED', details: [{ field: 'name', message: 'Must be 100 characters or fewer' }] }, 400)
    }

    log.debug({ projectId, sourceId: agentId }, 'cloning agent')
    const cloned = await storage.clone(projectId, agentId, name.trim())
    log.debug({ projectId, newId: cloned.id }, 'cloned agent')
    return c.json(cloned, 201)
  })

  app.delete('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const agentId = c.req.param('id') as AgentId
    log.debug({ projectId, agentId }, 'deleting agent')

    // Cascade: clear defaultAgentId if it points to the deleted agent
    const project = await projectStorage.getById(projectId)
    if (project && project.defaultAgentId === agentId) {
      log.debug({ projectId, agentId }, 'clearing defaultAgentId (cascade)')
      await projectStorage.update(projectId, { defaultAgentId: undefined })
    }

    await storage.delete(projectId, agentId)
    return c.json({ ok: true })
  })

  return app
}
