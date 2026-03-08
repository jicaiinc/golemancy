import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export function isNodeError(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && 'code' in e
}

export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch (e) {
    if (isNodeError(e) && e.code === 'ENOENT') return null
    throw e
  }
}

export async function writeJson<T>(filePath: string, data: T): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${randomUUID()}.tmp`)
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  await fs.rename(tmpPath, filePath)
}

const fileLocks = new Map<string, Promise<unknown>>()

export function withFileLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = fileLocks.get(key) ?? Promise.resolve()
  const result = prev.catch(() => {}).then(() => fn())
  fileLocks.set(key, result)
  result.catch(() => {}).finally(() => {
    if (fileLocks.get(key) === result) fileLocks.delete(key)
  })
  return result
}

export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath)
  } catch (e) {
    if (isNodeError(e) && e.code !== 'ENOENT') throw e
  }
}

const BATCH_SIZE = 20

export async function listJsonFiles<T>(dirPath: string): Promise<T[]> {
  try {
    const entries = await fs.readdir(dirPath)
    const jsonFiles = entries.filter(e => e.endsWith('.json'))

    const results: T[] = []
    for (let i = 0; i < jsonFiles.length; i += BATCH_SIZE) {
      const batch = jsonFiles.slice(i, i + BATCH_SIZE)
      const items = await Promise.all(
        batch.map(e => readJson<T>(path.join(dirPath, e)))
      )
      for (const item of items) {
        if (item !== null) results.push(item)
      }
    }
    return results
  } catch (e) {
    if (isNodeError(e) && e.code === 'ENOENT') return []
    throw e
  }
}

export async function deleteDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true })
  } catch (e) {
    if (isNodeError(e) && e.code !== 'ENOENT') throw e
  }
}
