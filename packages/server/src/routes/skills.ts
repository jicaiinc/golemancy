import { Hono } from 'hono'
import type { ProjectId, SkillId, ISkillService, IAgentService } from '@golemancy/shared'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:skills' })

export function createSkillRoutes(deps: { skillStorage: ISkillService; agentStorage: IAgentService }) {
  const app = new Hono()

  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.debug({ projectId }, 'listing skills')
    const skills = await deps.skillStorage.list(projectId)
    log.debug({ projectId, count: skills.length }, 'listed skills')
    return c.json(skills)
  })

  app.get('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const skillId = c.req.param('id') as SkillId
    const skill = await deps.skillStorage.getById(projectId, skillId)
    if (!skill) return c.json({ error: 'Skill not found' }, 404)
    return c.json(skill)
  })

  app.post('/', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const body = await c.req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return c.json({ error: 'name is required' }, 400)
    }
    const data = {
      name,
      description: typeof body.description === 'string' ? body.description : '',
      instructions: typeof body.instructions === 'string' ? body.instructions : '',
    }
    log.debug({ projectId }, 'creating skill')
    const skill = await deps.skillStorage.create(projectId, data)
    log.debug({ projectId, skillId: skill.id }, 'created skill')
    return c.json(skill, 201)
  })

  app.patch('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const skillId = c.req.param('id') as SkillId
    const body = await c.req.json()
    const data: Record<string, string> = {}
    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (!name) return c.json({ error: 'name cannot be empty' }, 400)
      data.name = name
    }
    if (typeof body.description === 'string') data.description = body.description
    if (typeof body.instructions === 'string') data.instructions = body.instructions
    log.debug({ projectId, skillId }, 'updating skill')
    const skill = await deps.skillStorage.update(projectId, skillId, data)
    return c.json(skill)
  })

  app.delete('/:id', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    const skillId = c.req.param('id') as SkillId
    log.debug({ projectId, skillId }, 'deleting skill')

    const agents = await deps.agentStorage.list(projectId)
    const referencingAgents = agents.filter(a => a.skillIds.includes(skillId))
    if (referencingAgents.length > 0) {
      return c.json({
        error: 'Skill is assigned to agents',
        agents: referencingAgents.map(a => ({ id: a.id, name: a.name })),
      }, 409)
    }

    await deps.skillStorage.delete(projectId, skillId)
    return c.json({ ok: true })
  })

  return app
}
