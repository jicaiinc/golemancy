import { Hono } from 'hono'
import type { IProjectService, ProjectId } from '@golemancy/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:projects' })

export function createProjectRoutes(storage: IProjectService) {
  const app = new Hono()

  app.get('/', async (c) => {
    log.debug('listing projects')
    const projects = await storage.list()
    log.debug({ count: projects.length }, 'listed projects')
    return c.json(projects)
  })

  app.get('/:id', async (c) => {
    const id = c.req.param('id') as ProjectId
    log.debug({ projectId: id }, 'getting project')
    const project = await storage.getById(id)
    if (!project) return c.json({ error: 'Not found' }, 404)
    return c.json(project)
  })

  app.post('/', async (c) => {
    const data = await c.req.json()
    log.debug('creating project')
    const project = await storage.create(data)
    log.debug({ projectId: project.id }, 'created project')
    return c.json(project, 201)
  })

  app.patch('/:id', async (c) => {
    const id = c.req.param('id') as ProjectId
    const data = await c.req.json()
    log.debug({ projectId: id }, 'updating project')
    const project = await storage.update(id, data)
    return c.json(project)
  })

  app.delete('/:id', async (c) => {
    const id = c.req.param('id') as ProjectId
    log.debug({ projectId: id }, 'deleting project')
    await storage.delete(id)
    return c.json({ ok: true })
  })

  return app
}
