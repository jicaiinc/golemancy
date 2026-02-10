import os from 'node:os'
import path from 'node:path'

const DATA_DIR = process.env.SOLOCRAFT_DATA_DIR ?? path.join(os.homedir(), '.solocraft')

export function getDataDir(): string {
  return DATA_DIR
}

export function getProjectPath(projectId: string): string {
  return path.join(DATA_DIR, 'projects', projectId)
}

export function getDbPath(): string {
  return path.join(DATA_DIR, 'data.db')
}
