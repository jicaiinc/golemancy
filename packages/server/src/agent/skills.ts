import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { experimental_createSkillTool as createSkillTool } from 'bash-tool'
import type { ToolSet } from 'ai'
import { getProjectPath, validateId } from '../utils/paths'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:skills' })

export async function loadAgentSkillTools(
  projectId: string,
  skillIds: string[],
): Promise<{ tools: ToolSet; instructions: string; cleanup: () => Promise<void> } | null> {
  if (skillIds.length === 0) return null

  const projectSkillsDir = path.join(getProjectPath(projectId), 'skills')

  // Build temp directory with symlinks to only the assigned skill directories
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'solocraft-skills-'))
  const cleanup = () => fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})

  let linkedCount = 0
  for (const skillId of skillIds) {
    validateId(skillId)
    const source = path.join(projectSkillsDir, skillId)
    const target = path.join(tempDir, skillId)
    try {
      await fs.access(source)
      await fs.symlink(source, target, 'dir')
      linkedCount++
    } catch {
      log.warn({ skillId, projectId }, 'skill directory not found, skipping')
    }
  }

  if (linkedCount === 0) {
    await cleanup()
    return null
  }

  try {
    const { skill, instructions } = await createSkillTool({ skillsDirectory: tempDir })
    log.debug({ projectId, skillCount: linkedCount }, 'loaded agent skill tools')
    // NOTE: Do NOT clean up tempDir here — bash-tool reads skill files lazily
    // when the tool is invoked during streaming. Caller must call cleanup() after stream ends.
    return { tools: { skill }, instructions, cleanup }
  } catch (e) {
    log.error({ err: e, projectId }, 'failed to create skill tools')
    await cleanup()
    return null
  }
}
