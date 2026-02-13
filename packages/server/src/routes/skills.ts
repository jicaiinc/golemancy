import { Hono } from 'hono'
import type { ProjectId, SkillId, ISkillService, IAgentService, SkillCreateData } from '@golemancy/shared'
import { logger } from '../logger'
import path from 'node:path'
import fs from 'node:fs/promises'
import AdmZip from 'adm-zip'
import { getProjectPath } from '../utils/paths'
import { generateId } from '../utils/ids'
import matter from 'gray-matter'

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

  // POST /api/projects/:projectId/skills/import-zip
  app.post('/import-zip', async (c) => {
    const projectId = c.req.param('projectId') as ProjectId
    log.debug({ projectId }, 'importing skills from zip')

    // Get uploaded file from multipart form data
    const body = await c.req.parseBody()
    const file = body['file']

    if (!file || typeof file === 'string') {
      return c.json({ error: 'No file uploaded' }, 400)
    }

    try {
      // Read file buffer
      const buffer = await file.arrayBuffer()
      const zip = new AdmZip(Buffer.from(buffer))
      const zipEntries = zip.getEntries()

      const imported: { name: string; id: SkillId }[] = []
      const skillsDir = path.join(getProjectPath(projectId), 'skills')

      // Process each .md file in the zip
      for (const entry of zipEntries) {
        if (entry.isDirectory) continue
        if (!entry.entryName.toLowerCase().endsWith('.md')) continue

        const content = entry.getData().toString('utf-8')
        const { data, content: instructions } = matter(content)

        // Extract skill metadata from frontmatter or filename
        const name = (data.name as string) || path.basename(entry.entryName, '.md').replace(/[-_]/g, ' ')
        const description = (data.description as string) || ''

        // Create skill
        const skillData: SkillCreateData = {
          name,
          description,
          instructions: instructions.trim(),
        }
        const skill = await deps.skillStorage.create(projectId, skillData)
        imported.push({ name: skill.name, id: skill.id })

        // Extract all files from the same directory in zip to skill directory
        const entryDir = path.dirname(entry.entryName)
        for (const asset of zipEntries) {
          if (asset.isDirectory) continue
          if (!asset.entryName.startsWith(entryDir + '/')) continue
          if (asset.entryName === entry.entryName) continue // Skip the .md file itself

          const assetName = path.relative(entryDir, asset.entryName)
          const targetPath = path.join(skillsDir, skill.id, assetName)
          await fs.mkdir(path.dirname(targetPath), { recursive: true })
          await fs.writeFile(targetPath, asset.getData())
        }
      }

      log.debug({ projectId, count: imported.length }, 'imported skills from zip')
      return c.json({ imported, count: imported.length }, 201)
    } catch (err) {
      log.error({ projectId, error: err }, 'failed to import skills from zip')
      const message = err instanceof Error ? err.message : 'Failed to import skills'
      return c.json({ error: message }, 500)
    }
  })

  return app
}
