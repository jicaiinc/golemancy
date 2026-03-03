import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createTmpDir } from '../test/helpers'
import type { ProjectId, AgentId } from '@golemancy/shared'

const state = vi.hoisted(() => ({ tmpDir: '' }))

vi.mock('../utils/paths', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths')>()
  return {
    ...actual,
    getDataDir: () => state.tmpDir,
    getProjectPath: (pid: string) => `${state.tmpDir}/projects/${pid}`,
  }
})

import { FileAgentStorage } from './agents'

describe('FileAgentStorage', () => {
  let storage: FileAgentStorage
  let cleanup: () => Promise<void>

  const projId = 'proj-1' as ProjectId
  const projId2 = 'proj-2' as ProjectId

  beforeEach(async () => {
    const tmp = await createTmpDir()
    state.tmpDir = tmp.dir
    cleanup = tmp.cleanup
    storage = new FileAgentStorage()

    // Create project agent directories
    await fs.mkdir(`${state.tmpDir}/projects/${projId}/agents`, { recursive: true })
    await fs.mkdir(`${state.tmpDir}/projects/${projId2}/agents`, { recursive: true })
  })

  afterEach(async () => {
    await cleanup()
  })

  describe('list', () => {
    it('returns empty for project with no agents', async () => {
      const agents = await storage.list(projId)
      expect(agents).toEqual([])
    })

    it('returns created agents', async () => {
      await storage.create(projId, {
        name: 'Agent A', description: 'desc', systemPrompt: 'prompt',
        modelConfig: { provider: 'openai', model: 'gpt-4o' },
      })
      await storage.create(projId, {
        name: 'Agent B', description: 'desc', systemPrompt: 'prompt',
        modelConfig: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
      })

      const agents = await storage.list(projId)
      expect(agents).toHaveLength(2)
    })

    it('returns empty for non-existent project directory', async () => {
      const agents = await storage.list('proj-missing' as ProjectId)
      expect(agents).toEqual([])
    })
  })

  describe('create', () => {
    it('creates agent with correct fields', async () => {
      const agent = await storage.create(projId, {
        name: 'Research Agent',
        description: 'Researches things',
        systemPrompt: 'You are a researcher',
        modelConfig: { provider: 'google', model: 'gemini-2.5-flash' },
      })

      expect(agent.id).toMatch(/^agent-/)
      expect(agent.projectId).toBe(projId)
      expect(agent.name).toBe('Research Agent')
      expect(agent.status).toBe('idle')
      expect(agent.skillIds).toEqual([])
      expect(agent.tools).toEqual([])
      expect(agent.subAgents).toEqual([])
    })
  })

  describe('getById', () => {
    it('returns existing agent', async () => {
      const created = await storage.create(projId, {
        name: 'Test', description: '', systemPrompt: '',
        modelConfig: { provider: 'openai' },
      })

      const found = await storage.getById(projId, created.id)
      expect(found).not.toBeNull()
      expect(found!.name).toBe('Test')
    })

    it('returns null for wrong projectId', async () => {
      const created = await storage.create(projId, {
        name: 'Test', description: '', systemPrompt: '',
        modelConfig: { provider: 'openai' },
      })

      const found = await storage.getById(projId2, created.id)
      expect(found).toBeNull()
    })

    it('returns null for non-existent agent', async () => {
      const found = await storage.getById(projId, 'agent-missing' as AgentId)
      expect(found).toBeNull()
    })
  })

  describe('update', () => {
    it('merges updated fields', async () => {
      const created = await storage.create(projId, {
        name: 'Old Name', description: 'desc', systemPrompt: 'prompt',
        modelConfig: { provider: 'openai' },
      })

      const updated = await storage.update(projId, created.id, { name: 'New Name' })
      expect(updated.name).toBe('New Name')
      expect(updated.description).toBe('desc') // unchanged
      expect(updated.projectId).toBe(projId) // preserved
      expect(updated.id).toBe(created.id) // preserved
    })

    it('throws for non-existent agent', async () => {
      await expect(
        storage.update(projId, 'agent-missing' as AgentId, { name: 'Nope' }),
      ).rejects.toThrow('not found')
    })

    it('persists changes to disk', async () => {
      const created = await storage.create(projId, {
        name: 'Before', description: '', systemPrompt: '',
        modelConfig: { provider: 'openai' },
      })
      await storage.update(projId, created.id, { name: 'After' })

      const reloaded = await storage.getById(projId, created.id)
      expect(reloaded!.name).toBe('After')
    })
  })

  describe('delete', () => {
    it('removes agent file', async () => {
      const created = await storage.create(projId, {
        name: 'Del', description: '', systemPrompt: '',
        modelConfig: { provider: 'openai' },
      })
      await storage.delete(projId, created.id)

      const found = await storage.getById(projId, created.id)
      expect(found).toBeNull()
    })

    it('ignores deleting non-existent agent', async () => {
      await expect(
        storage.delete(projId, 'agent-missing' as AgentId),
      ).resolves.toBeUndefined()
    })

    it('does not affect agents in other projects', async () => {
      const agent = await storage.create(projId, {
        name: 'Keep', description: '', systemPrompt: '',
        modelConfig: { provider: 'openai' },
      })

      // Try deleting from wrong project
      await storage.delete(projId2, agent.id)

      const found = await storage.getById(projId, agent.id)
      expect(found).not.toBeNull()
    })
  })

  describe('normalize (backfill new fields)', () => {
    it('backfills mcpServers as empty array when missing', async () => {
      // Write a raw agent file without mcpServers
      const id = 'agent-legacy-mcp'
      const raw = {
        id, projectId: projId, name: 'Legacy', description: '', status: 'idle',
        systemPrompt: '', modelConfig: { provider: 'openai' },
        skillIds: [], tools: [], subAgents: [],
        builtinTools: { bash: true },
        createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
        // Note: no mcpServers field
      }
      const filePath = path.join(state.tmpDir, 'projects', projId, 'agents', `${id}.json`)
      await fs.writeFile(filePath, JSON.stringify(raw))

      const agent = await storage.getById(projId, id as AgentId)
      expect(agent).not.toBeNull()
      expect(agent!.mcpServers).toEqual([])
    })

    it('backfills builtinTools as { bash: true } when missing', async () => {
      const id = 'agent-legacy-builtin'
      const raw = {
        id, projectId: projId, name: 'Legacy', description: '', status: 'idle',
        systemPrompt: '', modelConfig: { provider: 'openai' },
        skillIds: [], tools: [], subAgents: [],
        mcpServers: [],
        // Note: no builtinTools field
        createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
      }
      const filePath = path.join(state.tmpDir, 'projects', projId, 'agents', `${id}.json`)
      await fs.writeFile(filePath, JSON.stringify(raw))

      const agent = await storage.getById(projId, id as AgentId)
      expect(agent).not.toBeNull()
      expect(agent!.builtinTools).toEqual({ bash: true, knowledge_base: true })
    })

    it('preserves existing mcpServers and builtinTools', async () => {
      const id = 'agent-with-fields'
      const raw = {
        id, projectId: projId, name: 'Modern', description: '', status: 'idle',
        systemPrompt: '', modelConfig: { provider: 'openai' },
        skillIds: [], tools: [], subAgents: [],
        mcpServers: [{ name: 'my-mcp', transportType: 'stdio', command: '/usr/bin/mcp', enabled: true }],
        builtinTools: { bash: false },
        createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
      }
      const filePath = path.join(state.tmpDir, 'projects', projId, 'agents', `${id}.json`)
      await fs.writeFile(filePath, JSON.stringify(raw))

      const agent = await storage.getById(projId, id as AgentId)
      expect(agent).not.toBeNull()
      expect(agent!.mcpServers).toHaveLength(1)
      expect(agent!.mcpServers[0]).toBe('my-mcp')
      expect(agent!.builtinTools).toEqual({ bash: false })
    })

    it('backfills both mcpServers and builtinTools via list()', async () => {
      const id = 'agent-legacy-both'
      const raw = {
        id, projectId: projId, name: 'OldAgent', description: '', status: 'idle',
        systemPrompt: '', modelConfig: { provider: 'openai' },
        skillIds: [], tools: [], subAgents: [],
        // Both fields missing
        createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
      }
      const filePath = path.join(state.tmpDir, 'projects', projId, 'agents', `${id}.json`)
      await fs.writeFile(filePath, JSON.stringify(raw))

      const agents = await storage.list(projId)
      const agent = agents.find(a => a.id === id)
      expect(agent).toBeDefined()
      expect(agent!.mcpServers).toEqual([])
      expect(agent!.builtinTools).toEqual({ bash: true, knowledge_base: true })
    })
  })
})
