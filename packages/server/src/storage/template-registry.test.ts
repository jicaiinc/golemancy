import { describe, it, expect } from 'vitest'
import { PROJECT_TEMPLATES, getProjectTemplate } from '@golemancy/shared'

describe('PROJECT_TEMPLATES', () => {
  it('all template IDs are unique', () => {
    const ids = PROJECT_TEMPLATES.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all refIds within each template are unique', () => {
    for (const template of PROJECT_TEMPLATES) {
      const allRefIds = [
        ...template.skills.map(s => s.refId),
        ...template.agents.map(a => a.refId),
        ...template.teams.map(t => t.refId),
        ...template.mcpServers.map(m => m.refId),
        ...template.cronJobs.map(c => c.refId),
      ]
      expect(new Set(allRefIds).size, `Duplicate refIds in template "${template.id}"`).toBe(allRefIds.length)
    }
  })

  it('agent skillRefs resolve to existing skills', () => {
    for (const template of PROJECT_TEMPLATES) {
      const skillRefIds = new Set(template.skills.map(s => s.refId))
      for (const agent of template.agents) {
        for (const ref of agent.skillRefs ?? []) {
          expect(skillRefIds.has(ref), `Agent "${agent.refId}" refs skill "${ref}" not in template "${template.id}"`).toBe(true)
        }
      }
    }
  })

  it('agent mcpRefs resolve to existing mcpServers', () => {
    for (const template of PROJECT_TEMPLATES) {
      const mcpRefIds = new Set(template.mcpServers.map(m => m.refId))
      for (const agent of template.agents) {
        for (const ref of agent.mcpRefs ?? []) {
          expect(mcpRefIds.has(ref), `Agent "${agent.refId}" refs MCP "${ref}" not in template "${template.id}"`).toBe(true)
        }
      }
    }
  })

  it('team member agentRefs resolve to existing agents', () => {
    for (const template of PROJECT_TEMPLATES) {
      const agentRefIds = new Set(template.agents.map(a => a.refId))
      for (const team of template.teams) {
        for (const member of team.members) {
          expect(agentRefIds.has(member.agentRef), `Team "${team.refId}" refs agent "${member.agentRef}" not in template "${template.id}"`).toBe(true)
          if (member.parentAgentRef) {
            expect(agentRefIds.has(member.parentAgentRef), `Team "${team.refId}" refs parent "${member.parentAgentRef}" not in template "${template.id}"`).toBe(true)
          }
        }
      }
    }
  })

  it('cronJob targetRefs resolve to agents or teams', () => {
    for (const template of PROJECT_TEMPLATES) {
      const agentRefIds = new Set(template.agents.map(a => a.refId))
      const teamRefIds = new Set(template.teams.map(t => t.refId))
      for (const cron of template.cronJobs) {
        if (cron.targetType === 'agent') {
          expect(agentRefIds.has(cron.targetRef), `CronJob "${cron.refId}" targets agent "${cron.targetRef}" not in template "${template.id}"`).toBe(true)
        } else {
          expect(teamRefIds.has(cron.targetRef), `CronJob "${cron.refId}" targets team "${cron.targetRef}" not in template "${template.id}"`).toBe(true)
        }
      }
    }
  })

  it('defaultTarget ref resolves to valid agent or team', () => {
    for (const template of PROJECT_TEMPLATES) {
      const { type, ref } = template.defaultTarget
      if (type === 'agent') {
        const agentRefIds = new Set(template.agents.map(a => a.refId))
        expect(agentRefIds.has(ref), `defaultTarget refs agent "${ref}" not in template "${template.id}"`).toBe(true)
      } else {
        const teamRefIds = new Set(template.teams.map(t => t.refId))
        expect(teamRefIds.has(ref), `defaultTarget refs team "${ref}" not in template "${template.id}"`).toBe(true)
      }
    }
  })

  it('all templates have required fields', () => {
    for (const template of PROJECT_TEMPLATES) {
      expect(template.id).toBeTruthy()
      expect(template.name).toBeTruthy()
      expect(template.description).toBeTruthy()
      expect(template.category).toBeTruthy()
      expect(template.icon).toBeTruthy()
      expect(template.agents.length).toBeGreaterThan(0)
      expect(template.defaultTarget).toBeDefined()
    }
  })
})

