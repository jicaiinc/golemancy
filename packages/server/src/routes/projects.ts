import { Hono } from 'hono'
import type { IProjectService, ProjectId } from '@golemancy/shared'
import { initProjectPythonEnv } from '../runtime/python-manager'
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

    // Basic input validation: name is required and has a max length
    if (typeof data.name !== 'string' || data.name.trim().length === 0) {
      return c.json({ error: 'name is required' }, 400)
    }
    if (data.name.length > 200) {
      return c.json({ error: 'name must be 200 characters or fewer' }, 400)
    }
    if (data.description !== undefined && typeof data.description !== 'string') {
      return c.json({ error: 'description must be a string' }, 400)
    }

    log.debug('creating project')
    const project = await storage.create(data)
    log.debug({ projectId: project.id }, 'created project')

    // Eagerly create Python venv (non-blocking, non-fatal)
    initProjectPythonEnv(project.id).catch((err) => {
      log.warn({ err, projectId: project.id }, 'failed to create Python venv on project creation')
    })

    return c.json(project, 201)
  })

  app.patch('/:id', async (c) => {
    const id = c.req.param('id') as ProjectId
    const data = await c.req.json()

    // Basic input validation
    if (data.name !== undefined && (typeof data.name !== 'string' || data.name.trim().length === 0)) {
      return c.json({ error: 'name must be a non-empty string' }, 400)
    }
    if (data.name !== undefined && data.name.length > 200) {
      return c.json({ error: 'name must be 200 characters or fewer' }, 400)
    }
    if (data.description !== undefined && typeof data.description !== 'string') {
      return c.json({ error: 'description must be a string' }, 400)
    }

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
