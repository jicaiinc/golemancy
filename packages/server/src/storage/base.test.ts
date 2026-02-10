import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createTmpDir } from '../test/helpers'
import { readJson, writeJson, deleteFile, listJsonFiles, deleteDir } from './base'

describe('storage/base', () => {
  let dir: string
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const tmp = await createTmpDir()
    dir = tmp.dir
    cleanup = tmp.cleanup
  })

  afterEach(async () => {
    await cleanup()
  })

  describe('readJson', () => {
    it('reads valid JSON file', async () => {
      const filePath = path.join(dir, 'data.json')
      await fs.writeFile(filePath, JSON.stringify({ name: 'test' }))
      const result = await readJson<{ name: string }>(filePath)
      expect(result).toEqual({ name: 'test' })
    })

    it('returns null for missing file', async () => {
      const result = await readJson(path.join(dir, 'missing.json'))
      expect(result).toBeNull()
    })

    it('throws for invalid JSON', async () => {
      const filePath = path.join(dir, 'bad.json')
      await fs.writeFile(filePath, 'not valid json{{{')
      await expect(readJson(filePath)).rejects.toThrow()
    })
  })

  describe('writeJson', () => {
    it('creates file with pretty-printed JSON', async () => {
      const filePath = path.join(dir, 'output.json')
      await writeJson(filePath, { key: 'value' })
      const raw = await fs.readFile(filePath, 'utf-8')
      expect(JSON.parse(raw)).toEqual({ key: 'value' })
      expect(raw).toContain('\n') // pretty-printed
    })

    it('creates intermediate directories', async () => {
      const filePath = path.join(dir, 'a', 'b', 'c.json')
      await writeJson(filePath, { nested: true })
      const result = await readJson<{ nested: boolean }>(filePath)
      expect(result).toEqual({ nested: true })
    })

    it('overwrites existing file', async () => {
      const filePath = path.join(dir, 'overwrite.json')
      await writeJson(filePath, { v: 1 })
      await writeJson(filePath, { v: 2 })
      const result = await readJson<{ v: number }>(filePath)
      expect(result).toEqual({ v: 2 })
    })
  })

  describe('deleteFile', () => {
    it('removes existing file', async () => {
      const filePath = path.join(dir, 'to-delete.json')
      await fs.writeFile(filePath, '{}')
      await deleteFile(filePath)
      const stat = await fs.stat(filePath).catch(() => null)
      expect(stat).toBeNull()
    })

    it('ignores missing file', async () => {
      await expect(deleteFile(path.join(dir, 'nonexistent.json'))).resolves.toBeUndefined()
    })
  })

  describe('listJsonFiles', () => {
    it('lists only .json files', async () => {
      await fs.writeFile(path.join(dir, 'a.json'), JSON.stringify({ id: 'a' }))
      await fs.writeFile(path.join(dir, 'b.json'), JSON.stringify({ id: 'b' }))
      await fs.writeFile(path.join(dir, 'c.txt'), 'not json')
      const items = await listJsonFiles<{ id: string }>(dir)
      expect(items).toHaveLength(2)
      expect(items.map(i => i.id).sort()).toEqual(['a', 'b'])
    })

    it('returns empty array for missing directory', async () => {
      const items = await listJsonFiles(path.join(dir, 'missing'))
      expect(items).toEqual([])
    })

    it('returns empty array for empty directory', async () => {
      const emptyDir = path.join(dir, 'empty')
      await fs.mkdir(emptyDir)
      const items = await listJsonFiles(emptyDir)
      expect(items).toEqual([])
    })
  })

  describe('deleteDir', () => {
    it('removes directory recursively', async () => {
      const subDir = path.join(dir, 'sub')
      await fs.mkdir(subDir)
      await fs.writeFile(path.join(subDir, 'file.json'), '{}')
      await deleteDir(subDir)
      const stat = await fs.stat(subDir).catch(() => null)
      expect(stat).toBeNull()
    })

    it('ignores missing directory', async () => {
      await expect(deleteDir(path.join(dir, 'nonexistent'))).resolves.toBeUndefined()
    })
  })
})
