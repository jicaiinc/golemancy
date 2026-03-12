import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { experimental_createSkillTool as createSkillTool } from 'bash-tool'
import type { ToolSet } from 'ai'
import { getProjectPath, validateId } from '../utils/paths'
import { logger } from '../logger'

const log = logger.child({ component: 'agent:skills' })

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value
}

/**
 * Load skill tools for a specific agent based on its skillIds.
 *
 * Returns only the `skill` selector tool + instructions. Skills and bash are
 * fully decoupled — this function has no knowledge of bash tools.
 *
 * IMPORTANT: Caller must invoke cleanup() after streaming completes (e.g. in onFinish).
 * The temp directory must persist during streaming because the skill tool reads
 * SKILL.md lazily when invoked by the AI model.
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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golemancy-skills-'))
  const cleanup = () => fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})

  const pathMap = new Map<string, string>() // sandboxPath -> absolutePath
  let linkedCount = 0
  for (const skillId of skillIds) {
    validateId(skillId)
    const source = path.join(projectSkillsDir, skillId)
    const target = path.join(tempDir, skillId)
    try {
      await fs.access(source)
      await fs.symlink(source, target, 'dir')
      pathMap.set(`./skills/${skillId}`, source)
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
    const rawSkill = skill as typeof skill & {
      description?: string
      execute?: (...args: any[]) => Promise<any> | AsyncIterable<any>
    }

    log.debug(
      { projectId, skillCount: linkedCount, fileCount: Object.keys(files).length },
      'loaded agent skill tools',
    )

    // Wrap skill tool: replace sandbox paths with real absolute paths
    const wrappedSkill = {
      ...rawSkill,
      description: (rawSkill.description ?? '').replace(
        /\nAfter loading a skill[^\n]*/,
        '',
      ),
      execute: rawSkill.execute ? async (...args: any[]) => {
        const result = await rawSkill.execute!(...args)
        if (isAsyncIterable(result)) {
          return result
        }
        if (result?.success && result.skill?.path) {
          const absPath = pathMap.get(result.skill.path)
          if (absPath) {
            return { ...result, skill: { ...result.skill, path: absPath } }
          }
          log.warn(
            { sandboxPath: result.skill.path },
            'skill path not found in pathMap, returning sandboxPath as-is',
          )
        }
        return result
      } : undefined,
    }

    // NOTE: Do NOT clean up tempDir here — bash-tool reads skill files lazily
    // when the tool is invoked during streaming. Caller must call cleanup() after stream ends.
    // Return empty instructions — bash-tool generates sandbox-relative paths that don't exist.
    // The skill tool description + execute result already provide all info the model needs.
    return { tools: { skill: wrappedSkill }, instructions: '', cleanup }
  } catch (e) {
    log.error({ err: e, projectId }, 'failed to create skill tools')
    await cleanup()
    return null
  }
}
