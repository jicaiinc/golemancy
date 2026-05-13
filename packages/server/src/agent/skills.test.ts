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
    expect(result!.instructions).toContain('# Skills')
    expect(result!.instructions).toContain('skill-abc')
    expect(typeof result!.cleanup).toBe('function')

    // Cleanup should not throw
    await result!.cleanup()
  })

  it('wraps execute to replace sandbox paths with absolute paths', async () => {
    const skillDir = path.join(state.tmpDir, 'projects', projId, 'skills', 'skill-xyz')
    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: XYZ\n---\nTest')

    const mockExecute = vi.fn().mockResolvedValue({
      success: true,
      skill: { name: 'XYZ', path: './skills/skill-xyz', files: ['run.sh'] },
    })

    const { experimental_createSkillTool } = await import('bash-tool')
    vi.mocked(experimental_createSkillTool).mockResolvedValue({
      skill: { description: 'test', parameters: {}, execute: mockExecute },
      files: { 'skill-xyz': {} },
      instructions: 'SKILL DIRECTORIES: ./skills/skill-xyz/',
    } as any)

    const result = await loadAgentSkillTools(projId, ['skill-xyz'])
    expect(result).not.toBeNull()

    const wrappedSkill = result!.tools.skill as any
    const execResult = await wrappedSkill.execute({ skillName: 'XYZ' })

    expect(execResult.skill.path).toBe(skillDir)
    expect(mockExecute).toHaveBeenCalledTimes(1)

    await result!.cleanup()
  })

  it('removes misleading bash instruction from description', async () => {
    const skillDir = path.join(state.tmpDir, 'projects', projId, 'skills', 'skill-desc')
    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: Desc\n---\nTest')

    const { experimental_createSkillTool } = await import('bash-tool')
    vi.mocked(experimental_createSkillTool).mockResolvedValue({
      skill: {
        description:
          'Select a skill to load.\nAfter loading a skill, use the bash tool to run its scripts from the skill\'s directory.',
        parameters: {},
        execute: vi.fn(),
      },
      files: { 'skill-desc': {} },
      instructions: '',
    } as any)

    const result = await loadAgentSkillTools(projId, ['skill-desc'])
    expect(result).not.toBeNull()

    const wrappedSkill = result!.tools.skill as any
    expect(wrappedSkill.description).toBe('Select a skill to load.')
    expect(wrappedSkill.description).not.toContain('use the bash tool')

    await result!.cleanup()
  })

  it('falls back to sandbox path when pathMap has no match', async () => {
    const skillDir = path.join(state.tmpDir, 'projects', projId, 'skills', 'skill-unknown')
    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: Unknown\n---\nTest')

    const mockExecute = vi.fn().mockResolvedValue({
      success: true,
      skill: { name: 'Unknown', path: './skills/unexpected-format', files: [] },
    })

    const { experimental_createSkillTool } = await import('bash-tool')
    vi.mocked(experimental_createSkillTool).mockResolvedValue({
      skill: { description: 'test', parameters: {}, execute: mockExecute },
      files: { 'skill-unknown': {} },
      instructions: '',
    } as any)

    const result = await loadAgentSkillTools(projId, ['skill-unknown'])
    const wrappedSkill = result!.tools.skill as any
    const execResult = await wrappedSkill.execute({ skillName: 'Unknown' })

    // Should return original sandbox path as-is
    expect(execResult.skill.path).toBe('./skills/unexpected-format')

    await result!.cleanup()
  })

  it('passes through execute result when success is false', async () => {
    const skillDir = path.join(state.tmpDir, 'projects', projId, 'skills', 'skill-fail')
    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: Fail\n---\nTest')

    const failResult = { success: false, error: 'skill not found' }
    const mockExecute = vi.fn().mockResolvedValue(failResult)

    const { experimental_createSkillTool } = await import('bash-tool')
    vi.mocked(experimental_createSkillTool).mockResolvedValue({
      skill: { description: 'test', parameters: {}, execute: mockExecute },
      files: { 'skill-fail': {} },
      instructions: '',
    } as any)

    const result = await loadAgentSkillTools(projId, ['skill-fail'])
    const wrappedSkill = result!.tools.skill as any
    const execResult = await wrappedSkill.execute({ skillName: 'Fail' })

    // Should pass through unchanged
    expect(execResult).toEqual(failResult)

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
