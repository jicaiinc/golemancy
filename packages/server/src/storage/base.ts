import fs from 'node:fs/promises'
import path from 'node:path'

export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch (e: any) {
    if (e.code === 'ENOENT') return null
    throw e
  }
}

export async function writeJson<T>(filePath: string, data: T): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath)
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e
  }
}

export async function listJsonFiles<T>(dirPath: string): Promise<T[]> {
  try {
    const entries = await fs.readdir(dirPath)
    const items = await Promise.all(
      entries
        .filter(e => e.endsWith('.json'))
        .map(e => readJson<T>(path.join(dirPath, e)))
    )
    return items.filter((x): x is NonNullable<typeof x> => x !== null) as T[]
  } catch (e: any) {
    if (e.code === 'ENOENT') return []
    throw e
  }
}

export async function deleteDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true })
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e
  }
}
