import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import { createTmpDir } from '../test/helpers'
import type { ProjectId, SkillId, IAgentService } from '@golemancy/shared'

const state = vi.hoisted(() => ({ tmpDir: '' }))

vi.mock('../utils/paths', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths')>()
  return {
    ...actual,
    getDataDir: () => state.tmpDir,
    getProjectPath: (pid: string) => `${state.tmpDir}/projects/${pid}`,
  }
})

import { FileSkillStorage } from './skills'

describe('FileSkillStorage', () => {
  let storage: FileSkillStorage
  let cleanup: () => Promise<void>
  let mockAgentStorage: IAgentService

  const projId = 'proj-1' as ProjectId

  beforeEach(async () => {
    const tmp = await createTmpDir()
    state.tmpDir = tmp.dir
    cleanup = tmp.cleanup

    mockAgentStorage = {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as any

    storage = new FileSkillStorage(mockAgentStorage)

    // Ensure project skills directory exists
    await fs.mkdir(`${state.tmpDir}/projects/${projId}/skills`, { recursive: true })
  })

  afterEach(async () => {
    await cleanup()
  })

  describe('list', () => {
    it('returns empty when no skills exist', async () => {
      const skills = await storage.list(projId)
      expect(skills).toEqual([])
    })

    it('returns created skills', async () => {
      await storage.create(projId, { name: 'Skill A', description: 'descA', instructions: 'do A' })
      await storage.create(projId, { name: 'Skill B', description: 'descB', instructions: 'do B' })

      const skills = await storage.list(projId)
      expect(skills).toHaveLength(2)
    })

    it('returns empty for non-existent project', async () => {
      const skills = await storage.list('proj-missing' as ProjectId)
      expect(skills).toEqual([])
    })
  })

  describe('create', () => {
    it('creates skill with correct fields', async () => {
      const skill = await storage.create(projId, {
        name: 'Test Skill',
        description: 'A test skill',
        instructions: 'Follow these steps',
      })

      expect(skill.id).toMatch(/^skill-/)
      expect(skill.projectId).toBe(projId)
      expect(skill.name).toBe('Test Skill')
      expect(skill.description).toBe('A test skill')
      expect(skill.instructions).toBe('Follow these steps')
      expect(skill.createdAt).toBeTruthy()
      expect(skill.updatedAt).toBeTruthy()
    })

    it('writes SKILL.md with frontmatter', async () => {
      const skill = await storage.create(projId, {
        name: 'My Skill',
        description: 'desc',
        instructions: 'instruction body',
      })

      const mdPath = `${state.tmpDir}/projects/${projId}/skills/${skill.id}/SKILL.md`
      const content = await fs.readFile(mdPath, 'utf-8')
      expect(content).toContain('name: My Skill')
      expect(content).toContain('description: desc')
      expect(content).toContain('instruction body')
    })
  })

  describe('getById', () => {
    it('returns existing skill', async () => {
      const created = await storage.create(projId, {
        name: 'Find Me', description: 'desc', instructions: 'inst',
      })

      const found = await storage.getById(projId, created.id)
      expect(found).not.toBeNull()
      expect(found!.name).toBe('Find Me')
    })

    it('returns null for non-existent skill', async () => {
      const found = await storage.getById(projId, 'skill-missing' as SkillId)
      expect(found).toBeNull()
    })
  })

  describe('update', () => {
    it('merges updated fields', async () => {
      const created = await storage.create(projId, {
        name: 'Old Name', description: 'desc', instructions: 'inst',
      })

      const updated = await storage.update(projId, created.id, { name: 'New Name' })
      expect(updated.name).toBe('New Name')
      expect(updated.description).toBe('desc') // unchanged
      expect(updated.instructions).toBe('inst') // unchanged
    })

    it('throws for non-existent skill', async () => {
      await expect(
        storage.update(projId, 'skill-missing' as SkillId, { name: 'Nope' }),
      ).rejects.toThrow('not found')
    })

    it('persists changes to disk', async () => {
      const created = await storage.create(projId, {
        name: 'Before', description: 'd', instructions: 'i',
      })
      await storage.update(projId, created.id, { name: 'After' })

      const reloaded = await storage.getById(projId, created.id)
      expect(reloaded!.name).toBe('After')
    })
  })

  describe('delete', () => {
    it('removes skill directory', async () => {
      const created = await storage.create(projId, {
        name: 'Del', description: 'd', instructions: 'i',
      })
      await storage.delete(projId, created.id)

      const found = await storage.getById(projId, created.id)
      expect(found).toBeNull()
    })

    it('throws when skill is assigned to agents', async () => {
      const created = await storage.create(projId, {
        name: 'Used', description: 'd', instructions: 'i',
      })

      vi.mocked(mockAgentStorage.list).mockResolvedValue([
        { id: 'agent-1', skillIds: [created.id] } as any,
      ])

      await expect(
        storage.delete(projId, created.id),
      ).rejects.toThrow('assigned to agents')
    })
  })

  describe('frontmatter parsing', () => {
    it('round-trips name, description, and instructions through SKILL.md', async () => {
      const skill = await storage.create(projId, {
        name: 'Round Trip',
        description: 'desc with special chars: "quotes" & <angles>',
        instructions: '# Heading\n\nMultiple paragraphs\n\n- list item',
      })

      const reloaded = await storage.getById(projId, skill.id)
      expect(reloaded!.name).toBe('Round Trip')
      expect(reloaded!.description).toBe('desc with special chars: "quotes" & <angles>')
      expect(reloaded!.instructions).toContain('# Heading')
      expect(reloaded!.instructions).toContain('- list item')
    })
  })
})
