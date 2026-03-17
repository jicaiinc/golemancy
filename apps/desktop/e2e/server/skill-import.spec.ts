import AdmZip from 'adm-zip'
import { test, expect } from '../fixtures'

test.describe('Skill ZIP Import', () => {
  let projectId: string

  test.beforeAll(async ({ helper }) => {
    await helper.goHome()
    const project = await helper.createProjectViaApi('Skill Import Test')
    projectId = project.id
  })

  /** Build a ZIP buffer containing the given file entries */
  function buildZip(entries: Array<{ name: string; content: string }>): Buffer {
    const zip = new AdmZip()
    for (const entry of entries) {
      zip.addFile(entry.name, Buffer.from(entry.content, 'utf-8'))
    }
    return zip.toBuffer()
  }

  /** POST the ZIP buffer to the import-zip endpoint and return raw response */
  async function postImportZip(helper: any, window: any, buffer: Buffer) {
    const { baseUrl, token } = await helper.getServerInfo()
    return window.request.post(`${baseUrl}/api/projects/${projectId}/skills/import-zip`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: 'skills.zip',
          mimeType: 'application/zip',
          buffer,
        },
      },
    })
  }

  test('ZIP with 1 .md file creates 1 skill', async ({ helper, window }) => {
    const md = `---
name: Summarize
description: Summarizes text
---
Take input and produce bullet points.`

    const buffer = buildZip([{ name: 'summarize.md', content: md }])
    const response = await postImportZip(helper, window, buffer)
    expect(response.status()).toBe(201)

    const data = await response.json()
    expect(data.count).toBe(1)
    expect(data.imported).toHaveLength(1)
    expect(data.imported[0].name).toBe('Summarize')
  })

  test('ZIP with 3 .md files creates 3 skills', async ({ helper, window }) => {
    const files = [
      { name: 'skill-a.md', content: '---\nname: Alpha\n---\nAlpha instructions' },
      { name: 'skill-b.md', content: '---\nname: Beta\n---\nBeta instructions' },
      { name: 'skill-c.md', content: '---\nname: Gamma\n---\nGamma instructions' },
    ]

    const buffer = buildZip(files)
    const response = await postImportZip(helper, window, buffer)
    expect(response.status()).toBe(201)

    const data = await response.json()
    expect(data.count).toBe(3)
    expect(data.imported).toHaveLength(3)
    const names = data.imported.map((s: any) => s.name).sort()
    expect(names).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  test('ZIP with scripts/ directory extracts assets alongside skill', async ({ helper, window }) => {
    const zip = new AdmZip()
    zip.addFile('myskill/myskill.md', Buffer.from('---\nname: ScriptSkill\n---\nUse the helper script.'))
    zip.addFile('myskill/scripts/helper.py', Buffer.from('print("hello")'))
    const buffer = zip.toBuffer()

    const response = await postImportZip(helper, window, buffer)
    expect(response.status()).toBe(201)

    const data = await response.json()
    expect(data.count).toBe(1)
    expect(data.imported[0].name).toBe('ScriptSkill')

    // Verify the skill was actually created with correct instructions
    const skillId = data.imported[0].id
    const skill = await helper.apiGet(`/api/projects/${projectId}/skills/${skillId}`)
    expect(skill.instructions).toContain('Use the helper script')

    // Verify the script asset was actually extracted to the filesystem
    const fs = await import('fs')
    const path = await import('path')
    const dataDir = process.env.GOLEMANCY_TEST_DATA_DIR
    expect(dataDir, 'GOLEMANCY_TEST_DATA_DIR must be set').toBeDefined()
    const scriptPath = path.join(dataDir!, 'projects', projectId, 'skills', skillId, 'scripts', 'helper.py')
    expect(fs.existsSync(scriptPath), `Expected extracted asset at ${scriptPath}`).toBe(true)
    const scriptContent = fs.readFileSync(scriptPath, 'utf-8')
    expect(scriptContent).toContain('print("hello")')
  })

  test('empty ZIP returns 0 imported', async ({ helper, window }) => {
    const buffer = buildZip([])
    const response = await postImportZip(helper, window, buffer)
    expect(response.status()).toBe(201)

    const data = await response.json()
    expect(data.count).toBe(0)
    expect(data.imported).toHaveLength(0)
  })

  test('ZIP without .md files returns 0 imported', async ({ helper, window }) => {
    const buffer = buildZip([
      { name: 'readme.txt', content: 'Just a text file' },
      { name: 'data.json', content: '{"key": "value"}' },
    ])
    const response = await postImportZip(helper, window, buffer)
    expect(response.status()).toBe(201)

    const data = await response.json()
    expect(data.count).toBe(0)
    expect(data.imported).toHaveLength(0)
  })

  test('imported skill is retrievable via GET /skills/:id', async ({ helper, window }) => {
    const md = `---
name: Retrievable Skill
description: A skill for retrieval test
---
These are the skill instructions for the retrieval test.`

    const buffer = buildZip([{ name: 'retrievable.md', content: md }])
    const response = await postImportZip(helper, window, buffer)
    expect(response.status()).toBe(201)

    const data = await response.json()
    const skillId = data.imported[0].id

    const skill = await helper.apiGet(`/api/projects/${projectId}/skills/${skillId}`)
    expect(skill.id).toBe(skillId)
    expect(skill.name).toBe('Retrievable Skill')
    expect(skill.description).toBe('A skill for retrieval test')
    expect(skill.instructions).toBe('These are the skill instructions for the retrieval test.')
  })
})
