import path from 'node:path'
import { getDataDir, validateId } from './utils/paths'

const deletingProjects = new Set<string>()
const deletedProjects = new Set<string>()

function isBlocked(projectId: string): boolean {
  return deletingProjects.has(projectId) || deletedProjects.has(projectId)
}

function getProjectIdFromPath(filePath: string): string | null {
  const projectsDir = path.join(getDataDir(), 'projects')
  const resolved = path.resolve(filePath)
  const relative = path.relative(projectsDir, resolved)

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null
  }

  const [projectId] = relative.split(path.sep)
  if (!projectId) return null

  try {
    validateId(projectId)
    return projectId
  } catch {
    return null
  }
}

export function markProjectDeleting(projectId: string): void {
  validateId(projectId)
  deletingProjects.add(projectId)
}

export function markProjectDeleted(projectId: string): void {
  validateId(projectId)
  deletingProjects.delete(projectId)
  deletedProjects.add(projectId)
}

export function clearProjectDeletion(projectId: string): void {
  deletingProjects.delete(projectId)
  deletedProjects.delete(projectId)
}

export function isProjectBlocked(projectId: string): boolean {
  return isBlocked(projectId)
}

export function assertProjectNotDeleted(projectId: string): void {
  if (isBlocked(projectId)) {
    throw new Error(`Project ${projectId} has been deleted`)
  }
}

export function assertProjectPathWritable(filePath: string): void {
  const projectId = getProjectIdFromPath(filePath)
  if (projectId) {
    assertProjectNotDeleted(projectId)
  }
}

export function resetProjectDeletionStateForTests(): void {
  deletingProjects.clear()
  deletedProjects.clear()
}
