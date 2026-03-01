import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createTmpDir } from '../test/helpers'
import { createTestApp, makeRequest, type MockStorage } from '../test/route-helpers'
import type { Hono } from 'hono'

const state = vi.hoisted(() => ({ tmpDir: '' }))

vi.mock('../utils/paths', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths')>()
  return {
    ...actual,
    getDataDir: () => state.tmpDir,
    getProjectPath: (pid: string) => `${state.tmpDir}/projects/${pid}`,
  }
})

const projId = 'proj-ws'

describe('Workspace routes', () => {
  let app: Hono
  let mocks: MockStorage
  let cleanup: () => Promise<void>
  let wsRoot: string

  beforeEach(async () => {
    const tmp = await createTmpDir()
    state.tmpDir = tmp.dir
    cleanup = tmp.cleanup;
    ({ app, mocks } = createTestApp())

    wsRoot = path.join(state.tmpDir, 'projects', projId, 'workspace')
    await fs.mkdir(wsRoot, { recursive: true })
  })

  afterEach(async () => {
    await cleanup()
  })

  describe('GET /api/projects/:projectId/workspace', () => {
    it('returns empty array for empty workspace', async () => {
      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/workspace`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })

    it('lists files and directories', async () => {
      await fs.mkdir(path.join(wsRoot, 'subdir'), { recursive: true })
      await fs.writeFile(path.join(wsRoot, 'file.txt'), 'hello')

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/workspace`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(2)
      // Directories first
      expect(body[0].type).toBe('directory')
      expect(body[0].name).toBe('subdir')
      expect(body[1].type).toBe('file')
      expect(body[1].name).toBe('file.txt')
    })

    it('lists subdirectory contents with ?path=', async () => {
      const subdir = path.join(wsRoot, 'nested')
      await fs.mkdir(subdir, { recursive: true })
      await fs.writeFile(path.join(subdir, 'inner.js'), 'code')

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/workspace?path=nested`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].name).toBe('nested/inner.js')
      expect(body[0].category).toBe('code')
    })

    it('skips hidden files', async () => {
      await fs.writeFile(path.join(wsRoot, '.hidden'), 'secret')
      await fs.writeFile(path.join(wsRoot, 'visible.txt'), 'ok')

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/workspace`)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].name).toBe('visible.txt')
    })
  })

  describe('GET /api/projects/:projectId/workspace/file', () => {
    it('returns 400 when path is missing', async () => {
      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/workspace/file`)
      expect(res.status).toBe(400)
    })

    it('returns file content for text files', async () => {
      await fs.writeFile(path.join(wsRoot, 'readme.txt'), 'Hello World')

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/workspace/file?path=readme.txt`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.content).toBe('Hello World')
      expect(body.category).toBe('text')
      expect(body.size).toBeGreaterThan(0)
    })

    it('returns 404 for non-existent file', async () => {
      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/workspace/file?path=missing.txt`)
      expect(res.status).toBe(404)
    })

    it('parses CSV rows for .csv files', async () => {
      await fs.writeFile(path.join(wsRoot, 'data.csv'), 'a,b,c\n1,2,3\n4,5,6')

      const res = await makeRequest(app, 'GET', `/api/projects/${projId}/workspace/file?path=data.csv`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.csvRows).toBeDefined()
      expect(body.csvRows).toHaveLength(3)
      expect(body.csvRows[0]).toEqual(['a', 'b', 'c'])
    })
  })

  describe('Path traversal prevention', () => {
    it('rejects path traversal attempts', async () => {
      await expect(
        makeRequest(app, 'GET', `/api/projects/${projId}/workspace/file?path=../../etc/passwd`),
      ).resolves.toSatisfy((res: Response) => res.status === 500 || res.status === 400)
    })

    it('rejects path traversal in directory listing', async () => {
      await expect(
        makeRequest(app, 'GET', `/api/projects/${projId}/workspace?path=../../../`),
      ).resolves.toSatisfy((res: Response) => res.status === 500 || res.status === 400)
    })
  })

  describe('DELETE /api/projects/:projectId/workspace/file', () => {
    it('deletes a file', async () => {
      await fs.writeFile(path.join(wsRoot, 'delete-me.txt'), 'gone')

      const res = await makeRequest(app, 'DELETE', `/api/projects/${projId}/workspace/file?path=delete-me.txt`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)

      // Verify file is gone
      await expect(fs.access(path.join(wsRoot, 'delete-me.txt'))).rejects.toThrow()
    })

    it('returns 404 for non-existent file', async () => {
      const res = await makeRequest(app, 'DELETE', `/api/projects/${projId}/workspace/file?path=no-such.txt`)
      expect(res.status).toBe(404)
    })

    it('refuses to delete non-empty directory', async () => {
      const dir = path.join(wsRoot, 'notempty')
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, 'child.txt'), 'x')

      const res = await makeRequest(app, 'DELETE', `/api/projects/${projId}/workspace/file?path=notempty`)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('not empty')
    })

    it('deletes empty directory', async () => {
      const dir = path.join(wsRoot, 'emptydir')
      await fs.mkdir(dir, { recursive: true })

      const res = await makeRequest(app, 'DELETE', `/api/projects/${projId}/workspace/file?path=emptydir`)
      expect(res.status).toBe(200)
    })
  })
})
