import fs from 'node:fs/promises'
import path from 'node:path'
import { getProjectPath } from '../../utils/paths'
import { logger } from '../../logger'

const log = logger.child({ component: 'claude-code:skills-sync' })

/** Validate skillId to prevent path traversal — only allow safe characters */
function isValidSkillId(skillId: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(skillId)
}

/**
 * Sync Golemancy project skills to SDK's `.claude/skills/` directory.
 * Creates symlinks from {workspace}/.claude/skills/{skillId}
 * → {projectSkillsDir}/{skillId}
 *
 * Returns a cleanup function that removes only the symlinks this call created.
 */
export async function syncSkillsToSdkDir(
  projectId: string,
  skillIds: string[],
  workspaceDir: string,
): Promise<{ cleanup: () => Promise<void> }> {
  const sdkSkillsDir = path.join(workspaceDir, '.claude', 'skills')
  const projectSkillsDir = path.join(getProjectPath(projectId), 'skills')
  const resolvedProjectSkillsDir = path.resolve(projectSkillsDir)

  // Ensure .claude/skills/ directory exists
  await fs.mkdir(sdkSkillsDir, { recursive: true })

  // Create symlinks for each skill (only if not already present)
  const createdLinks: string[] = []
  for (const skillId of skillIds) {
    // Validate skillId format to prevent path traversal
    if (!isValidSkillId(skillId)) {
      log.warn({ skillId, projectId }, 'invalid skillId format, skipping')
      continue
    }

    const source = path.join(projectSkillsDir, skillId)
    const resolvedSource = path.resolve(source)

    // Double-check resolved path stays within project skills directory
    if (!resolvedSource.startsWith(resolvedProjectSkillsDir + path.sep)) {
      log.warn({ skillId, projectId }, 'path traversal detected in skillId, skipping')
      continue
    }

    const target = path.join(sdkSkillsDir, skillId)

    try {
      // Skip if symlink already exists (from concurrent session)
      try {
        const stat = await fs.lstat(target)
        if (stat.isSymbolicLink()) continue
      } catch {
        // Target doesn't exist — proceed to create
      }

      await fs.access(source)
      await fs.symlink(source, target, 'dir')
      createdLinks.push(target)
    } catch {
      log.warn({ skillId, projectId }, 'skill directory not found, skipping symlink')
    }
  }

  log.debug({ projectId, linkedCount: createdLinks.length, total: skillIds.length }, 'synced skills to SDK directory')

  // Cleanup only removes symlinks that THIS call created
  const cleanup = async () => {
    try {
      for (const target of createdLinks) {
        try {
          const stat = await fs.lstat(target)
          if (stat.isSymbolicLink()) {
            await fs.unlink(target)
          }
        } catch {
          // Already removed
        }
      }
    } catch (err) {
      log.warn({ err, projectId }, 'failed to cleanup SDK skills symlinks')
    }
  }

  return { cleanup }
}
