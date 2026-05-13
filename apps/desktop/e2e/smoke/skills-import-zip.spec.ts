import { test, expect } from '../fixtures'
import { buildSkillZip } from '../fixtures/skill-zip'

test.describe('Skills ZIP Import UI', () => {
  let projectId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()
    projectId = await helper.createProject('Skills ZIP Import UI')
  })

  async function openSkillsPage(helper: any, window: any) {
    await helper.goToProject(projectId)
    await helper.clickNav('skills')
    await expect(window.locator('[data-testid="skills-page"]')).toBeVisible()
  }

  test('uploading a zip shows success status and renders the imported skill', async ({ helper, window }) => {
    const buffer = buildSkillZip({
      directory: 'ui-plain-skill',
      name: 'UI Plain Skill',
      description: 'Imported through the skills page',
      instructions: 'Return the UI packaged marker when asked.',
    })

    await openSkillsPage(helper, window)

    const fileInput = window.locator('[data-testid="skills-page"] input[type="file"]')
    await fileInput.setInputFiles({
      name: 'ui-plain-skill.zip',
      mimeType: 'application/zip',
      buffer,
    })

    const importedSkills = await helper.pollUntil(
      () => helper.apiGet(`/api/projects/${projectId}/skills`),
      (skills: any[]) => skills.some(skill => skill.name === 'UI Plain Skill'),
      { intervalMs: 250, timeoutMs: 10_000 },
    )
    expect(importedSkills.some((skill: any) => skill.name === 'UI Plain Skill')).toBe(true)

    await expect(window.getByText('UI Plain Skill')).toBeVisible()
  })

  test('invalid zip upload surfaces an error message', async ({ helper, window }) => {
    await openSkillsPage(helper, window)

    const fileInput = window.locator('[data-testid="skills-page"] input[type="file"]')
    await fileInput.setInputFiles({
      name: 'broken-ui-skill.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('not a valid zip', 'utf-8'),
    })

    await expect(window.locator('[data-testid="skill-import-status"][data-status-type="error"]')).toBeVisible()
  })
})
