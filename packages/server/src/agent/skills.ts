import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { experimental_createSkillTool as createSkillTool, createBashTool } from 'bash-tool'
import type { ToolSet } from 'ai'
import { getProjectPath, validateId } from '../utils/paths'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:skills' })

/**
 * Load skill tools for a specific agent based on its skillIds.
 *
 * Uses bash-tool's createSkillTool + createBashTool:
 *   1. Create temp directory with symlinks for only the agent's assigned skills
 *   2. Call createSkillTool to discover skills and create the skill selector tool
 *   3. Call createBashTool with collected files + instructions for script execution
 *   4. Return combined tools + cleanup function
 *
 * IMPORTANT: Caller must invoke cleanup() after streaming completes (e.g. in onFinish).
 * The temp directory must persist during streaming because the skill tool reads
 * SKILL.md lazily when invoked by the AI model.
 *
 * NOTE: bash-tool currently uses just-bash (TypeScript-based bash interpreter with
 * in-memory filesystem), which cannot run real Python or Node.js code.
 * Since SoloCraft is an Electron desktop app, we plan to implement a custom
 * Sandbox (conforming to bash-tool's Sandbox interface) that leverages
 * Electron's child_process to execute scripts on the host machine's real shell.
 * This will enable full Python, Node.js, and native binary support for skill
 * scripts, without relying on just-bash's limited environment.
 */
export async function loadAgentSkillTools(
  projectId: string,
  skillIds: string[],
): Promise<{ tools: ToolSet; instructions: string; cleanup: () => Promise<void> } | null> {
  if (skillIds.length === 0) return null

  const projectSkillsDir = path.join(getProjectPath(projectId), 'skills')

  // 1. Create temp directory with symlinks for per-agent filtering.
  //    createSkillTool scans a directory to discover skills, so we create
  //    a filtered view containing only the agent's assigned skills.
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
    // 2. Discover skills and create skill selector tool
    const { skill, files, instructions } = await createSkillTool({ skillsDirectory: tempDir })

    // 3. Create bash tools with skill files for script execution
    const { tools: bashTools } = await createBashTool({
      files,
      extraInstructions: instructions,
    })

    log.debug(
      { projectId, skillCount: linkedCount, fileCount: Object.keys(files).length },
      'loaded agent skill tools',
    )

    // NOTE: Do NOT clean up tempDir here — bash-tool reads skill files lazily
    // when the tool is invoked during streaming. Caller must call cleanup() after stream ends.
    return { tools: { skill, ...bashTools }, instructions, cleanup }
  } catch (e) {
    log.error({ err: e, projectId }, 'failed to create skill tools')
    await cleanup()
    return null
  }
}
