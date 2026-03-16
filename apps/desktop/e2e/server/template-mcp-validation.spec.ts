import { test, expect } from '../fixtures'

/**
 * Template MCP configuration validation — pure data checks, no API keys needed.
 * Creates projects from all templates and validates MCP server consistency.
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

  test('all templates use consistent fetch server naming', async () => {
    // Collect all fetch-related MCP server names across templates
    const fetchNames: { templateId: string; name: string }[] = []

    for (const [templateId, mcpServers] of Object.entries(templateMcpData)) {
      for (const server of mcpServers) {
        // Match servers that use mcp-server-fetch command or have "fetch" in the name
        if (
          server.name === 'fetch' ||
          server.name === 'mcp-server-fetch' ||
          (server.command === 'uvx' && server.args?.includes('mcp-server-fetch'))
        ) {
          fetchNames.push({ templateId, name: server.name })
        }
      }
    }

    // Ensure we actually found fetch servers to validate (not silently skipping)
    expect(fetchNames.length).toBeGreaterThan(0)
    // All fetch servers should use the same name
    if (fetchNames.length > 0) {
      const uniqueNames = [...new Set(fetchNames.map(f => f.name))]
      // Strict: all fetch servers must use a single consistent name
      expect(
        uniqueNames.length,
        `Inconsistent fetch server names: ${fetchNames.map(f => `${f.templateId}=${f.name}`).join(', ')}`,
      ).toBe(1)
    }
  })

  test('deep-research playwright package is consistent with other templates', async () => {
    const drMcp = templateMcpData['deep-research'] ?? []
    const playwrightServer = drMcp.find((s: any) => s.name === 'playwright')

    // deep-research should have a playwright MCP
    expect(playwrightServer).toBeDefined()

    // Collect all playwright MCP configs across templates
    const playwrightConfigs: { templateId: string; args: string[] }[] = []
    for (const [templateId, mcpServers] of Object.entries(templateMcpData)) {
      for (const server of mcpServers) {
        if (server.name === 'playwright') {
          playwrightConfigs.push({ templateId, args: server.args ?? [] })
        }
      }
    }

    // Ensure we found playwright configs (not silently skipping)
    expect(playwrightConfigs.length).toBeGreaterThan(0)
    // All playwright servers should use the same package
    if (playwrightConfigs.length > 1) {
      const packages = playwrightConfigs.map(c => {
        // Find the package arg (not flags like -y or --headless)
        return c.args.find((a: string) => !a.startsWith('-') && a !== 'npx') ?? 'unknown'
      })
      const uniquePackages = [...new Set(packages)]
      // Strict: all playwright servers must use a single consistent package
      expect(
        uniquePackages.length,
        `Inconsistent playwright packages: ${playwrightConfigs.map((c, i) => `${c.templateId}=${packages[i]}`).join(', ')}`,
      ).toBe(1)
    }
  })

  test('all MCP servers have description fields', async () => {
    const missing: { templateId: string; serverName: string }[] = []

    for (const [templateId, mcpServers] of Object.entries(templateMcpData)) {
      for (const server of mcpServers) {
        if (!server.description || server.description.trim() === '') {
          missing.push({ templateId, serverName: server.name })
        }
      }
    }

    // Strict: all MCP servers must have descriptions
    expect(
      missing.length,
      `MCP servers missing description: ${missing.map(m => `${m.templateId}/${m.serverName}`).join(', ')}`,
    ).toBe(0)
  })

  test('open-websearch version specifier is consistent', async () => {
    // Collect all open-websearch args across templates
    const wsConfigs: { templateId: string; args: string[] }[] = []

    for (const [templateId, mcpServers] of Object.entries(templateMcpData)) {
      for (const server of mcpServers) {
        if (server.name === 'open-websearch') {
          wsConfigs.push({ templateId, args: server.args ?? [] })
        }
      }
    }

    expect(wsConfigs.length).toBeGreaterThan(0)
    if (wsConfigs.length > 0) {
      // Extract the package specifier (the arg that contains "open-websearch")
      const specifiers = wsConfigs.map(c => {
        return c.args.find((a: string) => a.includes('open-websearch')) ?? 'unknown'
      })
      const uniqueSpecifiers = [...new Set(specifiers)]

      // Strict: all open-websearch servers must use a single consistent specifier
      expect(
        uniqueSpecifiers.length,
        `Inconsistent open-websearch specifiers: ${wsConfigs.map((c, i) => `${c.templateId}=${specifiers[i]}`).join(', ')}`,
      ).toBe(1)
    }
  })

  test('template agent count is sane (every template has at least 1 agent)', async () => {
    const issues: string[] = []

    for (const templateId of ALL_TEMPLATE_IDS) {
      const agents = templateAgentData[templateId] ?? []
      if (agents.length === 0) {
        issues.push(`${templateId}: 0 agents`)
      }
      // Also check no template has an unreasonable number of agents (e.g., > 10)
      if (agents.length > 10) {
        issues.push(`${templateId}: ${agents.length} agents (excessive?)`)
      }
    }

    expect(issues, `Agent count issues: ${issues.join(', ')}`).toHaveLength(0)
  })
})
