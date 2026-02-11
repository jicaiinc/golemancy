import os from 'node:os'
import path from 'node:path'

const DATA_DIR = process.env.SOLOCRAFT_DATA_DIR ?? path.join(os.homedir(), '.solocraft')

const ID_PATTERN = /^[a-z]+-[A-Za-z0-9_-]+$/

export function validateId(id: string): void {
  if (!ID_PATTERN.test(id)) {
    throw new Error(`Invalid ID format: ${id}`)
  }
}

export function validateFilePath(basePath: string, filePath: string): string {
  const resolved = path.resolve(basePath, filePath)
  if (!resolved.startsWith(basePath + path.sep) && resolved !== basePath) {
    throw new Error(`Path traversal detected: ${filePath}`)
  }
  return resolved
}

export function getDataDir(): string {
  return DATA_DIR
}

export function getProjectPath(projectId: string): string {
  validateId(projectId)
  return path.join(DATA_DIR, 'projects', projectId)
}

export function getDbPath(): string {
  return path.join(DATA_DIR, 'data.db')
}

export function getProjectDbPath(projectId: string): string {
  validateId(projectId)
  return path.join(DATA_DIR, 'projects', projectId, 'data.db')
}
