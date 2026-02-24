import os from 'node:os'
import path from 'node:path'

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
  return process.env.GOLEMANCY_DATA_DIR ?? path.join(os.homedir(), '.golemancy')
}

export function getProjectPath(projectId: string): string {
  validateId(projectId)
  return path.join(getDataDir(), 'projects', projectId)
}

export function getDbPath(): string {
  return path.join(getDataDir(), 'data.db')
}

export function getProjectDbPath(projectId: string): string {
  validateId(projectId)
  return path.join(getDataDir(), 'projects', projectId, 'data', 'data.db')
}

export function getSpeechDbPath(): string {
  return path.join(getDataDir(), 'speech.db')
}
