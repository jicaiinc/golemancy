import { Hono } from 'hono'
import type { ProjectId, AgentId, ArtifactId } from '@solocraft/shared'
import type { IArtifactService } from '@solocraft/shared'

export function createArtifactRoutes(storage: IArtifactService) {
  const app = new Hono()

  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const agentId = c.req.query('agentId') as AgentId | undefined
    const artifacts = await storage.list(projectId, agentId)
    return c.json(artifacts)
  })

  app.get('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const artifact = await storage.getById(projectId, c.req.param('id') as ArtifactId)
    if (!artifact) return c.json({ error: 'Not found' }, 404)
    return c.json(artifact)
  })

  app.delete('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    await storage.delete(projectId, c.req.param('id') as ArtifactId)
    return c.json({ ok: true })
  })

  return app
}
