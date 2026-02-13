import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import { createTmpDir } from '../test/helpers'
import type { ProjectId, AgentId, ArtifactId, Artifact } from '@golemancy/shared'

const state = vi.hoisted(() => ({ tmpDir: '' }))

vi.mock('../utils/paths', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths')>()
  return {
    ...actual,
    getDataDir: () => state.tmpDir,
    getProjectPath: (pid: string) => `${state.tmpDir}/projects/${pid}`,
  }
})

import { FileArtifactStorage } from './artifacts'

describe('FileArtifactStorage', () => {
  let storage: FileArtifactStorage
  let cleanup: () => Promise<void>

  const projId = 'proj-1' as ProjectId
  const agentId1 = 'agent-1' as AgentId
  const agentId2 = 'agent-2' as AgentId

  async function seedArtifact(artifact: Artifact, content?: string) {
    const dir = `${state.tmpDir}/projects/${artifact.projectId}/artifacts`
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      `${dir}/${artifact.id}.meta.json`,
      JSON.stringify(artifact, null, 2),
    )
    if (content && artifact.filePath) {
      await fs.writeFile(`${dir}/${artifact.filePath}`, content)
    }
  }

  function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
    return {
      id: 'art-1' as ArtifactId,
      projectId: projId,
      agentId: agentId1,
      title: 'Test Artifact',
      type: 'code',
      content: '',
      mimeType: 'text/plain',
      filePath: 'art-1.txt',
      size: 100,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      ...overrides,
    } as Artifact
  }

  beforeEach(async () => {
    const tmp = await createTmpDir()
    state.tmpDir = tmp.dir
    cleanup = tmp.cleanup
    storage = new FileArtifactStorage()

    await fs.mkdir(`${state.tmpDir}/projects/${projId}/artifacts`, { recursive: true })
  })

  afterEach(async () => {
    await cleanup()
  })

  describe('list', () => {
    it('returns artifacts from .meta.json files', async () => {
      await seedArtifact(makeArtifact({ id: 'art-1' as ArtifactId }))
      await seedArtifact(makeArtifact({ id: 'art-2' as ArtifactId, title: 'Second' }))

      const artifacts = await storage.list(projId)
      expect(artifacts).toHaveLength(2)
    })

    it('filters by agentId when provided', async () => {
      await seedArtifact(makeArtifact({ id: 'art-1' as ArtifactId, agentId: agentId1 }))
      await seedArtifact(makeArtifact({ id: 'art-2' as ArtifactId, agentId: agentId2 }))

      const artifacts = await storage.list(projId, agentId1)
      expect(artifacts).toHaveLength(1)
      expect(artifacts[0].agentId).toBe(agentId1)
    })

    it('returns empty for project with no artifacts', async () => {
      const artifacts = await storage.list(projId)
      expect(artifacts).toEqual([])
    })

    it('returns empty for non-existent project', async () => {
      const artifacts = await storage.list('proj-missing' as ProjectId)
      expect(artifacts).toEqual([])
    })
  })

  describe('getById', () => {
    it('returns existing artifact', async () => {
      await seedArtifact(makeArtifact())

      const found = await storage.getById(projId, 'art-1' as ArtifactId)
      expect(found).not.toBeNull()
      expect(found!.title).toBe('Test Artifact')
    })

    it('returns null for non-existent artifact', async () => {
      const found = await storage.getById(projId, 'art-missing' as ArtifactId)
      expect(found).toBeNull()
    })
  })

  describe('delete', () => {
    it('removes both meta and content files', async () => {
      await seedArtifact(makeArtifact(), 'file content here')

      await storage.delete(projId, 'art-1' as ArtifactId)

      const meta = await storage.getById(projId, 'art-1' as ArtifactId)
      expect(meta).toBeNull()

      const contentExists = await fs.stat(
        `${state.tmpDir}/projects/${projId}/artifacts/art-1.txt`,
      ).catch(() => null)
      expect(contentExists).toBeNull()
    })

    it('handles artifact without filePath', async () => {
      await seedArtifact(makeArtifact({ filePath: undefined }))

      await expect(
        storage.delete(projId, 'art-1' as ArtifactId),
      ).resolves.toBeUndefined()
    })

    it('handles non-existent artifact gracefully', async () => {
      await expect(
        storage.delete(projId, 'art-missing' as ArtifactId),
      ).resolves.toBeUndefined()
    })
  })
})
