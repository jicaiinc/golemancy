import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { assertProjectPathWritable } from '../project-deletion'
import { captureException } from '../sentry'
import { logger } from '../logger'

const log = logger.child({ component: 'storage:base' })

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
  assertProjectPathWritable(filePath)
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

const RETRY_CODES = new Set(['EBUSY', 'EPERM', 'EACCES'])
const DELETE_DIR_MAX_RETRIES = 3
const DELETE_DIR_BASE_DELAY_MS = 2000

export async function deleteDir(dirPath: string): Promise<void> {
  for (let attempt = 0; attempt <= DELETE_DIR_MAX_RETRIES; attempt++) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true })
      return
    } catch (e) {
      if (isNodeError(e) && e.code === 'ENOENT') return
      if (
        attempt < DELETE_DIR_MAX_RETRIES
        && isNodeError(e)
        && RETRY_CODES.has(e.code ?? '')
      ) {
        const delay = DELETE_DIR_BASE_DELAY_MS
        log.warn({ dirPath, attempt: attempt + 1, code: (e as NodeJS.ErrnoException).code }, 'deleteDir retry')
        await new Promise(r => setTimeout(r, delay))
        continue
      }
      // Final attempt failed — log to Sentry instead of throwing
      const code = isNodeError(e) ? e.code : undefined
      if (code && RETRY_CODES.has(code)) {
        log.error({ dirPath, attempts: DELETE_DIR_MAX_RETRIES + 1, code }, 'deleteDir failed after all retries, giving up')
        captureException(e, { dirPath, attempts: DELETE_DIR_MAX_RETRIES + 1 })
        return
      }
      throw e
    }
  }
}
