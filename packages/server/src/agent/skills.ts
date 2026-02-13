import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { experimental_createSkillTool as createSkillTool } from 'bash-tool'
import type { ToolSet } from 'ai'
import { getProjectPath, validateId } from '../utils/paths'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:skills' })

export interface SkillToolsResult {
  tools: ToolSet
  /** Skill script files to be passed to bash tool (key = relative path, value = content) */
  files: Record<string, string>
  instructions: string
  cleanup: () => Promise<void>
}

/**
 * Load skill tools for a specific agent based on its skillIds.
 *
 * Uses bash-tool's createSkillTool to discover skills and create the skill selector tool.
 * Returns the `skill` selector tool along with discovered files and instructions.
 *
 * **Decoupling**: This function does NOT create bash tools. The caller (tools.ts)
 * is responsible for passing `files` and `instructions` to `loadBuiltinTools`,
 * which is the single entry point for bash/readFile/writeFile tools.
 *
 * IMPORTANT: Caller must invoke cleanup() after streaming completes (e.g. in onFinish).
 * The temp directory must persist during streaming because the skill tool reads
 * SKILL.md lazily when invoked by the AI model.
 */
export async function loadAgentSkillTools(
  projectId: string,
  skillIds: string[],
): Promise<SkillToolsResult | null> {
  if (skillIds.length === 0) return null

  const projectSkillsDir = path.join(getProjectPath(projectId), 'skills')

  // 1. Create temp directory with symlinks for per-agent filtering.
  //    createSkillTool scans a directory to discover skills, so we create
  //    a filtered view containing only the agent's assigned skills.
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golemancy-skills-'))
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
    // 2. Discover skills and create skill selector tool
    const { skill, files, instructions } = await createSkillTool({ skillsDirectory: tempDir })

    log.debug(
      { projectId, skillCount: linkedCount, fileCount: Object.keys(files).length },
      'loaded agent skill tools',
    )

    // NOTE: Do NOT clean up tempDir here — bash-tool reads skill files lazily
    // when the tool is invoked during streaming. Caller must call cleanup() after stream ends.
    return { tools: { skill }, files, instructions, cleanup }
  } catch (e) {
    log.error({ err: e, projectId }, 'failed to create skill tools')
    await cleanup()
    return null
  }
}
