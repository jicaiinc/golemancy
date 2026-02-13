import { Hono } from 'hono'
import type { ProjectId } from '@solocraft/shared'
import { logger } from '../logger'
import { readJson, writeJson } from '../storage/base'
import { getProjectPath, validateId } from '../utils/paths'
import path from 'node:path'

const log = logger.child({ component: 'routes:topology' })

type TopologyLayout = Record<string, { x: number; y: number }>

export function createTopologyRoutes() {
  const app = new Hono()

  function layoutPath(projectId: string): string {
    validateId(projectId)
    return path.join(getProjectPath(projectId), 'topology-layout.json')
  }

  // GET /api/projects/:projectId/topology-layout
  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.debug({ projectId }, 'loading topology layout')
    const layout = await readJson<TopologyLayout>(layoutPath(projectId))
    return c.json(layout ?? {})
  })

  // PUT /api/projects/:projectId/topology-layout
  app.put('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const layout = await c.req.json<TopologyLayout>()
    log.debug({ projectId }, 'saving topology layout')
    await writeJson(layoutPath(projectId), layout)
    return c.json(layout)
  })

  // DELETE /api/projects/:projectId/topology-layout
  app.delete('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.debug({ projectId }, 'deleting topology layout')
    await writeJson(layoutPath(projectId), {})
    return c.json({ ok: true })
  })

  return app
}
