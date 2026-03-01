import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createTmpDir } from '../test/helpers'

const state = vi.hoisted(() => ({ tmpDir: '' }))

vi.mock('../utils/paths', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths')>()
  return {
    ...actual,
    getDataDir: () => state.tmpDir,
    getProjectPath: (pid: string) => `${state.tmpDir}/projects/${pid}`,
  }
})

vi.mock('bash-tool', () => ({
  experimental_createSkillTool: vi.fn(),
}))

import { loadAgentSkillTools } from './skills'

describe('loadAgentSkillTools', () => {
  let cleanup: () => Promise<void>
  const projId = 'proj-test'

  beforeEach(async () => {
    const tmp = await createTmpDir()
    state.tmpDir = tmp.dir
    cleanup = tmp.cleanup
  })

  afterEach(async () => {
    await cleanup()
  })

  it('returns null for empty skillIds', async () => {
    const result = await loadAgentSkillTools(projId, [])
    expect(result).toBeNull()
  })

  it('creates symlinks for existing skills', async () => {
    const skillDir = path.join(state.tmpDir, 'projects', projId, 'skills', 'skill-abc')
    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: Test\n---\nHello')

    const { experimental_createSkillTool } = await import('bash-tool')
    vi.mocked(experimental_createSkillTool).mockResolvedValue({
      skill: { description: 'test', parameters: {}, execute: vi.fn() },
      files: { 'skill-abc': {} },
      instructions: 'Use skill selector',
    } as any)

    const result = await loadAgentSkillTools(projId, ['skill-abc'])
    expect(result).not.toBeNull()
    expect(result!.tools).toHaveProperty('skill')
    expect(result!.instructions).toBe('Use skill selector')
    expect(typeof result!.cleanup).toBe('function')

    // Cleanup should not throw
    await result!.cleanup()
  })

  it('skips missing skills and returns null when none link', async () => {
    const result = await loadAgentSkillTools(projId, ['skill-missing'])
    expect(result).toBeNull()
  })

  it('filters to only agent-assigned skills', async () => {
    // Create two skills but only pass one
    const skillsDir = path.join(state.tmpDir, 'projects', projId, 'skills')
    await fs.mkdir(path.join(skillsDir, 'skill-a'), { recursive: true })
    await fs.mkdir(path.join(skillsDir, 'skill-b'), { recursive: true })
    await fs.writeFile(path.join(skillsDir, 'skill-a', 'SKILL.md'), '---\nname: A\n---\nA')
    await fs.writeFile(path.join(skillsDir, 'skill-b', 'SKILL.md'), '---\nname: B\n---\nB')

    const { experimental_createSkillTool } = await import('bash-tool')
    vi.mocked(experimental_createSkillTool).mockImplementation(async ({ skillsDirectory }) => {
      // Check that only skill-a was symlinked
      const entries = await fs.readdir(skillsDirectory)
      expect(entries).toContain('skill-a')
      expect(entries).not.toContain('skill-b')

      return {
        skill: { description: 'test', parameters: {}, execute: vi.fn() },
        files: {},
        instructions: '',
      } as any
    })

    const result = await loadAgentSkillTools(projId, ['skill-a'])
    expect(result).not.toBeNull()

    await result!.cleanup()
  })

  it('returns null and cleans up when createSkillTool throws', async () => {
    const skillDir = path.join(state.tmpDir, 'projects', projId, 'skills', 'skill-err')
    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), 'test')

    const { experimental_createSkillTool } = await import('bash-tool')
    vi.mocked(experimental_createSkillTool).mockRejectedValue(new Error('parse error'))

    const result = await loadAgentSkillTools(projId, ['skill-err'])
    expect(result).toBeNull()
  })
})
