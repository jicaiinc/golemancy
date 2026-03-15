import { test, expect } from '../fixtures'

/**
 * Template creation tests for all 16 remaining templates (writing-assistant and deep-research
 * are covered in template-creation.spec.ts). Each template gets its own independent test().
 */
test.describe('Template Creation — All Templates', () => {
  const createdProjectIds: string[] = []

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

  // Helper to create template and track for cleanup
  async function createFromTemplate(
    helper: any,
    templateId: string,
    name: string,
  ) {
    const response = await helper.apiPostRaw('/api/projects/from-template', {
      templateId,
      name,
    })
    expect(response.status()).toBe(201)
    const project = await response.json()
    expect(project.id).toBeDefined()
    createdProjectIds.push(project.id)
    return project
  }

  // ===== 1. smart-secretary =====

  test('smart-secretary template creates correct structure', async ({ helper }) => {
    const project = await createFromTemplate(helper, 'smart-secretary', 'E2E Smart Secretary')
    expect(project.icon).toBe('folder')
    expect(project.defaultTargetType).toBe('agent')

    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    expect(agents).toHaveLength(1)

    const skills = await helper.apiGet(`/api/projects/${project.id}/skills`)
    expect(skills).toHaveLength(3)

    const mcpServers = await helper.apiGet(`/api/projects/${project.id}/mcp-servers`)
    expect(mcpServers).toHaveLength(3)

    const teams = await helper.apiGet(`/api/projects/${project.id}/teams`)
    expect(teams).toHaveLength(0)

    const cronJobs = await helper.apiGet(`/api/projects/${project.id}/cron-jobs`)
    expect(cronJobs).toHaveLength(2)
  })

  // ===== 2. translator =====

  test('translator template creates correct structure', async ({ helper }) => {
    const project = await createFromTemplate(helper, 'translator', 'E2E Translator')
    expect(project.icon).toBe('globe')
    expect(project.defaultTargetType).toBe('agent')

    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    expect(agents).toHaveLength(1)

    const skills = await helper.apiGet(`/api/projects/${project.id}/skills`)
    expect(skills).toHaveLength(3)

    const mcpServers = await helper.apiGet(`/api/projects/${project.id}/mcp-servers`)
    expect(mcpServers).toHaveLength(2)

    const teams = await helper.apiGet(`/api/projects/${project.id}/teams`)
    expect(teams).toHaveLength(0)

    const cronJobs = await helper.apiGet(`/api/projects/${project.id}/cron-jobs`)
    expect(cronJobs).toHaveLength(0)
  })

  // ===== 3. knowledge-explorer =====

  test('knowledge-explorer template creates correct structure', async ({ helper }) => {
    const project = await createFromTemplate(helper, 'knowledge-explorer', 'E2E Knowledge Explorer')
    expect(project.icon).toBe('search')
    expect(project.defaultTargetType).toBe('agent')

    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    expect(agents).toHaveLength(1)

    const skills = await helper.apiGet(`/api/projects/${project.id}/skills`)
    expect(skills).toHaveLength(3)

    const mcpServers = await helper.apiGet(`/api/projects/${project.id}/mcp-servers`)
    expect(mcpServers).toHaveLength(4)

    const teams = await helper.apiGet(`/api/projects/${project.id}/teams`)
    expect(teams).toHaveLength(0)

    const cronJobs = await helper.apiGet(`/api/projects/${project.id}/cron-jobs`)
    expect(cronJobs).toHaveLength(0)
  })

  // ===== 4. life-manager =====

  test('life-manager template creates correct structure', async ({ helper }) => {
    const project = await createFromTemplate(helper, 'life-manager', 'E2E Life Manager')
    expect(project.icon).toBe('house')
    expect(project.defaultTargetType).toBe('agent')

    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    expect(agents).toHaveLength(1)

    const skills = await helper.apiGet(`/api/projects/${project.id}/skills`)
    expect(skills).toHaveLength(2)

    const mcpServers = await helper.apiGet(`/api/projects/${project.id}/mcp-servers`)
    expect(mcpServers).toHaveLength(3)

    const teams = await helper.apiGet(`/api/projects/${project.id}/teams`)
    expect(teams).toHaveLength(0)

    const cronJobs = await helper.apiGet(`/api/projects/${project.id}/cron-jobs`)
    expect(cronJobs).toHaveLength(0)
  })

  // ===== 5. doc-hub =====

  test('doc-hub template creates correct structure', async ({ helper }) => {
    const project = await createFromTemplate(helper, 'doc-hub', 'E2E Doc Hub')
    expect(project.icon).toBe('page')
    expect(project.defaultTargetType).toBe('agent')

    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    expect(agents).toHaveLength(1)

    const skills = await helper.apiGet(`/api/projects/${project.id}/skills`)
    expect(skills).toHaveLength(6)

    const mcpServers = await helper.apiGet(`/api/projects/${project.id}/mcp-servers`)
    expect(mcpServers).toHaveLength(2)

    const teams = await helper.apiGet(`/api/projects/${project.id}/teams`)
    expect(teams).toHaveLength(0)

    const cronJobs = await helper.apiGet(`/api/projects/${project.id}/cron-jobs`)
    expect(cronJobs).toHaveLength(0)
  })

  // ===== 6. social-media-ops =====

  test('social-media-ops template creates correct structure', async ({ helper }) => {
    const project = await createFromTemplate(helper, 'social-media-ops', 'E2E Social Media')
    expect(project.icon).toBe('phone')
    expect(project.defaultTargetType).toBe('team')

    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    expect(agents).toHaveLength(2)

    const skills = await helper.apiGet(`/api/projects/${project.id}/skills`)
    expect(skills).toHaveLength(3)

    const mcpServers = await helper.apiGet(`/api/projects/${project.id}/mcp-servers`)
    expect(mcpServers).toHaveLength(3)

    const teams = await helper.apiGet(`/api/projects/${project.id}/teams`)
    expect(teams).toHaveLength(1)
    expect(teams[0].members).toHaveLength(2)

    const cronJobs = await helper.apiGet(`/api/projects/${project.id}/cron-jobs`)
    expect(cronJobs).toHaveLength(2)
  })

  // ===== 7. customer-service =====

  test('customer-service template creates correct structure', async ({ helper }) => {
    const project = await createFromTemplate(helper, 'customer-service', 'E2E Customer Service')
    expect(project.icon).toBe('headset')
    expect(project.defaultTargetType).toBe('team')

    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    expect(agents).toHaveLength(2)

    const skills = await helper.apiGet(`/api/projects/${project.id}/skills`)
    expect(skills).toHaveLength(2)

    const mcpServers = await helper.apiGet(`/api/projects/${project.id}/mcp-servers`)
    expect(mcpServers).toHaveLength(3)

    const teams = await helper.apiGet(`/api/projects/${project.id}/teams`)
    expect(teams).toHaveLength(1)
    expect(teams[0].members).toHaveLength(2)

    const cronJobs = await helper.apiGet(`/api/projects/${project.id}/cron-jobs`)
    expect(cronJobs).toHaveLength(2)
  })

  // ===== 8. legal-compliance =====

  test('legal-compliance template creates correct structure', async ({ helper }) => {
    const project = await createFromTemplate(helper, 'legal-compliance', 'E2E Legal Compliance')
    expect(project.icon).toBe('scales')
    expect(project.defaultTargetType).toBe('team')

    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    expect(agents).toHaveLength(2)

    const skills = await helper.apiGet(`/api/projects/${project.id}/skills`)
    expect(skills).toHaveLength(4)

    const mcpServers = await helper.apiGet(`/api/projects/${project.id}/mcp-servers`)
    expect(mcpServers).toHaveLength(4)

    const teams = await helper.apiGet(`/api/projects/${project.id}/teams`)
    expect(teams).toHaveLength(1)
    expect(teams[0].members).toHaveLength(2)

    const cronJobs = await helper.apiGet(`/api/projects/${project.id}/cron-jobs`)
    expect(cronJobs).toHaveLength(0)
  })

  // ===== 9. product-mgmt =====

  test('product-mgmt template creates correct structure', async ({ helper }) => {
    const project = await createFromTemplate(helper, 'product-mgmt', 'E2E Product Mgmt')
    expect(project.icon).toBe('map')
    expect(project.defaultTargetType).toBe('team')

    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    expect(agents).toHaveLength(2)

    const skills = await helper.apiGet(`/api/projects/${project.id}/skills`)
    expect(skills).toHaveLength(3)

    const mcpServers = await helper.apiGet(`/api/projects/${project.id}/mcp-servers`)
    expect(mcpServers).toHaveLength(4)

    const teams = await helper.apiGet(`/api/projects/${project.id}/teams`)
    expect(teams).toHaveLength(1)
    expect(teams[0].members).toHaveLength(2)

    const cronJobs = await helper.apiGet(`/api/projects/${project.id}/cron-jobs`)
    expect(cronJobs).toHaveLength(2)
  })

  // ===== 10. recruitment =====

  test('recruitment template creates correct structure', async ({ helper }) => {
    const project = await createFromTemplate(helper, 'recruitment', 'E2E Recruitment')
    expect(project.icon).toBe('people')
    expect(project.defaultTargetType).toBe('team')

    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    expect(agents).toHaveLength(2)

    const skills = await helper.apiGet(`/api/projects/${project.id}/skills`)
    expect(skills).toHaveLength(1)

    const mcpServers = await helper.apiGet(`/api/projects/${project.id}/mcp-servers`)
    expect(mcpServers).toHaveLength(4)

    const teams = await helper.apiGet(`/api/projects/${project.id}/teams`)
    expect(teams).toHaveLength(1)
    expect(teams[0].members).toHaveLength(2)

    const cronJobs = await helper.apiGet(`/api/projects/${project.id}/cron-jobs`)
    expect(cronJobs).toHaveLength(0)
  })

  // ===== 11. content-marketing =====

  test('content-marketing template creates correct structure', async ({ helper }) => {
    const project = await createFromTemplate(helper, 'content-marketing', 'E2E Content Marketing')
    expect(project.icon).toBe('megaphone')
    expect(project.defaultTargetType).toBe('team')

    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    expect(agents).toHaveLength(4)

    const skills = await helper.apiGet(`/api/projects/${project.id}/skills`)
    expect(skills).toHaveLength(6)

    const mcpServers = await helper.apiGet(`/api/projects/${project.id}/mcp-servers`)
    expect(mcpServers).toHaveLength(4)

    const teams = await helper.apiGet(`/api/projects/${project.id}/teams`)
    expect(teams).toHaveLength(1)
    expect(teams[0].members).toHaveLength(4)

    const cronJobs = await helper.apiGet(`/api/projects/${project.id}/cron-jobs`)
    expect(cronJobs).toHaveLength(2)
  })

  // ===== 12. seo-optimizer =====

  test('seo-optimizer template creates correct structure', async ({ helper }) => {
    const project = await createFromTemplate(helper, 'seo-optimizer', 'E2E SEO Optimizer')
    expect(project.icon).toBe('search')
    expect(project.defaultTargetType).toBe('team')

    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    expect(agents).toHaveLength(2)

    const skills = await helper.apiGet(`/api/projects/${project.id}/skills`)
    expect(skills).toHaveLength(6)

    const mcpServers = await helper.apiGet(`/api/projects/${project.id}/mcp-servers`)
    expect(mcpServers).toHaveLength(5)

    const teams = await helper.apiGet(`/api/projects/${project.id}/teams`)
    expect(teams).toHaveLength(1)
    expect(teams[0].members).toHaveLength(2)

    const cronJobs = await helper.apiGet(`/api/projects/${project.id}/cron-jobs`)
    expect(cronJobs).toHaveLength(2)
  })

  // ===== 13. sales-pipeline =====

  test('sales-pipeline template creates correct structure', async ({ helper }) => {
    const project = await createFromTemplate(helper, 'sales-pipeline', 'E2E Sales Pipeline')
    expect(project.icon).toBe('briefcase')
    expect(project.defaultTargetType).toBe('team')

    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    expect(agents).toHaveLength(3)

    const skills = await helper.apiGet(`/api/projects/${project.id}/skills`)
    expect(skills).toHaveLength(4)

    const mcpServers = await helper.apiGet(`/api/projects/${project.id}/mcp-servers`)
    expect(mcpServers).toHaveLength(4)

    const teams = await helper.apiGet(`/api/projects/${project.id}/teams`)
    expect(teams).toHaveLength(1)
    expect(teams[0].members).toHaveLength(3)

    const cronJobs = await helper.apiGet(`/api/projects/${project.id}/cron-jobs`)
    expect(cronJobs).toHaveLength(2)
  })

  // ===== 14. financial-mgmt =====

  test('financial-mgmt template creates correct structure', async ({ helper }) => {
    const project = await createFromTemplate(helper, 'financial-mgmt', 'E2E Financial Mgmt')
    expect(project.icon).toBe('money')
    expect(project.defaultTargetType).toBe('team')

    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    expect(agents).toHaveLength(3)

    const skills = await helper.apiGet(`/api/projects/${project.id}/skills`)
    expect(skills).toHaveLength(3)

    const mcpServers = await helper.apiGet(`/api/projects/${project.id}/mcp-servers`)
    expect(mcpServers).toHaveLength(3)

    const teams = await helper.apiGet(`/api/projects/${project.id}/teams`)
    expect(teams).toHaveLength(1)
    expect(teams[0].members).toHaveLength(3)

    const cronJobs = await helper.apiGet(`/api/projects/${project.id}/cron-jobs`)
    expect(cronJobs).toHaveLength(3)
  })

  // ===== 15. data-analytics =====

  test('data-analytics template creates correct structure', async ({ helper }) => {
    const project = await createFromTemplate(helper, 'data-analytics', 'E2E Data Analytics')
    expect(project.icon).toBe('chart')
    expect(project.defaultTargetType).toBe('team')

    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    expect(agents).toHaveLength(2)

    const skills = await helper.apiGet(`/api/projects/${project.id}/skills`)
    expect(skills).toHaveLength(5)

    const mcpServers = await helper.apiGet(`/api/projects/${project.id}/mcp-servers`)
    expect(mcpServers).toHaveLength(3)

    const teams = await helper.apiGet(`/api/projects/${project.id}/teams`)
    expect(teams).toHaveLength(1)
    expect(teams[0].members).toHaveLength(2)

    const cronJobs = await helper.apiGet(`/api/projects/${project.id}/cron-jobs`)
    expect(cronJobs).toHaveLength(0)
  })

  // ===== 16. academic-research =====

  test('academic-research template creates correct structure', async ({ helper }) => {
    const project = await createFromTemplate(helper, 'academic-research', 'E2E Academic Research')
    expect(project.icon).toBe('graduation')
    expect(project.defaultTargetType).toBe('team')

    const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
    expect(agents).toHaveLength(3)

    const skills = await helper.apiGet(`/api/projects/${project.id}/skills`)
    expect(skills).toHaveLength(7)

    const mcpServers = await helper.apiGet(`/api/projects/${project.id}/mcp-servers`)
    expect(mcpServers).toHaveLength(5)

    const teams = await helper.apiGet(`/api/projects/${project.id}/teams`)
    expect(teams).toHaveLength(1)
    expect(teams[0].members).toHaveLength(3)

    const cronJobs = await helper.apiGet(`/api/projects/${project.id}/cron-jobs`)
    expect(cronJobs).toHaveLength(0)
  })

  // ===== Cleanup =====

  test('cleanup: delete all test projects', async ({ helper }) => {
    for (const id of createdProjectIds) {
      await helper.apiDelete(`/api/projects/${id}`)
    }
  })
})
