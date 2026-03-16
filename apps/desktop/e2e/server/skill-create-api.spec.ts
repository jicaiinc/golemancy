import { test, expect } from '../fixtures'

test.describe('Skill Markdown Import', () => {
  let projectId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()
    const project = await helper.createProjectViaApi('Skill MD Import Test')
    projectId = project.id
  })

  test('POST /skills creates skill with name and description from request body', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/skills`, {
      name: 'MD Imported Skill',
      description: 'Extracted from frontmatter',
      instructions: 'These are the actual instructions from the markdown body.',
    })
    expect(response.status()).toBe(201)

    const data = await response.json()
    expect(data.name).toBe('MD Imported Skill')
    expect(data.description).toBe('Extracted from frontmatter')
    expect(data.instructions).toBe('These are the actual instructions from the markdown body.')
  })

  test('skill preserves multiline instructions', async ({ helper }) => {
    const multilineInstructions = `Step 1: Read the input carefully.

Step 2: Identify the key points.

Step 3: Produce a structured summary with:
- Bullet point 1
- Bullet point 2
- Bullet point 3`

    const response = await helper.apiPostRaw(`/api/projects/${projectId}/skills`, {
      name: 'Multiline Skill',
      description: 'Skill with multiline instructions',
      instructions: multilineInstructions,
    })
    expect(response.status()).toBe(201)

    const data = await response.json()
    const skill = await helper.apiGet(`/api/projects/${projectId}/skills/${data.id}`)
    expect(skill.instructions).toBe(multilineInstructions)
    expect(skill.instructions).toContain('Step 1')
    expect(skill.instructions).toContain('Bullet point 3')
  })

  test('skill with empty description is allowed', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/skills`, {
      name: 'No Description Skill',
      description: '',
      instructions: 'Instructions only, no description.',
    })
    expect(response.status()).toBe(201)

    const data = await response.json()
    expect(data.name).toBe('No Description Skill')
    expect(data.description).toBe('')
    expect(data.instructions).toBe('Instructions only, no description.')
  })
})
