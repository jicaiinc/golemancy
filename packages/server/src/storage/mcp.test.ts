import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ProjectId } from '@solocraft/shared'
import { createTmpDir } from '../test/helpers'

const state = vi.hoisted(() => ({ tmpDir: '' }))

vi.mock('../utils/paths', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths')>()
  return {
    ...actual,
    getDataDir: () => state.tmpDir,
    getProjectPath: (pid: string) => `${state.tmpDir}/projects/${pid}`,
  }
})

import { FileMCPStorage } from './mcp'

describe('FileMCPStorage', () => {
  let storage: FileMCPStorage
  let cleanup: () => Promise<void>

  const projId = 'proj-1' as ProjectId

  beforeEach(async () => {
    const tmp = await createTmpDir()
    state.tmpDir = tmp.dir
    cleanup = tmp.cleanup
    storage = new FileMCPStorage()

    // Create project directory
    await fs.mkdir(`${state.tmpDir}/projects/${projId}`, { recursive: true })
  })

  afterEach(async () => {
    await cleanup()
  })

  describe('list', () => {
    it('returns empty array when no mcp.json exists', async () => {
      const servers = await storage.list(projId)
      expect(servers).toEqual([])
    })

    it('returns all servers with name injected from key', async () => {
      await storage.create(projId, {
        name: 'filesystem',
        transportType: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
      })
      await storage.create(projId, {
        name: 'web-search',
        transportType: 'sse',
        url: 'http://localhost:3100/sse',
      })

      const servers = await storage.list(projId)
      expect(servers).toHaveLength(2)
      expect(servers[0].name).toBe('filesystem')
      expect(servers[1].name).toBe('web-search')
    })
  })

  describe('getByName', () => {
    it('returns server when found', async () => {
      await storage.create(projId, {
        name: 'test-server',
        transportType: 'stdio',
        command: 'echo',
      })

      const server = await storage.getByName(projId, 'test-server')
      expect(server).not.toBeNull()
      expect(server!.name).toBe('test-server')
      expect(server!.transportType).toBe('stdio')
      expect(server!.command).toBe('echo')
    })

    it('returns null when not found', async () => {
      const server = await storage.getByName(projId, 'non-existent')
      expect(server).toBeNull()
    })
  })

  describe('create', () => {
    it('creates server with correct fields', async () => {
      const server = await storage.create(projId, {
        name: 'my-server',
        transportType: 'stdio',
        description: 'Test server',
        command: 'npx',
        args: ['-y', 'mcp-server'],
        env: { TOKEN: 'abc' },
        cwd: '/tmp',
      })

      expect(server.name).toBe('my-server')
      expect(server.transportType).toBe('stdio')
      expect(server.description).toBe('Test server')
      expect(server.command).toBe('npx')
      expect(server.args).toEqual(['-y', 'mcp-server'])
      expect(server.env).toEqual({ TOKEN: 'abc' })
      expect(server.cwd).toBe('/tmp')
      expect(server.enabled).toBe(true) // default
    })

    it('respects explicit enabled=false', async () => {
      const server = await storage.create(projId, {
        name: 'disabled-server',
        transportType: 'sse',
        url: 'http://localhost:3100',
        enabled: false,
      })

      expect(server.enabled).toBe(false)
    })

    it('rejects duplicate names', async () => {
      await storage.create(projId, { name: 'dup', transportType: 'stdio', command: 'echo' })

      await expect(
        storage.create(projId, { name: 'dup', transportType: 'stdio', command: 'echo2' }),
      ).rejects.toThrow('already exists')
    })

    it('persists to disk', async () => {
      await storage.create(projId, { name: 'persist', transportType: 'http', url: 'http://example.com' })

      // Read directly from another instance
      const storage2 = new FileMCPStorage()
      const server = await storage2.getByName(projId, 'persist')
      expect(server).not.toBeNull()
      expect(server!.url).toBe('http://example.com')
    })
  })

  describe('update', () => {
    it('modifies fields', async () => {
      await storage.create(projId, {
        name: 'updatable',
        transportType: 'stdio',
        command: 'old-cmd',
        enabled: true,
      })

      const updated = await storage.update(projId, 'updatable', {
        command: 'new-cmd',
        enabled: false,
      })

      expect(updated.name).toBe('updatable') // name is immutable
      expect(updated.command).toBe('new-cmd')
      expect(updated.enabled).toBe(false)
    })

    it('throws for non-existent server', async () => {
      await expect(
        storage.update(projId, 'missing', { enabled: false }),
      ).rejects.toThrow('not found')
    })

    it('persists changes to disk', async () => {
      await storage.create(projId, {
        name: 'disk-update',
        transportType: 'stdio',
        command: 'before',
      })
      await storage.update(projId, 'disk-update', { command: 'after' })

      const storage2 = new FileMCPStorage()
      const server = await storage2.getByName(projId, 'disk-update')
      expect(server!.command).toBe('after')
    })
  })

  describe('delete', () => {
    it('removes server', async () => {
      await storage.create(projId, { name: 'del', transportType: 'stdio', command: 'echo' })
      await storage.delete(projId, 'del')

      const server = await storage.getByName(projId, 'del')
      expect(server).toBeNull()
    })

    it('throws for non-existent server', async () => {
      await expect(
        storage.delete(projId, 'missing'),
      ).rejects.toThrow('not found')
    })
  })

  describe('resolveNames', () => {
    it('returns matching configs', async () => {
      await storage.create(projId, { name: 'a', transportType: 'stdio', command: 'echo' })
      await storage.create(projId, { name: 'b', transportType: 'sse', url: 'http://x' })
      await storage.create(projId, { name: 'c', transportType: 'http', url: 'http://y' })

      const resolved = await storage.resolveNames(projId, ['a', 'c'])
      expect(resolved).toHaveLength(2)
      expect(resolved.map(r => r.name)).toEqual(['a', 'c'])
    })

    it('skips missing names', async () => {
      await storage.create(projId, { name: 'exists', transportType: 'stdio', command: 'echo' })

      const resolved = await storage.resolveNames(projId, ['exists', 'missing'])
      expect(resolved).toHaveLength(1)
      expect(resolved[0].name).toBe('exists')
    })

    it('returns empty for empty input', async () => {
      const resolved = await storage.resolveNames(projId, [])
      expect(resolved).toEqual([])
    })
  })

  describe('stored JSON format', () => {
    it('does not store name field inside JSON values (C2 fix)', async () => {
      await storage.create(projId, {
        name: 'check-format',
        transportType: 'stdio',
        command: 'echo',
      })

      const raw = await fs.readFile(
        path.join(state.tmpDir, 'projects', projId, 'mcp.json'),
        'utf-8',
      )
      const parsed = JSON.parse(raw)
      const stored = parsed.mcpServers['check-format']
      expect(stored).toBeDefined()
      expect(stored.name).toBeUndefined() // name derived from key, not stored
      expect(stored.transportType).toBe('stdio')
      expect(stored.command).toBe('echo')
    })

    it('still returns name when reading back', async () => {
      await storage.create(projId, {
        name: 'read-back',
        transportType: 'sse',
        url: 'http://localhost:3100',
      })

      const server = await storage.getByName(projId, 'read-back')
      expect(server!.name).toBe('read-back')
    })
  })
})
