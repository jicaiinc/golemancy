import { test, expect } from '../fixtures'

test.describe('Skill API', () => {
  let projectId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()

    const project = await helper.createProjectViaApi('Skill API Test')
    projectId = project.id
  })

  // ===== CRUD =====

  let skillId: string
  let skillId2: string

  test('POST /skills creates a skill', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/skills`, {
      name: 'Summarize',
      description: 'Summarizes text into bullet points',
      instructions: 'Take the input text and produce a concise bullet-point summary.',
    })
    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.id).toBeDefined()
    expect(data.name).toBe('Summarize')
    skillId = data.id
  })

  test('GET /skills lists skills including created one', async ({ helper }) => {
    const list = await helper.apiGet(`/api/projects/${projectId}/skills`)
    expect(Array.isArray(list)).toBe(true)
    const found = list.find((s: any) => s.id === skillId)
    expect(found).toBeDefined()
  })

  test('GET /skills/:id returns full skill', async ({ helper }) => {
    const skill = await helper.apiGet(`/api/projects/${projectId}/skills/${skillId}`)
    expect(skill.id).toBe(skillId)
    expect(skill.name).toBe('Summarize')
    expect(skill.description).toBe('Summarizes text into bullet points')
    expect(skill.instructions).toBe(
      'Take the input text and produce a concise bullet-point summary.',
    )
  })

  test('PATCH /skills/:id updates name and instructions', async ({ helper }) => {
    const updated = await helper.apiPatch(`/api/projects/${projectId}/skills/${skillId}`, {
      name: 'Summarize V2',
      instructions: 'Produce a two-sentence summary.',
    })
    expect(updated.name).toBe('Summarize V2')
    expect(updated.instructions).toBe('Produce a two-sentence summary.')
  })

  test('POST /skills creates a second skill', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/skills`, {
      name: 'Translate',
      description: 'Translates text',
      instructions: 'Translate the given text to the target language.',
    })
    expect(response.status()).toBe(201)
    const data = await response.json()
    skillId2 = data.id
  })

  test('DELETE /skills/:id deletes unreferenced skill', async ({ helper }) => {
    const result = await helper.apiDelete(`/api/projects/${projectId}/skills/${skillId2}`)
    expect(result.ok).toBe(true)
  })

  test('DELETE /skills/:id returns 409 when skill is referenced by agent', async ({ helper }) => {
    // Create an agent that references the skill
    await helper.createAgentViaApi(projectId, 'Skill Ref Agent', {
      skillIds: [skillId],
    } as any)

    const response = await helper.apiDeleteRaw(`/api/projects/${projectId}/skills/${skillId}`)
    expect(response.status()).toBe(409)
    const body = await response.json()
    expect(body.error).toBeDefined()
    expect(body.agents).toBeDefined()
    expect(body.agents.length).toBeGreaterThanOrEqual(1)
  })

  test('POST /skills with empty name returns 400', async ({ helper }) => {
    const response = await helper.apiPostRaw(`/api/projects/${projectId}/skills`, {
      name: '',
      description: 'Should fail',
    })
    expect(response.status()).toBe(400)
  })

  test('GET /skills lists only non-deleted skills', async ({ helper }) => {
    const list = await helper.apiGet(`/api/projects/${projectId}/skills`)
    // skillId should still exist (delete was blocked by 409), skillId2 was deleted
    const ids = list.map((s: any) => s.id)
    expect(ids).toContain(skillId)
    expect(ids).not.toContain(skillId2)
  })
})
