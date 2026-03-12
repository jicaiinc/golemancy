import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createTmpDir } from '../test/helpers'
import type { AgentId, ProjectId, TeamId } from '@golemancy/shared'

const state = vi.hoisted(() => ({ tmpDir: '' }))

vi.mock('../utils/paths', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths')>()
  return {
    ...actual,
    getDataDir: () => state.tmpDir,
    getProjectPath: (pid: string) => `${state.tmpDir}/projects/${pid}`,
  }
})

import { FileProjectStorage } from './projects'

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj-1',
    name: 'Test Project',
    description: 'A test project',
    icon: 'sword',
    config: {},
    agentCount: 0,
    activeAgentCount: 0,
    lastActivityAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('FileProjectStorage', () => {
  let storage: FileProjectStorage
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const tmp = await createTmpDir()
    state.tmpDir = tmp.dir
    cleanup = tmp.cleanup
    storage = new FileProjectStorage()
  })

  afterEach(async () => {
    await cleanup()
  })

  describe('list', () => {
    it('returns empty when no projects exist', async () => {
      const projects = await storage.list()
      expect(projects).toEqual([])
    })

    it('returns created projects', async () => {
      await storage.create({ name: 'P1', description: 'd1', icon: 'star' })
      await storage.create({ name: 'P2', description: 'd2', icon: 'gear' })

      const projects = await storage.list()
      expect(projects).toHaveLength(2)
    })
  })

  describe('create', () => {
    it('creates project with correct fields', async () => {
      const project = await storage.create({
        name: 'Test',
        description: 'A test project',
        icon: 'hammer',
      })

      expect(project.id).toMatch(/^proj-/)
      expect(project.name).toBe('Test')
      expect(project.description).toBe('A test project')
      expect(project.agentCount).toBe(0)
      expect(project.activeAgentCount).toBe(0)
      expect(project.createdAt).toBeTruthy()
    })

    it('creates subdirectories', async () => {
      const project = await storage.create({
        name: 'Test', description: '', icon: 's',
      })

      const projectDir = `${state.tmpDir}/projects/${project.id}`
      for (const sub of ['agents', 'tasks', 'workspace', 'skills']) {
        const stat = await fs.stat(path.join(projectDir, sub))
        expect(stat.isDirectory()).toBe(true)
      }
    })
  })

  describe('getById', () => {
    it('returns existing project', async () => {
      const created = await storage.create({
        name: 'Proj', description: 'd', icon: 's',
      })
      const found = await storage.getById(created.id)
      expect(found).not.toBeNull()
      expect(found!.name).toBe('Proj')
    })

    it('returns null for non-existent project', async () => {
      const found = await storage.getById('proj-missing' as ProjectId)
      expect(found).toBeNull()
    })

    it('normalizes legacy projects with both defaultAgentId and defaultTeamId', async () => {
      const projectId = 'proj-legacy' as ProjectId
      const projectDir = path.join(state.tmpDir, 'projects', projectId)
      await fs.mkdir(projectDir, { recursive: true })
      await fs.writeFile(
        path.join(projectDir, 'project.json'),
        JSON.stringify({
          ...makeProject({
            id: projectId,
            defaultAgentId: 'agent-1' as AgentId,
            defaultTeamId: 'team-1' as TeamId,
          }),
        }, null, 2),
      )

      const found = await storage.getById(projectId)
      expect(found?.defaultTeamId).toBe('team-1')
      expect(found?.defaultAgentId).toBeUndefined()
    })
  })

  describe('update', () => {
    it('merges updated fields', async () => {
      const created = await storage.create({
        name: 'Old', description: 'desc', icon: 's',
      })
      const updated = await storage.update(created.id, { name: 'New' })

      expect(updated.name).toBe('New')
      expect(updated.description).toBe('desc') // unchanged
      expect(new Date(updated.updatedAt).getTime())
        .toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime())
    })

    it('throws for non-existent project', async () => {
      await expect(
        storage.update('proj-missing' as ProjectId, { name: 'Nope' }),
      ).rejects.toThrow('not found')
    })

    it('persists changes to disk', async () => {
      const created = await storage.create({
        name: 'Before', description: '', icon: 's',
      })
      await storage.update(created.id, { name: 'After' })

      const reloaded = await storage.getById(created.id)
      expect(reloaded!.name).toBe('After')
    })

    it('clears defaultAgentId when setting defaultTeamId', async () => {
      const created = await storage.create({
        name: 'Before', description: '', icon: 's',
      })
      await storage.update(created.id, { defaultAgentId: 'agent-1' as AgentId })

      const updated = await storage.update(created.id, { defaultTeamId: 'team-1' as TeamId })

      expect(updated.defaultTeamId).toBe('team-1')
      expect(updated.defaultAgentId).toBeUndefined()

      const reloaded = await storage.getById(created.id)
      expect(reloaded?.defaultTeamId).toBe('team-1')
      expect(reloaded?.defaultAgentId).toBeUndefined()
    })

    it('clears defaultTeamId when setting defaultAgentId', async () => {
      const created = await storage.create({
        name: 'Before', description: '', icon: 's',
      })
      await storage.update(created.id, { defaultTeamId: 'team-1' as TeamId })

      const updated = await storage.update(created.id, { defaultAgentId: 'agent-1' as AgentId })

      expect(updated.defaultAgentId).toBe('agent-1')
      expect(updated.defaultTeamId).toBeUndefined()

      const reloaded = await storage.getById(created.id)
      expect(reloaded?.defaultAgentId).toBe('agent-1')
      expect(reloaded?.defaultTeamId).toBeUndefined()
    })
  })

  describe('delete', () => {
    it('removes project directory', async () => {
      const created = await storage.create({
        name: 'Del', description: '', icon: 's',
      })
      await storage.delete(created.id)

      const found = await storage.getById(created.id)
      expect(found).toBeNull()
    })

    it('ignores deleting non-existent project', async () => {
      await expect(storage.delete('proj-missing' as ProjectId)).resolves.toBeUndefined()
    })
  })
})
