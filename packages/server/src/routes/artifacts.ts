import { Hono } from 'hono'
import type { ProjectId, AgentId, ArtifactId } from '@golemancy/shared'
import type { IArtifactService } from '@golemancy/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:artifacts' })

export function createArtifactRoutes(storage: IArtifactService) {
  const app = new Hono()

  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const agentId = c.req.query('agentId') as AgentId | undefined
    log.debug({ projectId, agentId }, 'listing artifacts')
    const artifacts = await storage.list(projectId, agentId)
    log.debug({ projectId, count: artifacts.length }, 'listed artifacts')
    return c.json(artifacts)
  })

  app.get('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const artifactId = c.req.param('id') as ArtifactId
    log.debug({ projectId, artifactId }, 'getting artifact')
    const artifact = await storage.getById(projectId, artifactId)
    if (!artifact) return c.json({ error: 'Not found' }, 404)
    return c.json(artifact)
  })

  app.delete('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const artifactId = c.req.param('id') as ArtifactId
    log.debug({ projectId, artifactId }, 'deleting artifact')
    await storage.delete(projectId, artifactId)
    return c.json({ ok: true })
  })

  return app
}
