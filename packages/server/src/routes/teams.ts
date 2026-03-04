import { Hono } from 'hono'
import type { ITeamService, IProjectService, ProjectId, TeamId } from '@golemancy/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:teams' })

export interface TeamRouteDeps {
  teamStorage: ITeamService
  projectStorage: IProjectService
}

export function createTeamRoutes(deps: TeamRouteDeps) {
  const { teamStorage: storage, projectStorage } = deps
  const app = new Hono()

  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.debug({ projectId }, 'listing teams')
    const teams = await storage.list(projectId)
    return c.json(teams)
  })

  app.get('/:teamId', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const teamId = c.req.param('teamId') as TeamId
    log.debug({ projectId, teamId }, 'getting team')
    const team = await storage.getById(projectId, teamId)
    if (!team) return c.json({ error: 'NOT_FOUND' }, 404)
    return c.json(team)
  })

  app.post('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const data = await c.req.json()
    log.debug({ projectId }, 'creating team')
    const team = await storage.create(projectId, data)
    log.debug({ projectId, teamId: team.id }, 'created team')
    return c.json(team, 201)
  })

  app.patch('/:teamId', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const teamId = c.req.param('teamId') as TeamId
    const data = await c.req.json()
    log.debug({ projectId, teamId }, 'updating team')
    const team = await storage.update(projectId, teamId, data)
    return c.json(team)
  })

  app.get('/:teamId/layout', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const teamId = c.req.param('teamId') as TeamId
    log.debug({ projectId, teamId }, 'getting team layout')
    const layout = await storage.getLayout(projectId, teamId)
    return c.json(layout)
  })

  app.put('/:teamId/layout', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const teamId = c.req.param('teamId') as TeamId
    const layout = await c.req.json()
    log.debug({ projectId, teamId }, 'saving team layout')
    await storage.saveLayout(projectId, teamId, layout)
    return c.json(layout)
  })

  app.post('/:teamId/clone', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const teamId = c.req.param('teamId') as TeamId
    const body = await c.req.json()
    const name = body?.name

    if (typeof name !== 'string' || name.trim().length === 0) {
      return c.json({ error: 'VALIDATION_FAILED', details: [{ field: 'name', message: 'Must be a non-empty string' }] }, 400)
    }
    if (name.length > 100) {
      return c.json({ error: 'VALIDATION_FAILED', details: [{ field: 'name', message: 'Must be 100 characters or fewer' }] }, 400)
    }

    log.debug({ projectId, sourceId: teamId }, 'cloning team')
    const cloned = await storage.clone(projectId, teamId, name.trim())
    log.debug({ projectId, newId: cloned.id }, 'cloned team')
    return c.json(cloned, 201)
  })

  app.delete('/:teamId', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const teamId = c.req.param('teamId') as TeamId
    log.debug({ projectId, teamId }, 'deleting team')

    // Cascade: clear defaultTeamId if it points to the deleted team
    const project = await projectStorage.getById(projectId)
    if (project && project.defaultTeamId === teamId) {
      log.debug({ projectId, teamId }, 'clearing defaultTeamId (cascade)')
      await projectStorage.update(projectId, { defaultTeamId: undefined })
    }

    await storage.delete(projectId, teamId)
    return c.json({ ok: true })
  })

  return app
}
