import { test, expect } from '../fixtures'
import { buildSkillZip } from '../fixtures/skill-zip'

test.describe('Skills ZIP Import API', () => {
  let projectId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()
    const project = await helper.createProjectViaApi('Skills ZIP Import API')
    projectId = project.id
  })

  test('imports a packaged skill with bundled scripts and assets', async ({ helper }) => {
    const buffer = buildSkillZip({
      directory: 'scripted-skill',
      name: 'Scripted Skill',
      description: 'Uses a bundled script',
      instructions: 'Use the bundled script when asked for the packaged marker.',
      extraFiles: [
        {
          path: 'scripts/write_marker.py',
          content: [
            'from pathlib import Path',
            'Path("scripted-skill-side-effect.txt").write_text("SCRIPTED_PACKAGE_MARKER", encoding="utf-8")',
            'print("SCRIPTED_PACKAGE_MARKER")',
          ].join('\n'),
        },
        {
          path: 'assets/readme.txt',
          content: 'SCRIPTED_ASSET_MARKER',
        },
      ],
    })

    const response = await helper.apiPostMultipartRaw(`/api/projects/${projectId}/skills/import-zip`, {
      file: {
        name: 'scripted-skill.zip',
        mimeType: 'application/zip',
        buffer,
      },
    })

    expect(response.status()).toBe(201)
    const body = await response.json()
    expect(body.count).toBe(1)
    expect(body.imported).toHaveLength(1)

    const skillId = body.imported[0].id as string
    const skill = await helper.apiGet(`/api/projects/${projectId}/skills/${skillId}`)
    expect(skill.name).toBe('Scripted Skill')
    expect(skill.instructions).toContain('bundled script')

    expect(helper.skillFileExists(projectId, skillId, 'SKILL.md')).toBe(true)
    expect(helper.skillFileExists(projectId, skillId, 'scripts/write_marker.py')).toBe(true)
    expect(helper.skillFileExists(projectId, skillId, 'assets/readme.txt')).toBe(true)
    expect(helper.readSkillFile(projectId, skillId, 'scripts/write_marker.py')).toContain('SCRIPTED_PACKAGE_MARKER')
    expect(helper.readSkillFile(projectId, skillId, 'assets/readme.txt')).toContain('SCRIPTED_ASSET_MARKER')
  })

  test('imports a packaged skill without a scripts directory', async ({ helper }) => {
    const buffer = buildSkillZip({
      directory: 'plain-skill',
      name: 'Plain Packaged Skill',
      description: 'No scripts required',
      instructions: 'Return the packaged marker when asked.',
    })

    const response = await helper.apiPostMultipartRaw(`/api/projects/${projectId}/skills/import-zip`, {
      file: {
        name: 'plain-skill.zip',
        mimeType: 'application/zip',
        buffer,
      },
    })

    expect(response.status()).toBe(201)
    const body = await response.json()
    expect(body.count).toBe(1)

    const skillId = body.imported[0].id as string
    const skill = await helper.apiGet(`/api/projects/${projectId}/skills/${skillId}`)
    expect(skill.name).toBe('Plain Packaged Skill')
    expect(helper.skillFileExists(projectId, skillId, 'SKILL.md')).toBe(true)
    expect(helper.skillFileExists(projectId, skillId, 'scripts')).toBe(false)
  })

  test('invalid zip upload returns an error without importing any skills', async ({ helper }) => {
    const before = await helper.apiGet(`/api/projects/${projectId}/skills`)

    const response = await helper.apiPostMultipartRaw(`/api/projects/${projectId}/skills/import-zip`, {
      file: {
        name: 'broken-skill.zip',
        mimeType: 'application/zip',
        buffer: Buffer.from('this is not a zip archive', 'utf-8'),
      },
    })

    expect(response.status()).toBe(500)
    const body = await response.json()
    expect(typeof body.error).toBe('string')
    expect(body.error.length).toBeGreaterThan(0)

    const after = await helper.apiGet(`/api/projects/${projectId}/skills`)
    expect(after.length).toBe(before.length)
  })
})