describe('getProjectTemplate', () => {
  it('returns correct template by ID', () => {
    const wa = getProjectTemplate('writing-assistant')
    expect(wa).toBeDefined()
    expect(wa!.id).toBe('writing-assistant')
    expect(wa!.name).toBe('Writing Assistant')

    const dr = getProjectTemplate('deep-research')
    expect(dr).toBeDefined()
    expect(dr!.id).toBe('deep-research')
    expect(dr!.name).toBe('Deep Research')
  })

  it('returns undefined for non-existent template', () => {
    expect(getProjectTemplate('does-not-exist')).toBeUndefined()
    expect(getProjectTemplate('')).toBeUndefined()
  })
})

// ── MCP Catalog ─────────────────────────────────────────────

/**
 * Canonical specification for every MCP server used across templates.
 * Key = MCP name (must equal refId). Value = expected command + args.
 */
const MCP_CATALOG: Record<string, { command: string; args: string[] }> = {
  'open-websearch': { command: 'npx', args: ['-y', 'open-websearch'] },
  'fetch': { command: 'uvx', args: ['mcp-server-fetch'] },
  'playwright': { command: 'npx', args: ['-y', '@playwright/mcp', '--headless'] },
  'memory': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] },
  'sequential-thinking': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] },
  'filesystem': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '{{workspaceDir}}'] },
  'git': { command: 'uvx', args: ['mcp-server-git'] },
}

describe('MCP server static validation', () => {
  it('all mcpServers have required fields', () => {
    for (const template of PROJECT_TEMPLATES) {
      for (const mcp of template.mcpServers) {
        expect(mcp.name, `[${template.id}] mcp.name missing`).toBeTruthy()
        expect(mcp.transportType, `[${template.id}/${mcp.name}] transportType missing`).toBeTruthy()
        if (mcp.transportType === 'stdio') {
          expect(mcp.command, `[${template.id}/${mcp.name}] stdio mcp missing command`).toBeTruthy()
          expect(mcp.args?.length, `[${template.id}/${mcp.name}] stdio mcp missing args`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('all mcpServer names are in MCP_CATALOG', () => {
    for (const template of PROJECT_TEMPLATES) {
      for (const mcp of template.mcpServers) {
        expect(
          mcp.name in MCP_CATALOG,
          `[${template.id}] MCP "${mcp.name}" not in MCP_CATALOG — add it or fix the name`,
        ).toBe(true)
      }
    }
  })

  it('mcpServer command and args match catalog spec', () => {
    for (const template of PROJECT_TEMPLATES) {
      for (const mcp of template.mcpServers) {
        const spec = MCP_CATALOG[mcp.name]
        if (!spec) continue
        expect(mcp.command, `[${template.id}/${mcp.name}] command mismatch`).toBe(spec.command)
        expect(mcp.args, `[${template.id}/${mcp.name}] args mismatch`).toEqual(spec.args)
      }
    }
  })

  it('mcpServer name equals refId within each template', () => {
    for (const template of PROJECT_TEMPLATES) {
      for (const mcp of template.mcpServers) {
        expect(
          mcp.name,
          `[${template.id}] refId="${mcp.refId}" but name="${mcp.name}" — should be equal`,
        ).toBe(mcp.refId)
      }
    }
  })

  it('mcpServer names are unique within each template', () => {
    for (const template of PROJECT_TEMPLATES) {
      const names = template.mcpServers.map(m => m.name)
      expect(new Set(names).size, `[${template.id}] duplicate MCP names`).toBe(names.length)
    }
  })

  it('all mcpServers have description (warning only)', () => {
    const missing: string[] = []
    for (const template of PROJECT_TEMPLATES) {
      for (const mcp of template.mcpServers) {
        if (!mcp.description) {
          missing.push(`${template.id}/${mcp.name}`)
        }
      }
    }
    if (missing.length > 0) {
      console.warn(`[MCP] Missing description on: ${missing.join(', ')}`)
    }
  })
})
