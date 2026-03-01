import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import { createTmpDir } from '../test/helpers'
import type { ProjectId } from '@golemancy/shared'

const state = vi.hoisted(() => ({ tmpDir: '' }))

vi.mock('../utils/paths', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths')>()
  return {
    ...actual,
    getDataDir: () => state.tmpDir,
    getProjectDbPath: (pid: string) => path.join(state.tmpDir, 'projects', pid, 'data', 'data.db'),
  }
})

import { ProjectDbManager } from './project-db'

describe('ProjectDbManager', () => {
  let manager: ProjectDbManager
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const tmp = await createTmpDir()
    state.tmpDir = tmp.dir
    cleanup = tmp.cleanup
    manager = new ProjectDbManager()
  })

  afterEach(async () => {
    manager.closeAll()
    await cleanup()
  })

  it('creates database on first access', () => {
    const db = manager.getProjectDb('proj-first' as ProjectId)
    expect(db).toBeDefined()

    // Verify the database file was created
    const dbPath = path.join(state.tmpDir, 'projects', 'proj-first', 'data', 'data.db')
    expect(fs.existsSync(dbPath)).toBe(true)
  })

  it('returns cached database on subsequent access', () => {
    const db1 = manager.getProjectDb('proj-cached' as ProjectId)
    const db2 = manager.getProjectDb('proj-cached' as ProjectId)
    expect(db1).toBe(db2) // same reference
  })

  it('isolates databases per project', () => {
    const dbA = manager.getProjectDb('proj-aaa' as ProjectId)
    const dbB = manager.getProjectDb('proj-bbb' as ProjectId)
    expect(dbA).not.toBe(dbB)

    // Both DB files should exist in separate directories
    expect(fs.existsSync(path.join(state.tmpDir, 'projects', 'proj-aaa', 'data', 'data.db'))).toBe(true)
    expect(fs.existsSync(path.join(state.tmpDir, 'projects', 'proj-bbb', 'data', 'data.db'))).toBe(true)
  })

  it('closeAll clears the cache', () => {
    const db1 = manager.getProjectDb('proj-close' as ProjectId)
    manager.closeAll()

    // After closeAll, a new call should return a different instance
    const db2 = manager.getProjectDb('proj-close' as ProjectId)
    expect(db2).not.toBe(db1)
  })

  it('closeAll does not throw even if databases are already closed', () => {
    manager.getProjectDb('proj-safe' as ProjectId)
    manager.closeAll()
    // Calling closeAll again on empty cache should be safe
    expect(() => manager.closeAll()).not.toThrow()
  })
})
