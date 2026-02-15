import { Hono } from 'hono'
import type { IPermissionsConfigService, ProjectId, PermissionsConfigId } from '@golemancy/shared'
import { logger } from '../logger'
import { validatePermissionsConfigFile } from '../agent/validate-permissions-config'

const log = logger.child({ component: 'routes:permissions-config' })

export function createPermissionsConfigRoutes(storage: IPermissionsConfigService) {
  const app = new Hono()

  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.debug({ projectId }, 'listing permissions configs')
    const configs = await storage.list(projectId)
    log.debug({ projectId, count: configs.length }, 'listed permissions configs')
    return c.json(configs)
  })

  app.get('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const id = c.req.param('id') as PermissionsConfigId
    log.debug({ projectId, configId: id }, 'getting permissions config')
    const config = await storage.getById(projectId, id)
    if (!config) return c.json({ error: 'Not found' }, 404)
    return c.json(config)
  })

  app.post('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const data = await c.req.json()

    const validation = validatePermissionsConfigFile(data)
    if (!validation.valid) {
      return c.json({ error: 'Validation failed', details: validation.errors }, 400)
    }

    log.debug({ projectId }, 'creating permissions config')
    const config = await storage.create(projectId, data)
    log.debug({ projectId, configId: config.id }, 'created permissions config')
    return c.json(config, 201)
  })

  app.patch('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const id = c.req.param('id') as PermissionsConfigId
    const data = await c.req.json()

    const validation = validatePermissionsConfigFile(data)
    if (!validation.valid) {
      return c.json({ error: 'Validation failed', details: validation.errors }, 400)
    }

    log.debug({ projectId, configId: id }, 'updating permissions config')
    const config = await storage.update(projectId, id, data)
    return c.json(config)
  })

  app.delete('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const id = c.req.param('id') as PermissionsConfigId
    log.debug({ projectId, configId: id }, 'deleting permissions config')
    await storage.delete(projectId, id)
    return c.json({ ok: true })
  })

  app.post('/:id/duplicate', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const id = c.req.param('id') as PermissionsConfigId
    const body = await c.req.json()
    const title = body?.title

    if (typeof title !== 'string' || title.trim().length === 0) {
      return c.json({ error: 'Validation failed', details: [{ field: 'title', message: 'Must be a non-empty string' }] }, 400)
    }
    if (title.length > 100) {
      return c.json({ error: 'Validation failed', details: [{ field: 'title', message: 'Must be 100 characters or fewer' }] }, 400)
    }

    log.debug({ projectId, sourceId: id, newTitle: title }, 'duplicating permissions config')
    const config = await storage.duplicate(projectId, id, title.trim())
    log.debug({ projectId, configId: config.id }, 'duplicated permissions config')
    return c.json(config, 201)
  })

  return app
}
