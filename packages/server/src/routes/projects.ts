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
    if (!project) return c.json({ error: 'NOT_FOUND' }, 404)
    return c.json(project)
  })

  app.post('/', async (c) => {
    const data = await c.req.json()
    log.debug('creating project')
    const project = await storage.create(data)
    log.debug({ projectId: project.id }, 'created project')

    // Eagerly create Python venv (non-blocking, non-fatal)
    initProjectPythonEnv(project.id).catch((err) => {
      log.warn({ err, projectId: project.id }, 'failed to create Python venv on project creation')
    })

    return c.json(project, 201)
  })

  app.post('/:id/clone', async (c) => {
    const id = c.req.param('id') as ProjectId
    const body = await c.req.json()
    const name = body?.name

    if (typeof name !== 'string' || name.trim().length === 0) {
      return c.json({ error: 'VALIDATION_FAILED', details: [{ field: 'name', message: 'Must be a non-empty string' }] }, 400)
    }
    if (name.length > 100) {
      return c.json({ error: 'VALIDATION_FAILED', details: [{ field: 'name', message: 'Must be 100 characters or fewer' }] }, 400)
    }

    log.debug({ projectId: id }, 'cloning project')
    const project = await storage.clone(id, name.trim())
    log.debug({ sourceId: id, newId: project.id }, 'cloned project')

    // Eagerly create Python venv (non-blocking, non-fatal)
    initProjectPythonEnv(project.id).catch((err) => {
      log.warn({ err, projectId: project.id }, 'failed to create Python venv on project clone')
    })

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
