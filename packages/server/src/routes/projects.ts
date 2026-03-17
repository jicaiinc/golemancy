import { Hono } from 'hono'
import type { IProjectService, ISettingsService, ProjectId } from '@golemancy/shared'
import { getProjectTemplate } from '@golemancy/shared'
import { instantiateProjectTemplate } from '../storage/template-instantiate'
import { clearProjectDeletion, markProjectDeleted, markProjectDeleting } from '../project-deletion'
import { initProjectPythonEnv } from '../runtime/python-manager'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:projects' })

interface ProjectRouteDeps {
  projectStorage: IProjectService
  settingsStorage: ISettingsService
  onBeforeDelete?: (id: ProjectId) => Promise<void>
}

export function createProjectRoutes(deps: ProjectRouteDeps) {
  const { projectStorage: storage, settingsStorage } = deps
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

  app.post('/from-template', async (c) => {
    const body = await c.req.json()
    const { templateId, name } = body as { templateId?: string; name?: string }

    if (!templateId || typeof templateId !== 'string') {
      return c.json({ error: 'VALIDATION_FAILED', details: [{ field: 'templateId', message: 'Required' }] }, 400)
    }

    const template = getProjectTemplate(templateId)
    if (!template) {
      return c.json({ error: 'NOT_FOUND', message: `Template "${templateId}" not found` }, 404)
    }

    const settings = await settingsStorage.get()
    if (!settings.defaultModel) {
      return c.json({ error: 'CONFIGURATION_REQUIRED', message: 'Default model must be configured before creating from template' }, 400)
    }

    const projectName = (typeof name === 'string' && name.trim()) ? name.trim() : template.name
    log.debug({ templateId, projectName }, 'creating project from template')
    const project = await instantiateProjectTemplate(templateId, projectName, settings.defaultModel)
    log.debug({ templateId, projectId: project.id }, 'created project from template')

    initProjectPythonEnv(project.id).catch((err) => {
      log.warn({ err, projectId: project.id }, 'failed to create Python venv on template instantiation')
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
    markProjectDeleting(id)
    try {
      if (deps.onBeforeDelete) await deps.onBeforeDelete(id)
      await storage.delete(id)
      markProjectDeleted(id)
      return c.json({ ok: true })
    } catch (err) {
      clearProjectDeletion(id)
      throw err
    }
  })

  return app
}
