import { test, expect } from '../fixtures'

test.describe('Template Creation', () => {
  test.beforeAll(async ({ helper }) => {
    await helper.goHome()

    // Ensure defaultModel is configured (required for template creation)
    const settings = await helper.apiGet('/api/settings')
    if (!settings.defaultModel) {
      await helper.apiPatch('/api/settings', {
        defaultModel: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
      })
    }
  })

  // ===== Writing Assistant Template (API) =====

  let waProjectId: string

  test('POST /projects/from-template creates writing-assistant project', async ({ helper }) => {
    const response = await helper.apiPostRaw('/api/projects/from-template', {
      templateId: 'writing-assistant',
      name: 'E2E Writing Project',
    })
    expect(response.status()).toBe(201)

    const project = await response.json()
    expect(project.id).toBeDefined()
    expect(project.name).toBe('E2E Writing Project')
    expect(project.icon).toBe('book')
    expect(project.agentCount).toBe(1)
    expect(project.defaultTargetType).toBe('agent')
    expect(project.defaultTargetId).toBeDefined()
    waProjectId = project.id
  })

  test('writing-assistant has 1 agent (Writer)', async ({ helper }) => {
    const agents = await helper.apiGet(`/api/projects/${waProjectId}/agents`)
    expect(agents).toHaveLength(1)
    expect(agents[0].name).toBe('Writer')
    expect(agents[0].systemPrompt).toContain('versatile writing expert')
    expect(agents[0].skillIds).toHaveLength(5)
    expect(agents[0].mcpServers).toEqual(['fetch'])
    expect(agents[0].builtinTools).toEqual(expect.objectContaining({
      bash: false,
      memory: true,
      browser: true,
    }))
  })

  test('writing-assistant has 5 skills', async ({ helper }) => {
    const skills = await helper.apiGet(`/api/projects/${waProjectId}/skills`)
    expect(skills).toHaveLength(5)

    const names = skills.map((s: any) => s.name).sort()
    expect(names).toEqual([
      'Brand Voice Analyzer',
      'Content Production',
      'Copy Editing',
      'Copywriting',
      'Social Content',
    ])
  })

  test('writing-assistant has 1 MCP server (fetch)', async ({ helper }) => {
    const mcpServers = await helper.apiGet(`/api/projects/${waProjectId}/mcp-servers`)
    expect(mcpServers).toHaveLength(1)
    expect(mcpServers[0].name).toBe('fetch')
    expect(mcpServers[0].transportType).toBe('stdio')
  })

  test('writing-assistant has no teams', async ({ helper }) => {
    const teams = await helper.apiGet(`/api/projects/${waProjectId}/teams`)
    expect(teams).toHaveLength(0)
  })

  // ===== Deep Research Template (API) =====

  let drProjectId: string

  test('POST /projects/from-template creates deep-research project', async ({ helper }) => {
    const response = await helper.apiPostRaw('/api/projects/from-template', {
      templateId: 'deep-research',
      name: 'E2E Research Project',
    })
    expect(response.status()).toBe(201)

    const project = await response.json()
    expect(project.id).toBeDefined()
    expect(project.name).toBe('E2E Research Project')
    expect(project.icon).toBe('compass')
    expect(project.agentCount).toBe(3)
    expect(project.defaultTargetType).toBe('team')
    expect(project.defaultTargetId).toBeDefined()
    drProjectId = project.id
  })

  test('deep-research has 3 agents with correct roles', async ({ helper }) => {
    const agents = await helper.apiGet(`/api/projects/${drProjectId}/agents`)
    expect(agents).toHaveLength(3)

    const names = agents.map((a: any) => a.name).sort()
    expect(names).toEqual(['Analyst', 'Research Lead', 'Web Researcher'])

    const lead = agents.find((a: any) => a.name === 'Research Lead')
    expect(lead.skillIds).toHaveLength(3)
    expect(lead.mcpServers).toEqual(['open-websearch'])

    const researcher = agents.find((a: any) => a.name === 'Web Researcher')
    expect(researcher.skillIds).toHaveLength(1)
    expect(researcher.mcpServers).toHaveLength(2)
    expect(researcher.mcpServers).toEqual(expect.arrayContaining(['open-websearch', 'playwright']))

    const analyst = agents.find((a: any) => a.name === 'Analyst')
    expect(analyst.skillIds).toHaveLength(2)
    expect(analyst.mcpServers).toEqual(['sequential-thinking'])
  })

  test('deep-research has 4 skills', async ({ helper }) => {
    const skills = await helper.apiGet(`/api/projects/${drProjectId}/skills`)
    expect(skills).toHaveLength(4)

    const names = skills.map((s: any) => s.name).sort()
    expect(names).toEqual([
      'Competitive Analysis',
      'Deep Research Execution',
      'Market Research',
      'Research Outline',
    ])
  })

  test('deep-research has 1 team with 3 members', async ({ helper }) => {
    const teams = await helper.apiGet(`/api/projects/${drProjectId}/teams`)
    expect(teams).toHaveLength(1)

    const team = teams[0]
    expect(team.name).toBe('Research Team')
    expect(team.members).toHaveLength(3)

    // Verify team topology: lead is root, researcher and analyst are children
    const agents = await helper.apiGet(`/api/projects/${drProjectId}/agents`)
    const leadId = agents.find((a: any) => a.name === 'Research Lead').id

    const root = team.members.find((m: any) => !m.parentAgentId)
    expect(root).toBeDefined()
    expect(root.agentId).toBe(leadId)

    const children = team.members.filter((m: any) => m.parentAgentId)
    expect(children).toHaveLength(2)
    for (const child of children) {
      expect(child.parentAgentId).toBe(leadId)
    }
  })

  test('deep-research has 3 MCP servers', async ({ helper }) => {
    const mcpServers = await helper.apiGet(`/api/projects/${drProjectId}/mcp-servers`)
    expect(mcpServers).toHaveLength(3)

    const names = mcpServers.map((m: any) => m.name).sort()
    expect(names).toEqual(['open-websearch', 'playwright', 'sequential-thinking'])
  })

  test('deep-research has 1 cron job (disabled)', async ({ helper }) => {
    const cronJobs = await helper.apiGet(`/api/projects/${drProjectId}/cron-jobs`)
    expect(cronJobs).toHaveLength(1)
    expect(cronJobs[0].name).toBe('Weekly Competitive Update')
    expect(cronJobs[0].enabled).toBe(false)
    expect(cronJobs[0].targetType).toBe('team')
  })

  // ===== Error cases =====

  test('POST /projects/from-template returns 404 for unknown template', async ({ helper }) => {
    const response = await helper.apiPostRaw('/api/projects/from-template', {
      templateId: 'non-existent-template',
    })
    expect(response.status()).toBe(404)
    const body = await response.json()
    expect(body.error).toBe('NOT_FOUND')
  })

  test('POST /projects/from-template returns 400 without templateId', async ({ helper }) => {
    const response = await helper.apiPostRaw('/api/projects/from-template', {})
    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('VALIDATION_FAILED')
  })

  // ===== Blank project regression =====

  test('POST /projects still creates a blank project (no template)', async ({ helper }) => {
    const response = await helper.apiPostRaw('/api/projects', {
      name: 'E2E Blank Project',
      description: 'No template',
      icon: 'sword',
    })
    expect(response.status()).toBe(201)

    const project = await response.json()
    expect(project.id).toBeDefined()
    expect(project.name).toBe('E2E Blank Project')
    expect(project.icon).toBe('sword')
    expect(project.description).toBe('No template')

    // Blank project has no agents (Main Agent is auto-created by UI store, not server)
    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    expect(agents).toHaveLength(0)

    // Cleanup
    await helper.apiDelete(`/api/projects/${project.id}`)
  })

  // ===== Cleanup =====

  test('cleanup: delete test projects', async ({ helper }) => {
    if (waProjectId) await helper.apiDelete(`/api/projects/${waProjectId}`)
    if (drProjectId) await helper.apiDelete(`/api/projects/${drProjectId}`)
  })
})
