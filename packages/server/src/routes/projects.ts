import { Hono } from 'hono'
import type { IProjectService, ProjectId } from '@solocraft/shared'

export function createProjectRoutes(storage: IProjectService) {
  const app = new Hono()

  app.get('/', async (c) => {
    const projects = await storage.list()
    return c.json(projects)
  })

  app.get('/:id', async (c) => {
    const project = await storage.getById(c.req.param('id') as ProjectId)
    if (!project) return c.json({ error: 'Not found' }, 404)
    return c.json(project)
  })

  app.post('/', async (c) => {
    const data = await c.req.json()
    const project = await storage.create(data)
    return c.json(project, 201)
  })

  app.patch('/:id', async (c) => {
    const data = await c.req.json()
    const project = await storage.update(c.req.param('id') as ProjectId, data)
    return c.json(project)
  })

  app.delete('/:id', async (c) => {
    await storage.delete(c.req.param('id') as ProjectId)
    return c.json({ ok: true })
  })

  return app
}
