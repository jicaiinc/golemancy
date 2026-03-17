import { test, expect } from '../fixtures'

/**
 * Template MCP configuration validation — pure data checks, no API keys needed.
 * Creates projects from all templates and validates MCP server consistency.
 *
 * DESIGN: Consistency checks (naming, package versions) emit warnings rather
 * than hard failures. Only structural correctness (agent count, required fields)
 * uses strict assertions. This prevents template style preferences from blocking CI.
 */

// All template IDs from packages/shared/src/templates/index.ts
const ALL_TEMPLATE_IDS = [
  'writing-assistant',
  'deep-research',
  'smart-secretary',
  'translator',
  'knowledge-explorer',
  'life-manager',
  'doc-hub',
  'social-media-ops',
  'customer-service',
  'legal-compliance',
  'product-mgmt',
  'recruitment',
  'content-marketing',
  'seo-optimizer',
  'sales-pipeline',
  'financial-mgmt',
  'data-analytics',
  'academic-research',
]

test.describe('Template MCP Validation', () => {
  // Cache created projects: templateId → projectId
  const templateProjects: Record<string, string> = {}

  // Cache MCP data: templateId → mcpServers[]
  const templateMcpData: Record<string, any[]> = {}

  // Cache agent data: templateId → agents[]
  const templateAgentData: Record<string, any[]> = {}

  test.beforeAll(async ({ helper }) => {
    test.setTimeout(120_000)
    await helper.goHome()

    // Ensure defaultModel is configured (required for template creation)
    const settings = await helper.apiGet('/api/settings')
    if (!settings.defaultModel) {
      await helper.apiPatch('/api/settings', {
        defaultModel: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
      })
    }

    // Create projects from all templates in parallel-ish (sequential to avoid race)
    for (const templateId of ALL_TEMPLATE_IDS) {
      const project = await helper.apiPost('/api/projects/from-template', {
        templateId,
        name: `Validation: ${templateId}`,
      })
      templateProjects[templateId] = project.id

      // Fetch MCP servers and agents for each project
      const mcpServers = await helper.apiGet(`/api/projects/${project.id}/mcp-servers`)
      templateMcpData[templateId] = mcpServers

      const agents = await helper.apiGet(`/api/projects/${project.id}/agents`)
      templateAgentData[templateId] = agents
    }
  })

  test.afterAll(async ({ helper }) => {
    // Cleanup all created projects
    for (const pid of Object.values(templateProjects)) {
      try { await helper.apiDelete(`/api/projects/${pid}`) } catch { /* ignore */ }
    }
  })

  test('fetch server naming consistency across templates (advisory)', async () => {
    const fetchNames: { templateId: string; name: string }[] = []

    for (const [templateId, mcpServers] of Object.entries(templateMcpData)) {
      for (const server of mcpServers) {
        if (
          server.name === 'fetch' ||
          server.name === 'mcp-server-fetch' ||
          (server.command === 'uvx' && server.args?.includes('mcp-server-fetch'))
        ) {
          fetchNames.push({ templateId, name: server.name })
        }
      }
    }

    // Must find at least some fetch servers to validate
    expect(fetchNames.length).toBeGreaterThan(0)
    const uniqueNames = [...new Set(fetchNames.map(f => f.name))]

    if (uniqueNames.length !== 1) {
      const detail = fetchNames.map(f => `${f.templateId}=${f.name}`).join(', ')
      test.info().annotations.push({
        type: 'warning',
        description: `Inconsistent fetch server names (${uniqueNames.length} variants): ${detail}`,
      })
    }
  })

  test('playwright package consistency across templates (advisory)', async () => {
    const playwrightConfigs: { templateId: string; args: string[] }[] = []
    for (const [templateId, mcpServers] of Object.entries(templateMcpData)) {
      for (const server of mcpServers) {
        if (server.name === 'playwright') {
          playwrightConfigs.push({ templateId, args: server.args ?? [] })
        }
      }
    }

    if (playwrightConfigs.length === 0) {
      test.info().annotations.push({
        type: 'warning',
        description: 'No playwright MCP servers found in any template',
      })
      return
    }

    // deep-research should have a playwright MCP
    const drMcp = templateMcpData['deep-research'] ?? []
    const playwrightServer = drMcp.find((s: any) => s.name === 'playwright')
    expect(playwrightServer).toBeDefined()

    if (playwrightConfigs.length > 1) {
      const packages = playwrightConfigs.map(c => {
        return c.args.find((a: string) => !a.startsWith('-') && a !== 'npx') ?? 'unknown'
      })
      const uniquePackages = [...new Set(packages)]
      if (uniquePackages.length !== 1) {
        const detail = playwrightConfigs.map((c, i) => `${c.templateId}=${packages[i]}`).join(', ')
        test.info().annotations.push({
          type: 'warning',
          description: `Inconsistent playwright packages (${uniquePackages.length} variants): ${detail}`,
        })
      }
    }
  })

  test('all MCP servers have description fields (advisory)', async () => {
    const missing: { templateId: string; serverName: string }[] = []

    for (const [templateId, mcpServers] of Object.entries(templateMcpData)) {
      for (const server of mcpServers) {
        if (!server.description || server.description.trim() === '') {
          missing.push({ templateId, serverName: server.name })
        }
      }
    }

    if (missing.length > 0) {
      const detail = missing.map(m => `${m.templateId}/${m.serverName}`).join(', ')
      test.info().annotations.push({
        type: 'warning',
        description: `MCP servers missing description: ${detail}`,
      })
    }
  })

  test('open-websearch version specifier consistency (advisory)', async () => {
    const wsConfigs: { templateId: string; args: string[] }[] = []

    for (const [templateId, mcpServers] of Object.entries(templateMcpData)) {
      for (const server of mcpServers) {
        if (server.name === 'open-websearch') {
          wsConfigs.push({ templateId, args: server.args ?? [] })
        }
      }
    }

    if (wsConfigs.length === 0) {
      test.info().annotations.push({
        type: 'warning',
        description: 'No open-websearch MCP servers found in any template',
      })
      return
    }

    const specifiers = wsConfigs.map(c => {
      return c.args.find((a: string) => a.includes('open-websearch')) ?? 'unknown'
    })
    const uniqueSpecifiers = [...new Set(specifiers)]

    if (uniqueSpecifiers.length !== 1) {
      const detail = wsConfigs.map((c, i) => `${c.templateId}=${specifiers[i]}`).join(', ')
      test.info().annotations.push({
        type: 'warning',
        description: `Inconsistent open-websearch specifiers (${uniqueSpecifiers.length} variants): ${detail}`,
      })
    }
  })

  test('every template has at least 1 agent', async () => {
    const issues: string[] = []

    for (const templateId of ALL_TEMPLATE_IDS) {
      const agents = templateAgentData[templateId] ?? []
      if (agents.length === 0) {
        issues.push(`${templateId}: 0 agents`)
      }
      if (agents.length > 10) {
        issues.push(`${templateId}: ${agents.length} agents (excessive?)`)
      }
    }

    // This is a structural correctness check — hard fail
    expect(issues, `Agent count issues: ${issues.join(', ')}`).toHaveLength(0)
  })
})
